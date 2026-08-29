/**
 * timeline.js — dual-axis SVG timeline: year ticks (AD 28-64) on top, Acts
 * chapter blocks beneath, both positioned by one shared linear x(year) scale.
 *
 * Chapter blocks are sized by their real year span; same-year chapter runs are
 * separated by monotonic minimum-width boundaries so nothing overlaps. High-
 * uncertainty chapters get hatched borders and a "c. AD ..." label. Journey
 * color bands sit between the axis and the chapter row. Re-renders on resize.
 */

import {
  EVENTS,
  SELECTION_TYPES,
  JOURNEY_COLORS,
  UNCERTAINTY,
  TIMELINE_LAYOUT,
} from './config.js';
import { on, emit, state } from './state.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create a namespaced SVG element with attributes.
 * @param {string} tag
 * @param {Record<string, string|number>} attrs
 * @returns {SVGElement}
 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, String(value));
  }
  return el;
}

/**
 * Human-readable year range for a chapter ("AD 50-52", "c. AD 30").
 * @param {object} chapter timeline.json chapter record
 * @returns {string}
 */
export function chapterYearsLabel(chapter) {
  const prefix = chapter.uncertainty === UNCERTAINTY.HIGH ? 'c. AD ' : 'AD ';
  const range = chapter.startYear === chapter.endYear
    ? String(chapter.startYear)
    : `${chapter.startYear}–${chapter.endYear}`;
  return prefix + range;
}

/**
 * Compute non-overlapping fractional-year intervals for the chapter blocks.
 * Boundaries between consecutive chapters are midpoints of (end_i+1, start_i+1),
 * forced monotonic with a minimum width; each block is then clamped back inside
 * its own true year span where possible.
 * @param {object[]} chapters ordered timeline.json chapter records
 * @returns {Map<number, {left: number, right: number}>}
 */
function computeIntervals(chapters) {
  const n = chapters.length;
  const boundaries = new Array(n + 1);
  boundaries[0] = chapters[0].startYear;
  for (let i = 0; i < n - 1; i += 1) {
    const raw = (chapters[i].endYear + 1 + chapters[i + 1].startYear) / 2;
    boundaries[i + 1] = Math.max(raw, boundaries[i] + TIMELINE_LAYOUT.minBlockYears);
  }
  boundaries[n] = Math.max(chapters[n - 1].endYear + 1, boundaries[n - 1] + TIMELINE_LAYOUT.minBlockYears);
  const intervals = new Map();
  for (let i = 0; i < n; i += 1) {
    const left = Math.max(boundaries[i], chapters[i].startYear);
    const right = Math.max(Math.min(boundaries[i + 1], chapters[i].endYear + 1), left + TIMELINE_LAYOUT.minBlockYears);
    intervals.set(chapters[i].chapter, { left, right });
  }
  return intervals;
}

/**
 * Initialize the timeline inside #timeline and wire bus events.
 * @param {object} data bundle from data.js loadData()
 */
export function initTimeline(data) {
  const container = document.getElementById('timeline');
  const intervals = computeIntervals(data.chapters);
  const blocksByChapter = new Map();

  /** Chapters to emphasize for the current hover/selection (place or chapter). */
  function highlightedChapters() {
    const chapters = new Set();
    for (const ref of [state.selection, state.hover]) {
      if (!ref) {
        continue;
      }
      if (ref.type === SELECTION_TYPES.CHAPTER) {
        chapters.add(ref.id);
      } else if (ref.type === SELECTION_TYPES.PLACE) {
        const place = data.placesById.get(ref.id);
        for (const chapter of place?.chapters || []) {
          chapters.add(chapter);
        }
      }
    }
    return chapters;
  }

  /** Apply highlight classes without a full re-render. */
  function refreshHighlights() {
    const highlighted = highlightedChapters();
    for (const [chapter, group] of blocksByChapter) {
      group.classList.toggle('highlighted', highlighted.has(chapter));
    }
  }

  /** Full SVG rebuild sized to the container. */
  function render() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) {
      return;
    }
    blocksByChapter.clear();
    container.replaceChildren();
    const svg = svgEl('svg', { width, height, role: 'img', 'aria-label': 'Acts chapters by year, AD 28 to 64' });

    const defs = svgEl('defs');
    const pattern = svgEl('pattern', {
      id: 'uncertainty-hatch',
      width: 6,
      height: 6,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)',
    });
    pattern.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'hatch-line' }));
    defs.appendChild(pattern);
    svg.appendChild(defs);

    const { paddingLeft, paddingRight, yearLabelY, axisY, tickLength, bandTop, bandHeight, blockTop, blockBottom } = TIMELINE_LAYOUT;
    const span = data.yearEnd - data.yearStart;
    const innerWidth = width - paddingLeft - paddingRight;

    /** The one shared scale: fractional year -> x pixel. */
    const x = (year) => paddingLeft + ((year - data.yearStart) / span) * innerWidth;

    // Year axis.
    svg.appendChild(svgEl('line', { x1: x(data.yearStart), y1: axisY, x2: x(data.yearEnd), y2: axisY, class: 'axis-line' }));
    for (let year = data.yearStart; year <= data.yearEnd; year += 1) {
      const isLabeled = year % TIMELINE_LAYOUT.labelEveryYears === 0;
      svg.appendChild(svgEl('line', {
        x1: x(year), y1: axisY, x2: x(year), y2: axisY + (isLabeled ? tickLength + 2 : tickLength),
        class: isLabeled ? 'axis-tick major' : 'axis-tick',
      }));
      if (isLabeled) {
        const label = svgEl('text', { x: x(year), y: yearLabelY, class: 'axis-label', 'text-anchor': 'middle' });
        label.textContent = `AD ${year}`;
        svg.appendChild(label);
      }
    }

    // Journey color bands.
    for (const journey of data.journeys) {
      const band = svgEl('rect', {
        x: x(journey.startYear),
        y: bandTop,
        width: Math.max(x(journey.endYear + 1) - x(journey.startYear), 2),
        height: bandHeight,
        rx: 2,
        fill: JOURNEY_COLORS[journey.id],
        class: 'journey-band',
      });
      const title = svgEl('title');
      title.textContent = `${journey.name} (${journey.ref})`;
      band.appendChild(title);
      svg.appendChild(band);
    }

    // Chapter blocks.
    const blockHeight = Math.max(height - blockTop - blockBottom, 20);
    for (const chapter of data.chapters) {
      const { left, right } = intervals.get(chapter.chapter);
      const blockX = x(left);
      const blockWidth = Math.max(x(right) - x(left) - 1, 3);
      const group = svgEl('g', { class: 'chapter-block', tabindex: 0 });
      const journeyIds = chapter.journeys || [];
      if (journeyIds.length === 0) {
        group.appendChild(svgEl('rect', {
          x: blockX, y: blockTop, width: blockWidth, height: blockHeight, rx: 2,
          fill: TIMELINE_LAYOUT.neutralBlockColor, class: 'block-fill',
        }));
      } else {
        // A chapter in multiple journeys (Acts 18) splits into horizontal stripes.
        const stripeHeight = blockHeight / journeyIds.length;
        journeyIds.forEach((journeyId, index) => {
          group.appendChild(svgEl('rect', {
            x: blockX, y: blockTop + index * stripeHeight, width: blockWidth, height: stripeHeight, rx: 2,
            fill: JOURNEY_COLORS[journeyId], class: 'block-fill',
          }));
        });
      }
      if (chapter.uncertainty === UNCERTAINTY.HIGH) {
        group.appendChild(svgEl('rect', {
          x: blockX, y: blockTop, width: blockWidth, height: blockHeight, rx: 2,
          fill: 'url(#uncertainty-hatch)', class: 'block-hatch',
        }));
      }
      group.appendChild(svgEl('rect', {
        x: blockX, y: blockTop, width: blockWidth, height: blockHeight, rx: 2,
        fill: 'none', class: `block-border${chapter.uncertainty === UNCERTAINTY.HIGH ? ' uncertain' : ''}`,
      }));
      if (blockWidth >= TIMELINE_LAYOUT.minLabelWidth) {
        const label = svgEl('text', {
          x: blockX + blockWidth / 2, y: blockTop + blockHeight / 2 + 4,
          class: 'block-label', 'text-anchor': 'middle',
        });
        label.textContent = String(chapter.chapter);
        group.appendChild(label);
      }
      const title = svgEl('title');
      title.textContent = `Acts ${chapter.chapter} — ${chapterYearsLabel(chapter)} — ${chapter.label}`;
      group.appendChild(title);
      group.addEventListener('mouseenter', () => emit(EVENTS.CHAPTER_HOVER, { chapter: chapter.chapter }));
      group.addEventListener('mouseleave', () => emit(EVENTS.CHAPTER_UNHOVER, { chapter: chapter.chapter }));
      group.addEventListener('click', () => emit(EVENTS.CHAPTER_SELECT, { chapter: chapter.chapter }));
      blocksByChapter.set(chapter.chapter, group);
      svg.appendChild(group);
    }

    container.appendChild(svg);
    refreshHighlights();
  }

  const observer = new ResizeObserver(() => window.requestAnimationFrame(render));
  observer.observe(container);
  render();

  for (const name of [
    EVENTS.PLACE_HOVER, EVENTS.PLACE_UNHOVER, EVENTS.PLACE_SELECT,
    EVENTS.CHAPTER_HOVER, EVENTS.CHAPTER_UNHOVER, EVENTS.CHAPTER_SELECT, EVENTS.CLEAR,
  ]) {
    on(name, refreshHighlights);
  }
}
