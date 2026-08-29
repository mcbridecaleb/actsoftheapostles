/**
 * main.js — bootstrap: load data, wire shared state to the bus, initialize the
 * map/timeline/callout modules, and build the journey toggle checkboxes.
 */

import { EVENTS, SELECTION_TYPES, JOURNEY_COLORS, KEYS } from './config.js';
import { on, emit, state } from './state.js';
import { loadData } from './data.js';
import { initMap } from './map.js';
import { initTimeline } from './timeline.js';
import { initCallout } from './callout.js';

/**
 * Keep the shared state object current from bus events. Registered before any
 * module so every module handler reads up-to-date hover/selection.
 */
function wireState() {
  on(EVENTS.PLACE_HOVER, ({ id }) => { state.hover = { type: SELECTION_TYPES.PLACE, id }; });
  on(EVENTS.PLACE_UNHOVER, () => { state.hover = null; });
  on(EVENTS.PLACE_SELECT, ({ id }) => { state.selection = { type: SELECTION_TYPES.PLACE, id }; });
  on(EVENTS.CHAPTER_HOVER, ({ chapter }) => { state.hover = { type: SELECTION_TYPES.CHAPTER, id: chapter }; });
  on(EVENTS.CHAPTER_UNHOVER, () => { state.hover = null; });
  on(EVENTS.CHAPTER_SELECT, ({ chapter }) => { state.selection = { type: SELECTION_TYPES.CHAPTER, id: chapter }; });
  on(EVENTS.SECTION_HOVER, ({ id }) => { state.hover = { type: SELECTION_TYPES.SECTION, id }; });
  on(EVENTS.SECTION_UNHOVER, () => { state.hover = null; });
  on(EVENTS.SECTION_SELECT, ({ id }) => { state.selection = { type: SELECTION_TYPES.SECTION, id }; });
  on(EVENTS.CLEAR, () => { state.hover = null; state.selection = null; });
}

/**
 * Build the journey toggle checkboxes in the header.
 * @param {object} data bundle from data.js loadData()
 */
function buildJourneyToggles(data) {
  const container = document.getElementById('journey-toggles');
  for (const journey of data.journeys) {
    const label = document.createElement('label');
    label.className = 'journey-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.visibleJourneys.add(journey.id);
      } else {
        state.visibleJourneys.delete(journey.id);
      }
      emit(EVENTS.JOURNEY_TOGGLE, { id: journey.id, visible: checkbox.checked });
    });
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.backgroundColor = JOURNEY_COLORS[journey.id];
    const text = document.createElement('span');
    text.textContent = journey.name;
    text.title = journey.ref;
    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(text);
    container.appendChild(label);
  }
}

/** Bootstrap the app. */
async function bootstrap() {
  // Expose journey colors to CSS as custom properties (single source: config.js).
  for (const [journeyId, color] of Object.entries(JOURNEY_COLORS)) {
    document.documentElement.style.setProperty(`--journey-${journeyId}`, color);
  }
  let data;
  try {
    data = await loadData();
  } catch (error) {
    const callout = document.getElementById('callout');
    callout.replaceChildren();
    const message = document.createElement('p');
    message.className = 'callout-caveat';
    message.textContent = `Could not load data: ${error.message}`;
    callout.appendChild(message);
    return;
  }
  state.visibleJourneys = new Set(data.journeys.map((journey) => journey.id));
  wireState();
  initMap(data);
  initTimeline(data);
  initCallout(data);
  buildJourneyToggles(data);
  document.addEventListener('keydown', (event) => {
    if (event.key === KEYS.CLEAR) {
      emit(EVENTS.CLEAR);
    } else if (event.key.toLowerCase() === KEYS.HOME) {
      emit(EVENTS.VIEW_RESET);
    }
  });
}

bootstrap();
