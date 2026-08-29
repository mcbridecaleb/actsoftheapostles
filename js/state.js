/**
 * state.js — pub/sub event bus (EventTarget wrapper) plus shared UI state.
 *
 * Modules communicate only through `emit`/`on` with names from EVENTS in
 * config.js. `state` holds the current transient hover, sticky selection, and
 * the set of visible journeys; main.js keeps it updated from bus events so
 * every module reads one consistent source.
 */

const bus = new EventTarget();

/**
 * Subscribe to a bus event. The handler receives the event's detail payload.
 * @param {string} name event name from EVENTS
 * @param {(detail: any) => void} handler
 */
export function on(name, handler) {
  bus.addEventListener(name, (event) => handler(event.detail));
}

/**
 * Publish a bus event with an optional detail payload.
 * @param {string} name event name from EVENTS
 * @param {any} [detail]
 */
export function emit(name, detail = null) {
  bus.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Shared UI state. hover/selection are `{type, id}` (SELECTION_TYPES) or null;
 * visibleJourneys holds journey ids currently shown on the map.
 */
export const state = {
  hover: null,
  selection: null,
  visibleJourneys: new Set(),
};
