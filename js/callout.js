/**
 * callout.js — right-hand detail panel.
 *
 * Shows a legend/help card by default, a place card on place hover/select, and
 * a chapter card on chapter hover/select. Hover content is transient (reverts
 * unless something is selected). All third-party strings (Easton's text, names)
 * are rendered via textContent — never concatenated into innerHTML.
 */

import { EVENTS, SELECTION_TYPES, JOURNEY_COLORS, PRECISION, UNCERTAINTY } from './config.js';
import { on, emit, state } from './state.js';
import { chapterYearsLabel } from './timeline.js';

/**
 * Create an element with a class and optional text (set via textContent).
 * @param {string} tag
 * @param {string} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/** Format 'Acts.18.12' as '18:12'. */
function verseLabel(ref) {
  const parts = ref.split('.');
  return `${parts[1]}:${parts[2]}`;
}

/**
 * Initialize the callout panel inside #callout and wire bus events.
 * @param {object} data bundle from data.js loadData()
 */
export function initCallout(data) {
  const container = document.getElementById('callout');

  /** Default legend/help card. */
  function renderDefault() {
    container.replaceChildren();
    container.appendChild(el('h2', 'callout-title', 'Legend & help'));
    const legend = el('ul', 'legend-list');
    for (const journey of data.journeys) {
      const item = el('li', 'legend-item');
      const swatch = el('span', 'legend-swatch');
      swatch.style.backgroundColor = JOURNEY_COLORS[journey.id];
      item.appendChild(swatch);
      item.appendChild(el('span', '', `${journey.name} (${journey.ref})`));
      legend.appendChild(item);
    }
    container.appendChild(legend);
    const tips = el('ul', 'help-list');
    for (const tip of [
      'Hover a place marker or chapter block to preview it here.',
      'Click a place to select it; click a chapter to zoom the map to its places.',
      'Solid route lines are land legs; dashed curved lines are sea legs.',
      'Use the checkboxes above the map to toggle each journey.',
      'Hatched timeline blocks mark chapters whose dating is highly uncertain.',
      'Press Escape or click open water to clear the selection.',
    ]) {
      tips.appendChild(el('li', '', tip));
    }
    container.appendChild(tips);
    container.appendChild(el('p', 'callout-note',
      'Dates follow a Pentecost AD 30 chronology (anchors: Agrippa I d. 44, Gallio 51/52, Festus 59). '
      + 'If the crucifixion is dated AD 33, early chapters shift about three years later.'));
  }

  /** Place card. */
  function renderPlace(placeId) {
    const place = data.placesById.get(placeId);
    if (!place) {
      return;
    }
    container.replaceChildren();
    container.appendChild(el('h2', 'callout-title', place.name));
    if (place.modernName) {
      container.appendChild(el('p', 'callout-subtitle', `Modern: ${place.modernName}`));
    }
    if (place.aliases.length > 0) {
      container.appendChild(el('p', 'callout-subtitle', `Also: ${place.aliases.join(', ')}`));
    }
    if (place.precision === PRECISION.APPROXIMATE) {
      const caveat = place.candidateCount > 1
        ? `Location approximate (${place.candidateCount} candidate sites).`
        : 'Location approximate (region or uncertain site).';
      container.appendChild(el('p', 'callout-caveat', caveat));
    }
    const journeyIds = [...(data.journeysByPlace.get(place.id) || [])];
    if (journeyIds.length > 0) {
      const list = el('ul', 'legend-list');
      for (const journeyId of journeyIds) {
        const journey = data.journeysById.get(journeyId);
        const item = el('li', 'legend-item');
        const swatch = el('span', 'legend-swatch');
        swatch.style.backgroundColor = JOURNEY_COLORS[journeyId];
        item.appendChild(swatch);
        item.appendChild(el('span', '', journey.name));
        list.appendChild(item);
      }
      container.appendChild(list);
    }
    if (place.description) {
      container.appendChild(el('p', 'callout-description', place.description));
    }
    const chips = el('div', 'verse-chips');
    for (const verse of place.verses) {
      const chip = el('span', 'verse-chip', verseLabel(verse));
      chip.title = verse.replace(/\./g, ' ').replace(/ (\d+) (\d+)$/, ' $1:$2');
      chips.appendChild(chip);
    }
    container.appendChild(chips);
    const button = el('button', 'callout-button', 'Show on map');
    button.addEventListener('click', () => emit(EVENTS.PLACE_SELECT, { id: place.id }));
    container.appendChild(button);
  }

  /** Chapter card. */
  function renderChapter(chapterNumber) {
    const chapter = data.chaptersByNumber.get(chapterNumber);
    if (!chapter) {
      return;
    }
    container.replaceChildren();
    container.appendChild(el('h2', 'callout-title', `Acts ${chapter.chapter}`));
    container.appendChild(el('p', 'callout-subtitle', chapterYearsLabel(chapter)));
    if (chapter.uncertainty === UNCERTAINTY.HIGH) {
      container.appendChild(el('p', 'callout-caveat', 'Dating highly uncertain (see the AD 30 vs 33 note in the legend).'));
    }
    container.appendChild(el('p', 'callout-description', chapter.label));
    for (const journeyId of chapter.journeys) {
      const journey = data.journeysById.get(journeyId);
      const item = el('p', 'legend-item');
      const swatch = el('span', 'legend-swatch');
      swatch.style.backgroundColor = JOURNEY_COLORS[journeyId];
      item.appendChild(swatch);
      item.appendChild(el('span', '', `${journey.name} (${journey.ref})`));
      container.appendChild(item);
    }
    const places = [...(data.placesByChapter.get(chapter.chapter) || [])].sort((a, b) => a.name.localeCompare(b.name));
    if (places.length > 0) {
      container.appendChild(el('h3', 'callout-subhead', `Places in this chapter (${places.length})`));
      const list = el('ul', 'place-list');
      for (const place of places) {
        const item = el('li', '');
        const button = el('button', 'place-link', place.name);
        button.addEventListener('mouseenter', () => emit(EVENTS.PLACE_HOVER, { id: place.id }));
        button.addEventListener('mouseleave', () => emit(EVENTS.PLACE_UNHOVER, { id: place.id }));
        button.addEventListener('click', () => emit(EVENTS.PLACE_SELECT, { id: place.id }));
        item.appendChild(button);
        list.appendChild(item);
      }
      container.appendChild(list);
    }
  }

  /** Re-render whatever the current state calls for (hover wins over selection). */
  function renderCurrent() {
    const ref = state.hover || state.selection;
    if (!ref) {
      renderDefault();
    } else if (ref.type === SELECTION_TYPES.PLACE) {
      renderPlace(ref.id);
    } else {
      renderChapter(ref.id);
    }
  }

  for (const name of [
    EVENTS.PLACE_HOVER, EVENTS.PLACE_UNHOVER, EVENTS.PLACE_SELECT,
    EVENTS.CHAPTER_HOVER, EVENTS.CHAPTER_UNHOVER, EVENTS.CHAPTER_SELECT, EVENTS.CLEAR,
  ]) {
    on(name, renderCurrent);
  }
  renderDefault();
}
