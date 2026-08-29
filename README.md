# Acts of the Apostles — Geographic Visual Explorer

A zero-build static site (for GitHub Pages) that explores the book of Acts geographically:
an ancient-world map of every place named in Acts, Paul's three missionary journeys plus the
voyage to Rome, a dual-axis timeline (first-century years + Acts chapters), and a detail
panel — all cross-highlighted.

## Architecture

Plain HTML + CSS grid + vanilla ES modules. No framework, no build step, no dependencies
beyond Leaflet 1.9.4 from cdnjs (SRI-pinned).

```
index.html            CSS-grid shell (header | map | callout | timeline | footer)
css/styles.css        Layout and panel styles; journey colors arrive as CSS custom props
js/config.js          All constants: tile URLs, bounds, event-name enum, journey colors
js/state.js           Pub/sub event bus (EventTarget wrapper) + shared hover/selection state
js/data.js            Fetch + index the three JSONs; derives place -> journey membership
js/map.js             Leaflet: DARE ancient tiles + modern fallback toggle, circle markers,
                      4 journey layers (land solid, sea dashed quadratic-bezier bows)
js/timeline.js        SVG dual axis: year ticks AD 28-64 + chapter blocks on one x(year) scale,
                      plus a collapsed verse-section strip that expands on hover
js/callout.js         Right panel: legend/help, place, chapter, and section cards (textContent only)
js/main.js            Bootstrap: load data, wire state, init modules, journey toggles
data/places.json      GENERATED - all Acts places (representative point, precision flag)
data/timeline.json    GENERATED - chapter->year chronology, dated Acts events, and verse
                      sections (one per point where the narrative's location set changes)
data/journeys.json    HAND-AUTHORED - 4 journeys as ordered segments referencing place ids
tools/build_data.py   Stdlib-only Python 3 converter (see below)
tools/raw/            Checked-in sources: acts.kml, Places.csv, Events.csv
```

Components communicate only through the event bus (`PLACE_HOVER/UNHOVER/SELECT`,
`CHAPTER_HOVER/UNHOVER/SELECT`, `SECTION_HOVER/UNHOVER/SELECT`, `JOURNEY_TOGGLE`,
`VIEW_RESET`, `CLEAR`). Hover is transient; click selects. Hovering a place highlights its
chapters and sections; hovering a chapter or verse section highlights its places on the map;
clicking a chapter or section fits the map to its places. Below the chapter row sits a thin
verse-section strip — one sliver per point where the narrative's location set changes
(derived from theographic's dated events) — that expands on hover for verse-level browsing.
Press H to reset the map to its home view.

## Local development

```bash
python3 -m http.server 8000
# open http://localhost:8000/
```

(A server is required — the app fetches JSON, which file:// blocks.)

## Data pipeline

`data/places.json` and `data/timeline.json` are generated from checked-in raw sources:

```bash
# refresh the raw sources (optional)
curl -sSL -o tools/raw/acts.kml   'https://a.openbible.info/geo/kmls/acts.kml'
curl -sSL -o tools/raw/Places.csv 'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/CSV/Places.csv'
curl -sSL -o tools/raw/Events.csv 'https://raw.githubusercontent.com/robertrouse/theographic-bible-metadata/master/CSV/Events.csv'

# rebuild the generated JSON
python3 tools/build_data.py

# validate everything (JSON shape, coordinate spot-checks, journeys.json id references)
python3 tools/build_data.py --check
```

The converter parses the KML namespace-agnostically, keeps only Point placemarks, groups
candidates by place, picks a representative point (representative style > landpoint > first),
flags coordinate precision, and joins to theographic `Places.csv` by name via a
`NAME_ALIASES` table (unmatched places still ship with coordinates and verses).
`data/journeys.json` is hand-authored; `--check` verifies every place id it references.

## Chronology

Anchors: Pentecost AD 30, Agrippa I's death AD 44, Gallio's proconsulship AD 51/52,
Festus succeeding Felix AD 59.

| Chapters | Years (AD) | Notes |
|---|---|---|
| 1-2 | 30 | Ascension, Pentecost |
| 3-5 | 30-32 | Early church in Jerusalem |
| 6-7 | 32-34 | The Seven; Stephen |
| 8 | 34-35 | Philip in Samaria |
| 9 | 35-37 | Saul's conversion |
| 10-11 | 37-43 | Cornelius; Antioch |
| 12 | 44 | Agrippa I dies (anchor) |
| 13-14 | 46-48 | First journey |
| 15 | 48-49 | Jerusalem council |
| 16-17 | 49-50 | Philippi to Athens |
| 18 | 50-52 | Corinth (Gallio anchor) |
| 19 | 52-55 | Ephesus |
| 20 | 56-57 | Macedonia; Miletus |
| 21-23 | 57 | Arrest in Jerusalem |
| 24 | 57-59 | Felix |
| 25-26 | 59 | Festus; Agrippa II (anchor) |
| 27 | 59-60 | Voyage and shipwreck |
| 28 | 60-62 | Malta and Rome |

**Disclaimer:** the dating of Acts 1-11 is scholarly-contested. This site uses a
Pentecost AD 30 chronology; scholars who date the crucifixion to AD 33 shift the early
chapters about three years later. High-uncertainty chapters are hatched on the timeline
and labeled "c. AD ...". Never treat these dates as precise.

## Data sources & licensing

- **Code**: MIT.
- **Derived data** (`data/*.json`): CC BY-SA (inherits theographic's share-alike).
- [DARE](https://www.imperium.ahlfeldt.se/) map tiles — CC BY 4.0.
- [OpenBible.info Bible Geocoding](https://www.openbible.info/geo/) (`acts.kml`) — CC BY.
- [theographic-bible-metadata](https://github.com/robertrouse/theographic-bible-metadata)
  (`Places.csv`, `Events.csv`, Easton's descriptions) — CC BY-SA.
