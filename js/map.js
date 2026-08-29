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
  UNCERTAINTY,
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
 * Compress a sorted chapter list into a compact label: [18,19,20] -> "Acts 18–20",
 * [13,14,16] -> "Acts 13–14, 16".
 * @param {number[]} chapters
 * @returns {string}
 */
function chaptersLabel(chapters) {
  const runs = [];
  let start = chapters[0];
  let prev = chapters[0];
  for (const chapter of chapters.slice(1)) {
    if (chapter === prev + 1) {
      prev = chapter;
      continue;
    }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = chapter;
    prev = chapter;
  }
  runs.push(start === prev ? `${start}` : `${start}–${prev}`);
  return `Acts ${runs.join(', ')}`;
}

/**
 * Build the compact-facts hover tooltip for a place marker as a DOM node
 * (third-party strings go through textContent, never HTML concatenation).
 * Layout: name + journey color dots / modern location / chapters + era.
 * @param {object} place places.json record
 * @param {object} data bundle from data.js loadData()
 * @returns {HTMLElement}
 */
function placeTooltip(place, data) {
  const root = document.createElement('div');
  root.className = 'place-tooltip';
  const titleRow = document.createElement('div');
  titleRow.className = 'place-tooltip-title';
  const name = document.createElement('span');
  name.textContent = place.name;
  titleRow.appendChild(name);
  for (const journeyId of data.journeysByPlace.get(place.id) || []) {
    const dot = document.createElement('span');
    dot.className = 'place-tooltip-dot';
    dot.style.backgroundColor = JOURNEY_COLORS[journeyId];
    dot.title = data.journeysById.get(journeyId)?.name || '';
    titleRow.appendChild(dot);
  }
  root.appendChild(titleRow);
  if (place.modernName) {
    const modern = document.createElement('div');
    modern.className = 'place-tooltip-sub';
    modern.textContent = `Modern: ${place.modernName}`;
    root.appendChild(modern);
  }
  const chapterRecords = place.chapters.map((chapter) => data.chaptersByNumber.get(chapter)).filter(Boolean);
  if (chapterRecords.length > 0) {
    const startYear = Math.min(...chapterRecords.map((chapter) => chapter.startYear));
    const endYear = Math.max(...chapterRecords.map((chapter) => chapter.endYear));
    const approx = chapterRecords.some((chapter) => chapter.uncertainty === UNCERTAINTY.HIGH) ? 'c. ' : '';
    const era = startYear === endYear ? `${approx}AD ${startYear}` : `${approx}AD ${startYear}–${endYear}`;
    const line = document.createElement('div');
    line.className = 'place-tooltip-sub';
    line.textContent = `${chaptersLabel(place.chapters)} · ${era}`;
    root.appendChild(line);
  }
  return root;
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
    marker.bindTooltip(placeTooltip(place, data));
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
    const groupIds = groupHighlightIds();
    for (const [id, { marker, baseStyle }] of markers) {
      const isSelected = state.selection?.type === SELECTION_TYPES.PLACE && state.selection.id === id;
      const isHovered = state.hover?.type === SELECTION_TYPES.PLACE && state.hover.id === id;
      if (isSelected) {
        marker.setStyle({ ...baseStyle, ...MARKER_STYLE.selected });
        marker.bringToFront();
      } else if (isHovered) {
        marker.setStyle({ ...baseStyle, ...MARKER_STYLE.hover });
        marker.bringToFront();
      } else if (groupIds.has(id)) {
        marker.setStyle({ ...baseStyle, ...MARKER_STYLE.hover });
      } else {
        marker.setStyle(baseStyle);
      }
    }
  }

  /** Place ids highlighted because a chapter or verse section is hovered/selected. */
  function groupHighlightIds() {
    const ids = new Set();
    for (const ref of [state.hover, state.selection]) {
      if (!ref) {
        continue;
      }
      if (ref.type === SELECTION_TYPES.CHAPTER) {
        for (const place of data.placesByChapter.get(ref.id) || []) {
          ids.add(place.id);
        }
      } else if (ref.type === SELECTION_TYPES.SECTION) {
        for (const placeId of data.sectionsById.get(ref.id)?.placeIds || []) {
          ids.add(placeId);
        }
      }
    }
    return ids;
  }

  on(EVENTS.PLACE_HOVER, refreshMarkerStyles);
  on(EVENTS.PLACE_UNHOVER, refreshMarkerStyles);
  on(EVENTS.CLEAR, refreshMarkerStyles);
  on(EVENTS.CHAPTER_HOVER, refreshMarkerStyles);
  on(EVENTS.CHAPTER_UNHOVER, refreshMarkerStyles);
  on(EVENTS.SECTION_HOVER, refreshMarkerStyles);
  on(EVENTS.SECTION_UNHOVER, refreshMarkerStyles);
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
  on(EVENTS.SECTION_SELECT, ({ id }) => {
    refreshMarkerStyles();
    const section = data.sectionsById.get(id);
    const places = (section?.placeIds || []).map((placeId) => data.placesById.get(placeId)).filter(Boolean);
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
