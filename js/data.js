/**
 * data.js — fetch and index the three generated/authored JSON files.
 *
 * Produces the lookup structures every module shares: placesById,
 * placesByChapter, chaptersByNumber, journeysById, and the derived
 * journeysByPlace (place id -> Set of journey ids appearing in segments).
 */

import { DATA_PATHS } from './config.js';

/**
 * Fetch one JSON document, throwing on HTTP errors so bootstrap can report them.
 * @param {string} path relative URL
 * @returns {Promise<any>}
 */
async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Load places/timeline/journeys and build all indexes.
 * Logs (but tolerates) journey segments that reference unknown place ids.
 * @returns {Promise<object>} the shared data bundle
 */
export async function loadData() {
  const [placesDoc, timelineDoc, journeysDoc] = await Promise.all([
    fetchJson(DATA_PATHS.places),
    fetchJson(DATA_PATHS.timeline),
    fetchJson(DATA_PATHS.journeys),
  ]);

  const places = placesDoc.places;
  const placesById = new Map(places.map((place) => [place.id, place]));

  const placesByChapter = new Map();
  for (const place of places) {
    for (const chapter of place.chapters) {
      if (!placesByChapter.has(chapter)) {
        placesByChapter.set(chapter, []);
      }
      placesByChapter.get(chapter).push(place);
    }
  }

  const chapters = timelineDoc.chapters;
  const chaptersByNumber = new Map(chapters.map((chapter) => [chapter.chapter, chapter]));

  const sections = timelineDoc.sections || [];
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  const sectionsByChapter = new Map();
  for (const section of sections) {
    if (!sectionsByChapter.has(section.chapter)) {
      sectionsByChapter.set(section.chapter, []);
    }
    sectionsByChapter.get(section.chapter).push(section);
  }

  const journeys = journeysDoc.journeys;
  const journeysById = new Map(journeys.map((journey) => [journey.id, journey]));

  const journeysByPlace = new Map();
  const missingIds = new Set();
  for (const journey of journeys) {
    for (const segment of journey.segments) {
      for (const endpoint of [segment.from, segment.to]) {
        if (!placesById.has(endpoint)) {
          missingIds.add(`${journey.id}:${endpoint}`);
          continue;
        }
        if (!journeysByPlace.has(endpoint)) {
          journeysByPlace.set(endpoint, new Set());
        }
        journeysByPlace.get(endpoint).add(journey.id);
      }
    }
  }
  if (missingIds.size > 0) {
    console.warn('journeys.json references unknown place ids:', [...missingIds].join(', '));
  }

  return {
    places,
    placesById,
    placesByChapter,
    chapters,
    chaptersByNumber,
    events: timelineDoc.events,
    sections,
    sectionsById,
    sectionsByChapter,
    yearStart: timelineDoc.yearStart,
    yearEnd: timelineDoc.yearEnd,
    journeys,
    journeysById,
    journeysByPlace,
  };
}
