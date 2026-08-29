/**
 * map.js — Leaflet map: DARE ancient-world tiles (modern fallback toggle),
 * circle markers for every Acts place, and the four colored journey routes.
 *
 * Land segments are solid straight lines; sea segments are dashed and bowed
 * by sampling a quadratic bezier (an optional `via` waypoint steers the bow
 * around coastlines). Emits/consumes bus events for cross-highlighting.
 */

import {
  TILE_LAYERS,
  MAP_OPTIONS,
  EVENTS,
  SELECTION_TYPES,
  JOURNEY_COLORS,
  SEGMENT_MODES,
  MARKER_STYLE,
  ROUTE_STYLE,
  CHAPTER_FIT_MAX_ZOOM,
  CHAPTER_FIT_PADDING,
} from './config.js';
import { on, emit, state } from './state.js';

const L = window.L;

/**
 * Sample a quadratic bezier between two lat/lon points.
 * @param {[number, number]} from [lat, lon]
 * @param {[number, number]} to [lat, lon]
 * @param {[number, number]|null} control explicit control point, or null to bow perpendicular
 * @returns {Array<[number, number]>}
 */
function sampleBezier(from, to, control) {
  let ctrl = control;
  if (!ctrl) {
    const dLat = to[0] - from[0];
    const dLon = to[1] - from[1];
    ctrl = [
      (from[0] + to[0]) / 2 - dLon * ROUTE_STYLE.bowFactor,
      (from[1] + to[1]) / 2 + dLat * ROUTE_STYLE.bowFactor,
    ];
  }
  const points = [];
  for (let i = 0; i <= ROUTE_STYLE.bezierSamples; i += 1) {
    const t = i / ROUTE_STYLE.bezierSamples;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    points.push([
      a * from[0] + b * ctrl[0] + c * to[0],
      a * from[1] + b * ctrl[1] + c * to[1],
    ]);
  }
  return points;
}

/**
 * Build the lat/lon path for one journey segment.
 * @param {object} segment {from, to, mode, via?}
 * @param {Map<string, object>} placesById
 * @returns {Array<[number, number]>}
 */
function segmentPath(segment, placesById) {
  const from = placesById.get(segment.from);
  const to = placesById.get(segment.to);
  if (!from || !to) {
    return [];
  }
  const a = [from.lat, from.lon];
  const b = [to.lat, to.lon];
  if (segment.mode !== SEGMENT_MODES.SEA) {
    return [a, b];
  }
  const via = segment.via || [];
  if (via.length <= 1) {
    return sampleBezier(a, b, via[0] || null);
  }
  // Multiple waypoints: bow each chord of [from, ...via, to] gently.
  const anchors = [a, ...via, b];
  const points = [];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    points.push(...sampleBezier(anchors[i], anchors[i + 1], null));
  }
  return points;
}

/**
 * Initialize the map, markers, and journey layers.
 * @param {object} data bundle from data.js loadData()
 */
export function initMap(data) {
  const dare = L.tileLayer(TILE_LAYERS.dare.url, TILE_LAYERS.dare.options);
  const modern = L.tileLayer(TILE_LAYERS.modern.url, TILE_LAYERS.modern.options);
  const map = L.map('map', { ...MAP_OPTIONS, layers: [dare] });
  L.control.layers(
    { [TILE_LAYERS.dare.label]: dare, [TILE_LAYERS.modern.label]: modern },
    null,
    { collapsed: true },
  ).addTo(map);

  // Journey route layers (added below markers via a dedicated pane).
  map.createPane('routes').style.zIndex = 390;
  const journeyLayers = new Map();
  for (const journey of data.journeys) {
    const color = JOURNEY_COLORS[journey.id];
    const lines = journey.segments
      .map((segment) => {
        const path = segmentPath(segment, data.placesById);
        if (path.length < 2) {
          return null;
        }
        const line = L.polyline(path, {
          pane: 'routes',
          color,
          weight: ROUTE_STYLE.weight,
          opacity: ROUTE_STYLE.opacity,
          dashArray: segment.mode === SEGMENT_MODES.SEA ? ROUTE_STYLE.seaDashArray : null,
        });
        line.bindTooltip(`${journey.name} (${journey.ref})`, { sticky: true });
        return line;
      })
      .filter((line) => line !== null);
    const group = L.layerGroup(lines);
    journeyLayers.set(journey.id, group);
    if (state.visibleJourneys.has(journey.id)) {
      group.addTo(map);
    }
  }

  // Place markers.
  const markers = new Map();
  for (const place of data.places) {
    const isStop = data.journeysByPlace.has(place.id);
    const baseStyle = isStop ? MARKER_STYLE.journeyStop : MARKER_STYLE.base;
    const marker = L.circleMarker([place.lat, place.lon], baseStyle);
    marker.bindTooltip(place.name);
    marker.on('mouseover', () => emit(EVENTS.PLACE_HOVER, { id: place.id }));
    marker.on('mouseout', () => emit(EVENTS.PLACE_UNHOVER, { id: place.id }));
    marker.on('click', (event) => {
      L.DomEvent.stopPropagation(event);
      emit(EVENTS.PLACE_SELECT, { id: place.id });
    });
    marker.addTo(map);
    markers.set(place.id, { marker, baseStyle });
  }
  map.on('click', () => emit(EVENTS.CLEAR));

  /** Re-apply base/hover/selected styles to every marker from shared state. */
  function refreshMarkerStyles() {
    for (const [id, { marker, baseStyle }] of markers) {
      const isSelected = state.selection?.type === SELECTION_TYPES.PLACE && state.selection.id === id;
      const isHovered = state.hover?.type === SELECTION_TYPES.PLACE && state.hover.id === id;
      if (isSelected) {
        marker.setStyle({ ...baseStyle, ...MARKER_STYLE.selected });
        marker.bringToFront();
      } else if (isHovered) {
        marker.setStyle({ ...baseStyle, ...MARKER_STYLE.hover });
        marker.bringToFront();
      } else {
        marker.setStyle(baseStyle);
      }
    }
  }

  on(EVENTS.PLACE_HOVER, refreshMarkerStyles);
  on(EVENTS.PLACE_UNHOVER, refreshMarkerStyles);
  on(EVENTS.CLEAR, refreshMarkerStyles);
  on(EVENTS.PLACE_SELECT, ({ id }) => {
    refreshMarkerStyles();
    const place = data.placesById.get(id);
    if (place) {
      map.panTo([place.lat, place.lon]);
    }
  });
  on(EVENTS.CHAPTER_SELECT, ({ chapter }) => {
    refreshMarkerStyles();
    const places = data.placesByChapter.get(chapter) || [];
    if (places.length > 0) {
      const bounds = L.latLngBounds(places.map((place) => [place.lat, place.lon]));
      map.fitBounds(bounds, { maxZoom: CHAPTER_FIT_MAX_ZOOM, padding: CHAPTER_FIT_PADDING });
    }
  });
  on(EVENTS.VIEW_RESET, () => {
    map.setView(MAP_OPTIONS.center, MAP_OPTIONS.zoom);
  });
  on(EVENTS.JOURNEY_TOGGLE, ({ id, visible }) => {
    const group = journeyLayers.get(id);
    if (!group) {
      return;
    }
    if (visible) {
      group.addTo(map);
    } else {
      map.removeLayer(group);
    }
  });
}
