/**
 * config.js — every shared constant for the Acts Geographic Explorer.
 *
 * All tile URLs, map limits, event names, journey colors, and layout numbers
 * live here so the rest of the code never carries magic strings.
 */

/** Relative paths (site works under a GitHub Pages project path). */
export const DATA_PATHS = Object.freeze({
  places: 'data/places.json',
  timeline: 'data/timeline.json',
  journeys: 'data/journeys.json',
});

/** Base tile layers: DARE ancient-world raster (primary) + modern fallback. */
export const TILE_LAYERS = Object.freeze({
  dare: {
    label: 'Ancient world (DARE)',
    url: 'https://dh.gu.se/tiles/imperium/{z}/{x}/{y}.png',
    options: {
      minZoom: 4,
      maxZoom: 11,
      attribution: '<a href="https://www.imperium.ahlfeldt.se/">DARE</a>, CC BY 4.0',
    },
  },
  modern: {
    label: 'Modern (OpenStreetMap)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      minZoom: 4,
      maxZoom: 11,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
});

/** Leaflet map options: clamp panning to the eastern Mediterranean world of Acts. */
export const MAP_OPTIONS = Object.freeze({
  center: [37.0, 27.0],
  zoom: 5,
  minZoom: 4,
  maxZoom: 11,
  maxBounds: [[24, -12], [52, 48]],
  maxBoundsViscosity: 1.0,
  // Fractional zoom steps + a higher wheel threshold make scroll zooming glide instead of jump.
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 120,
  wheelDebounceTime: 25,
});

/** Event-name enum for the pub/sub bus (see state.js). */
export const EVENTS = Object.freeze({
  PLACE_HOVER: 'place-hover',
  PLACE_UNHOVER: 'place-unhover',
  PLACE_SELECT: 'place-select',
  CHAPTER_HOVER: 'chapter-hover',
  CHAPTER_UNHOVER: 'chapter-unhover',
  CHAPTER_SELECT: 'chapter-select',
  SECTION_HOVER: 'section-hover',
  SECTION_UNHOVER: 'section-unhover',
  SECTION_SELECT: 'section-select',
  JOURNEY_TOGGLE: 'journey-toggle',
  VIEW_RESET: 'view-reset',
  CLEAR: 'clear',
});

/** Keyboard shortcuts (compared case-insensitively for letter keys). */
export const KEYS = Object.freeze({ CLEAR: 'Escape', HOME: 'h' });

/** Body class that expands the verse-section strip (grid row height lives in CSS). */
export const TIMELINE_EXPANDED_CLASS = 'timeline-expanded';

/** Selection kinds stored in shared state. */
export const SELECTION_TYPES = Object.freeze({ PLACE: 'place', CHAPTER: 'chapter', SECTION: 'section' });

/** Journey route colors, keyed by journey id from data/journeys.json. */
export const JOURNEY_COLORS = Object.freeze({
  j1: '#c0392b',
  j2: '#2471a3',
  j3: '#1e8449',
  rome: '#7d3c98',
});

/** Segment travel modes used in data/journeys.json. */
export const SEGMENT_MODES = Object.freeze({ LAND: 'land', SEA: 'sea' });

/** Chronology uncertainty levels emitted by tools/build_data.py. */
export const UNCERTAINTY = Object.freeze({ HIGH: 'high', MEDIUM: 'medium', LOW: 'low' });

/** Place-coordinate precision flags emitted by tools/build_data.py. */
export const PRECISION = Object.freeze({ EXACT: 'exact', APPROXIMATE: 'approximate' });

/** Circle-marker styling (journey stops emphasized over other Acts places). */
export const MARKER_STYLE = Object.freeze({
  base: { radius: 4, color: '#ffffff', weight: 1, fillColor: '#6d6459', fillOpacity: 0.85 },
  journeyStop: { radius: 5.5, color: '#ffffff', weight: 1.5, fillColor: '#a05f1e', fillOpacity: 0.95 },
  hover: { radius: 8, weight: 2.5, color: '#f1c40f' },
  selected: { radius: 8, weight: 3, color: '#2c3e50' },
});

/** Route line styling; sea legs render dashed along a sampled bezier bow. */
export const ROUTE_STYLE = Object.freeze({
  weight: 3,
  opacity: 0.55,
  seaDashArray: '6 8',
  bezierSamples: 24,
  bowFactor: 0.15,
});

/** Max zoom when fitting the map to a chapter's places. */
export const CHAPTER_FIT_MAX_ZOOM = 8;
export const CHAPTER_FIT_PADDING = [30, 30];

/** Timeline layout constants (pixel values within the ~150px SVG strip). */
export const TIMELINE_LAYOUT = Object.freeze({
  paddingLeft: 34,
  paddingRight: 16,
  yearLabelY: 12,
  axisY: 20,
  tickLength: 5,
  bandTop: 27,
  bandHeight: 7,
  blockTop: 39,
  blockBottom: 10,
  labelEveryYears: 5,
  minBlockYears: 0.5,
  minLabelWidth: 16,
  sectionGap: 4,
  sectionCollapsedHeight: 8,
  sectionExpandedHeight: 42,
  sectionMinLabelWidth: 30,
  neutralBlockColor: '#9a8f80',
});
