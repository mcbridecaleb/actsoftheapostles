"""Build data/places.json and data/timeline.json for the Acts Geographic Explorer.

Sources (checked into tools/raw/, refresh commands in README.md):
  - acts.kml   : OpenBible.info Acts places (CC BY). Folders group candidate
                 placemarks per place; folder descriptions carry verse links.
  - Places.csv : theographic-bible-metadata places (CC BY-SA) — Easton's
                 descriptions, modern coordinates, name variants.
  - Events.csv : theographic-bible-metadata events (CC BY-SA) — dated Acts events.

Stdlib only. Run from anywhere:

    python3 tools/build_data.py            # write data/places.json + data/timeline.json
    python3 tools/build_data.py --check    # validate outputs + journeys.json references, exit non-zero on failure
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
REPO_DIR = TOOLS_DIR.parent
RAW_DIR = TOOLS_DIR / "raw"
DATA_DIR = REPO_DIR / "data"

KML_PATH = RAW_DIR / "acts.kml"
PLACES_CSV_PATH = RAW_DIR / "Places.csv"
EVENTS_CSV_PATH = RAW_DIR / "Events.csv"
PLACES_JSON_PATH = DATA_DIR / "places.json"
TIMELINE_JSON_PATH = DATA_DIR / "timeline.json"
JOURNEYS_JSON_PATH = DATA_DIR / "journeys.json"

ACTS_VERSE_RE = re.compile(r"Acts\.(\d+)\.(\d+)")

# Precision flags shipped in places.json.
PRECISION_EXACT = "exact"
PRECISION_APPROXIMATE = "approximate"

# KML styleUrl fragments (see <Style> ids in acts.kml).
STYLE_REPRESENTATIVE = "representative"
STYLE_LANDPOINT = "landpoint"
STYLE_WATER = "water"

FEATURE_LAND = "land"
FEATURE_WATER = "water"

# KML base name -> theographic displayTitle, for names that do not match by
# slug/displayTitle directly. Iterated until the unmatched list was small.
NAME_ALIASES: dict[str, str] = {
    "Antioch 1": "Antioch (Syria)",
    "Antioch 2": "Antioch (Pisidia)",
    "Aphek 2": "Aphek",
    "Babylon 1": "Babylon",
    "Cauda": "Clauda",
    "Chaldea": "Chaldea",
    "Cos": "Coos",
    "Ethiopia": "Ethiopia",
    "Forum of Appius": "Appii Forum",
    "Galilee 1": "Galilee",
    "Greece": "Greece",
    "Judea 1": "Judea",
    "Lod": "Lydda",
    "Malta": "Melita",
    "Mount of Olives": "Olivet",
    "Mount Sinai": "Sinai",
    "Nile": "Nile River",
    "Phoenix": "Phenice",
    "Red Sea 1": "Red Sea",
    "Rhodes 1": "Rhodes",
    "Samaria 2": "Samaria",
    "Sharon 1": "Saron",
    "Straight Street": "Straight Gate",
}

# Journey stops genuinely absent from acts.kml would be added here (id -> place
# record with sourced coords) instead of hand-editing generated JSON. Currently
# every journey stop is present in the KML, so this is empty.
SUPPLEMENTAL_PLACES: dict[str, dict[str, object]] = {}

# Uncertainty levels for the chronology.
UNCERTAINTY_HIGH = "high"
UNCERTAINTY_MEDIUM = "medium"
UNCERTAINTY_LOW = "low"

# Chronology anchors: Pentecost AD 30, Agrippa I's death AD 44, Gallio's
# proconsulship AD 51/52, Festus succeeding Felix AD 59. Chapters 1-11 are
# scholarly-contested (the AD 30 vs 33 crucifixion dispute shifts everything
# early) and flagged high-uncertainty. (chapter -> (start, end, uncertainty, label))
CHAPTER_YEARS: dict[int, tuple[int, int, str, str]] = {
    1: (30, 30, UNCERTAINTY_HIGH, "Ascension; Matthias chosen"),
    2: (30, 30, UNCERTAINTY_HIGH, "Pentecost"),
    3: (30, 31, UNCERTAINTY_HIGH, "Healing at the Beautiful Gate"),
    4: (31, 31, UNCERTAINTY_HIGH, "Peter and John before the council"),
    5: (31, 32, UNCERTAINTY_HIGH, "Ananias; apostles arrested"),
    6: (32, 33, UNCERTAINTY_HIGH, "The Seven chosen"),
    7: (33, 34, UNCERTAINTY_HIGH, "Stephen martyred"),
    8: (34, 35, UNCERTAINTY_HIGH, "Philip in Samaria and Gaza"),
    9: (35, 37, UNCERTAINTY_HIGH, "Saul's conversion"),
    10: (37, 40, UNCERTAINTY_HIGH, "Peter and Cornelius"),
    11: (40, 43, UNCERTAINTY_HIGH, "The church in Antioch"),
    12: (44, 44, UNCERTAINTY_LOW, "Herod Agrippa I dies"),
    13: (46, 47, UNCERTAINTY_MEDIUM, "Cyprus and Pisidian Antioch"),
    14: (47, 48, UNCERTAINTY_MEDIUM, "Iconium, Lystra, Derbe"),
    15: (48, 49, UNCERTAINTY_MEDIUM, "Jerusalem council"),
    16: (49, 50, UNCERTAINTY_MEDIUM, "Philippi"),
    17: (50, 50, UNCERTAINTY_MEDIUM, "Thessalonica, Berea, Athens"),
    18: (50, 52, UNCERTAINTY_LOW, "Corinth (Gallio)"),
    19: (52, 55, UNCERTAINTY_LOW, "Ephesus"),
    20: (56, 57, UNCERTAINTY_MEDIUM, "Macedonia; farewell at Miletus"),
    21: (57, 57, UNCERTAINTY_MEDIUM, "Arrest in Jerusalem"),
    22: (57, 57, UNCERTAINTY_MEDIUM, "Defense before the crowd"),
    23: (57, 57, UNCERTAINTY_MEDIUM, "Before the Sanhedrin; to Caesarea"),
    24: (57, 59, UNCERTAINTY_MEDIUM, "Before Felix"),
    25: (59, 59, UNCERTAINTY_LOW, "Before Festus"),
    26: (59, 59, UNCERTAINTY_LOW, "Before Agrippa II"),
    27: (59, 60, UNCERTAINTY_LOW, "Voyage and shipwreck"),
    28: (60, 62, UNCERTAINTY_LOW, "Malta and Rome"),
}

YEAR_START = 28
YEAR_END = 64

# Journey metadata mirrored in data/journeys.json (ids must stay in sync).
JOURNEY_CHAPTERS: dict[str, list[int]] = {
    "j1": [13, 14],
    "j2": [15, 16, 17, 18],
    "j3": [18, 19, 20, 21],
    "rome": [27, 28],
}


def local_tag(elem: ET.Element) -> str:
    """Return the element tag without its XML namespace."""
    return elem.tag.split("}")[-1]


def child_text(elem: ET.Element, tag_name: str) -> str | None:
    """Return the text of the first direct child with the given local tag name."""
    for child in elem:
        if local_tag(child) == tag_name:
            return child.text
    return None


def normalize_quotes(name: str) -> str:
    """Replace curly apostrophes with straight ones so name joins are punctuation-safe."""
    return name.replace("\u2019", "'").replace("\u2018", "'")


def slugify(name: str) -> str:
    """Lowercase a name and collapse non-alphanumerics to underscores."""
    return re.sub(r"[^a-z0-9]+", "_", normalize_quotes(name).lower()).strip("_")


def base_name(folder_name: str) -> str:
    """Strip ' / modern' suffixes and '(alias, ...)' parentheticals from a KML folder name."""
    name = folder_name.split(" / ")[0]
    name = re.sub(r"\s*\(.*\)\s*$", "", name)
    return name.strip()


def display_name(base: str) -> str:
    """Strip OpenBible disambiguation digits ('Rhodes 1' -> 'Rhodes') for display."""
    return re.sub(r"\s+\d+$", "", base).strip()


@dataclass
class CandidatePoint:
    """One Point placemark inside a KML place folder."""

    style_url: str
    lat: float
    lon: float
    modern_name: str | None


@dataclass
class KmlPlace:
    """All candidate points and verse references gathered for one place name."""

    base: str
    candidates: list[CandidatePoint] = field(default_factory=list)
    verses: set[str] = field(default_factory=set)
    aliases: set[str] = field(default_factory=set)


def parse_kml(path: Path) -> dict[str, KmlPlace]:
    """Parse acts.kml namespace-agnostically, grouping Point placemarks by base place name."""
    root = ET.parse(path).getroot()
    places: dict[str, KmlPlace] = {}
    for folder in root.iter():
        if local_tag(folder) != "Folder":
            continue
        folder_name = child_text(folder, "name") or ""
        if not folder_name:
            continue
        base = base_name(folder_name)
        place = places.setdefault(base, KmlPlace(base=base))
        paren = re.search(r"\(([^)]*)\)", folder_name)
        if paren:
            place.aliases.update(a.strip() for a in paren.group(1).split(","))
        description = child_text(folder, "description") or ""
        place.verses.update(f"Acts.{c}.{v}" for c, v in ACTS_VERSE_RE.findall(description))
        for placemark in folder.iter():
            if local_tag(placemark) != "Placemark":
                continue
            style_url = (child_text(placemark, "styleUrl") or "").lstrip("#")
            pm_name = child_text(placemark, "name") or ""
            modern = pm_name.split(" / ", 1)[1].strip() if " / " in pm_name else None
            for node in placemark.iter():
                if local_tag(node) != "Point":
                    continue
                coords_text = child_text(node, "coordinates") or ""
                parts = coords_text.strip().split(",")
                if len(parts) < 2:
                    continue
                # KML coordinate order is lon,lat[,alt].
                lon, lat = float(parts[0]), float(parts[1])
                place.candidates.append(CandidatePoint(style_url=style_url, lat=lat, lon=lon, modern_name=modern))
    return {base: p for base, p in places.items() if p.candidates}


def pick_representative(candidates: list[CandidatePoint]) -> CandidatePoint:
    """Pick the representative point: 'representative' style > landpoint > first."""
    for cand in candidates:
        if STYLE_REPRESENTATIVE in cand.style_url:
            return cand
    for cand in candidates:
        if cand.style_url == STYLE_LANDPOINT:
            return cand
    return candidates[0]


@dataclass
class TheographicPlace:
    """The subset of a theographic Places.csv row that we ship."""

    slug: str
    display_title: str
    lat: float | None
    lon: float | None
    dict_text: str
    comment: str


def parse_float(value: str) -> float | None:
    """Parse a CSV float field, returning None when blank or malformed."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]*\)")


def strip_markdown_links(text: str) -> str:
    """Replace markdown links like [Acts 18:12](/acts#Acts.18.12) with their plain label text."""
    return MARKDOWN_LINK_RE.sub(r"\1", text)


def load_theographic_places(path: Path) -> dict[str, list[TheographicPlace]]:
    """Index Places.csv rows by lowercased displayTitle, kjvName, esvName, and aliases."""
    index: dict[str, list[TheographicPlace]] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            place = TheographicPlace(
                slug=row["slug"].strip(),
                display_title=row["displayTitle"].strip(),
                lat=parse_float(row["latitude"]),
                lon=parse_float(row["longitude"]),
                dict_text=strip_markdown_links(row["dictText"].strip()),
                comment=row["comment"].strip(),
            )
            keys = {row["displayTitle"], row["kjvName"], row["esvName"]}
            keys.update(a.strip() for a in row["aliases"].split(",") if a.strip())
            for key in keys:
                key = normalize_quotes(key).strip().lower()
                if key:
                    index.setdefault(key, []).append(place)
    return index


def nearest_row(rows: list[TheographicPlace], lat: float, lon: float) -> TheographicPlace:
    """When a name matches several theographic rows, pick the one nearest the KML point."""

    def distance(row: TheographicPlace) -> float:
        if row.lat is None or row.lon is None:
            return math.inf
        return (row.lat - lat) ** 2 + (row.lon - lon) ** 2

    return min(rows, key=distance)


def match_theographic(
    place: KmlPlace,
    rep: CandidatePoint,
    index: dict[str, list[TheographicPlace]],
) -> TheographicPlace | None:
    """Join a KML place to theographic metadata by name, alias table, then KML aliases."""
    tried: list[str] = [display_name(place.base), place.base]
    alias = NAME_ALIASES.get(place.base)
    if alias:
        tried.insert(0, alias)
    tried.extend(place.aliases)
    for name in tried:
        rows = index.get(normalize_quotes(name).strip().lower())
        if rows:
            return nearest_row(rows, rep.lat, rep.lon)
    return None


def verse_sort_key(ref: str) -> tuple[int, int]:
    """Sort key for 'Acts.C.V' references."""
    match = ACTS_VERSE_RE.fullmatch(ref)
    if not match:
        return (999, 999)
    return (int(match.group(1)), int(match.group(2)))


def build_places(kml_places: dict[str, KmlPlace], theo_index: dict[str, list[TheographicPlace]]) -> tuple[list[dict[str, object]], list[str]]:
    """Assemble the places.json records; returns (records, unmatched KML base names)."""
    records: list[dict[str, object]] = []
    unmatched: list[str] = []
    for base in sorted(kml_places):
        place = kml_places[base]
        rep = pick_representative(place.candidates)
        theo = match_theographic(place, rep, theo_index)
        if theo is None:
            unmatched.append(base)
        verses = sorted(place.verses, key=verse_sort_key)
        chapters = sorted({int(ACTS_VERSE_RE.fullmatch(v).group(1)) for v in verses if ACTS_VERSE_RE.fullmatch(v)})
        precise = len(place.candidates) == 1 and STYLE_REPRESENTATIVE not in rep.style_url
        records.append(
            {
                "id": slugify(base),
                "name": theo.display_title if theo and theo.display_title else display_name(base),
                "aliases": sorted(place.aliases),
                "modernName": rep.modern_name or (theo.comment if theo and theo.comment.startswith("Now ") else None),
                "lat": rep.lat,
                "lon": rep.lon,
                "precision": PRECISION_EXACT if precise else PRECISION_APPROXIMATE,
                "feature": FEATURE_WATER if STYLE_WATER in rep.style_url else FEATURE_LAND,
                "candidateCount": len(place.candidates),
                "chapters": chapters,
                "verses": verses,
                "description": theo.dict_text if theo else "",
                "theographicSlug": theo.slug if theo else None,
            }
        )
    for pid, record in SUPPLEMENTAL_PLACES.items():
        supplemental = {"id": pid, **record}
        records.append(supplemental)
    return records, unmatched


"""KJV verse counts per Acts chapter, for positioning verse sections within chapter blocks."""
ACTS_VERSE_COUNTS: dict[int, int] = {
    1: 26, 2: 47, 3: 26, 4: 37, 5: 42, 6: 15, 7: 60, 8: 40, 9: 43, 10: 48,
    11: 30, 12: 25, 13: 52, 14: 28, 15: 41, 16: 40, 17: 34, 18: 28, 19: 41,
    20: 38, 21: 40, 22: 30, 23: 35, 24: 27, 25: 27, 26: 32, 27: 44, 28: 31,
}


def build_sections(events: list[dict[str, object]], records: list[dict[str, object]]) -> list[dict[str, object]]:
    """Derive verse sections per chapter: one section per point where the narrative's location set changes.

    Sections come from dated theographic events that carry locations; events sharing a first verse merge.
    Each section spans from its first verse to the verse before the next section (tiling the whole chapter);
    a chapter with no located events becomes a single whole-chapter section using all its places.
    Every place whose verse mentions fall inside a section's range is unioned into that section's placeIds,
    so section highlighting covers the same places as chapter highlighting, split by verse range.
    """
    by_chapter: dict[int, dict[int, dict[str, object]]] = {}
    for event in events:
        if not event["placeIds"] or event["chapter"] is None:
            continue
        match = ACTS_VERSE_RE.fullmatch(str(event["firstVerse"]))
        if not match:
            continue
        verse = int(match.group(2))
        bucket = by_chapter.setdefault(int(str(event["chapter"])), {})
        entry = bucket.get(verse)
        if entry is None:
            bucket[verse] = {"title": event["title"], "year": event["year"], "placeIds": set(event["placeIds"])}
        else:
            entry["placeIds"].update(event["placeIds"])  # type: ignore[union-attr]
            if entry["year"] is None:
                entry["year"] = event["year"]
    chapter_place_ids: dict[int, set[str]] = {}
    verse_place_ids: dict[tuple[int, int], set[str]] = {}
    for record in records:
        for chapter in record.get("chapters", []):
            chapter_place_ids.setdefault(int(str(chapter)), set()).add(str(record["id"]))
        for ref in record.get("verses", []):
            ref_match = ACTS_VERSE_RE.fullmatch(str(ref))
            if ref_match:
                verse_place_ids.setdefault((int(ref_match.group(1)), int(ref_match.group(2))), set()).add(str(record["id"]))
    sections: list[dict[str, object]] = []
    for chapter, (start_year, _end, _unc, label) in sorted(CHAPTER_YEARS.items()):
        count = ACTS_VERSE_COUNTS[chapter]
        bucket = by_chapter.get(chapter)
        if not bucket:
            sections.append(
                {
                    "id": f"s{chapter}-1",
                    "chapter": chapter,
                    "startVerse": 1,
                    "endVerse": count,
                    "title": label,
                    "year": start_year,
                    "placeIds": sorted(chapter_place_ids.get(chapter, set())),
                }
            )
            continue
        verses = sorted(bucket)
        for index, verse in enumerate(verses):
            entry = bucket[verse]
            start = 1 if index == 0 else verse
            end = max(verses[index + 1] - 1 if index + 1 < len(verses) else count, start)
            place_ids: set[str] = set(entry["placeIds"])  # type: ignore[arg-type]
            for verse_number in range(start, end + 1):
                place_ids.update(verse_place_ids.get((chapter, verse_number), set()))
            sections.append(
                {
                    "id": f"s{chapter}-{start}",
                    "chapter": chapter,
                    "startVerse": start,
                    "endVerse": end,
                    "title": str(entry["title"]),
                    "year": entry["year"],
                    "placeIds": sorted(place_ids),
                }
            )
    return sections


def build_timeline(records: list[dict[str, object]], events_path: Path) -> dict[str, object]:
    """Assemble timeline.json: chapter chronology plus dated Acts events."""
    slug_to_id = {r["theographicSlug"]: r["id"] for r in records if r.get("theographicSlug")}
    chapters = [
        {
            "chapter": chapter,
            "startYear": start,
            "endYear": end,
            "uncertainty": uncertainty,
            "label": label,
            "journeys": [jid for jid, chs in JOURNEY_CHAPTERS.items() if chapter in chs],
            "verseCount": ACTS_VERSE_COUNTS[chapter],
        }
        for chapter, (start, end, uncertainty, label) in sorted(CHAPTER_YEARS.items())
    ]
    events: list[dict[str, object]] = []
    with events_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            acts_verses = [v for v in row["verses"].split(",") if v.startswith("Acts.")]
            if not acts_verses:
                continue
            year_match = re.match(r"(\d{4})", row["startDate"])
            chapter_match = ACTS_VERSE_RE.fullmatch(acts_verses[0].strip())
            place_ids = sorted({slug_to_id[s.strip()] for s in row["locations"].split(",") if s.strip() in slug_to_id})
            events.append(
                {
                    "title": row["title"].strip(),
                    "year": int(year_match.group(1)) if year_match else None,
                    "chapter": int(chapter_match.group(1)) if chapter_match else None,
                    "firstVerse": acts_verses[0].strip(),
                    "placeIds": place_ids,
                }
            )
    events.sort(key=lambda e: (e["chapter"] or 0, e["firstVerse"]))
    return {"yearStart": YEAR_START, "yearEnd": YEAR_END, "chapters": chapters, "events": events, "sections": build_sections(events, records)}


def write_json(path: Path, payload: object) -> None:
    """Write pretty-printed UTF-8 JSON with a trailing newline."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def build() -> int:
    """Run the full pipeline; returns a process exit code."""
    kml_places = parse_kml(KML_PATH)
    theo_index = load_theographic_places(PLACES_CSV_PATH)
    records, unmatched = build_places(kml_places, theo_index)
    timeline = build_timeline(records, EVENTS_CSV_PATH)
    attribution = "Coordinates: OpenBible.info (CC BY); descriptions: theographic-bible-metadata / Easton's (CC BY-SA)"
    write_json(PLACES_JSON_PATH, {"attribution": attribution, "places": records})
    write_json(TIMELINE_JSON_PATH, timeline)
    print(f"places: {len(records)} ({len(unmatched)} without theographic match)", file=sys.stderr)
    if unmatched:
        print("unmatched KML names: " + ", ".join(unmatched), file=sys.stderr)
    return 0


def check() -> int:
    """Validate generated JSON, spot-check coordinates, and verify journeys.json references."""
    failures: list[str] = []
    for path in (PLACES_JSON_PATH, TIMELINE_JSON_PATH, JOURNEYS_JSON_PATH):
        if not path.exists():
            failures.append(f"missing {path.name}")
    if failures:
        for failure in failures:
            print(f"CHECK FAIL: {failure}", file=sys.stderr)
        return 1
    places_doc = json.loads(PLACES_JSON_PATH.read_text(encoding="utf-8"))
    timeline_doc = json.loads(TIMELINE_JSON_PATH.read_text(encoding="utf-8"))
    journeys_doc = json.loads(JOURNEYS_JSON_PATH.read_text(encoding="utf-8"))
    place_ids = {p["id"] for p in places_doc["places"]}
    spot_checks = {"jerusalem": (31.78, 35.23), "rome": (41.9, 12.5), "ephesus": (37.94, 27.34)}
    for pid, (want_lat, want_lon) in spot_checks.items():
        record = next((p for p in places_doc["places"] if p["id"] == pid), None)
        if record is None:
            failures.append(f"spot-check place missing: {pid}")
        elif abs(record["lat"] - want_lat) > 0.2 or abs(record["lon"] - want_lon) > 0.2:
            failures.append(f"spot-check coords off for {pid}: got ({record['lat']}, {record['lon']}), want ~({want_lat}, {want_lon})")
    if {c["chapter"] for c in timeline_doc["chapters"]} != set(range(1, 29)):
        failures.append("timeline.json must cover Acts chapters 1-28")
    journey_ids = {j["id"] for j in journeys_doc["journeys"]}
    if journey_ids != set(JOURNEY_CHAPTERS):
        failures.append(f"journeys.json ids {sorted(journey_ids)} != expected {sorted(JOURNEY_CHAPTERS)}")
    for journey in journeys_doc["journeys"]:
        for segment in journey["segments"]:
            for endpoint in (segment["from"], segment["to"]):
                if endpoint not in place_ids:
                    failures.append(f"journeys.json: unknown place id '{endpoint}' in {journey['id']}")
    for failure in failures:
        print(f"CHECK FAIL: {failure}", file=sys.stderr)
    if not failures:
        print("all checks passed", file=sys.stderr)
    return 1 if failures else 0


def main() -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="validate generated data files instead of rebuilding them")
    args = parser.parse_args()
    return check() if args.check else build()


if __name__ == "__main__":
    raise SystemExit(main())
