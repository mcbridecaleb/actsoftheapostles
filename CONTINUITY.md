# CONTINUITY.md — Continuity Ledger

- Goal (incl. success criteria):
    - Ship the "Acts of the Apostles — Geographic Visual Explorer": a zero-build static site
      (GitHub Pages-ready) with a Leaflet map (DARE ancient-world tiles + modern fallback,
      all Acts places, 4 toggleable journey routes), an SVG dual-axis timeline (AD 28-64 +
      Acts chapter blocks on one shared x(year) scale), and a callout panel — all
      cross-highlighted via a pub/sub event bus.
    - Success: `python3 tools/build_data.py --check` exits 0; all assets serve HTTP 200 under
      `python3 -m http.server`; every journeys.json place id exists in places.json; every DOM
      id referenced in JS exists in index.html; committed locally on main.
- Constraints/Assumptions:
    - No framework, no build step; Leaflet 1.9.4 from cdnjs with SRI hashes; all fetch paths
      relative (works under a /actsoftheapostles/ project-pages path); .nojekyll present.
    - tools/build_data.py is Python 3 stdlib only, typed, line length <= 160.
    - Chronology follows Pentecost AD 30 anchoring (AD 30-vs-33 dispute disclosed in README
      and callout); chapters 1-11 flagged high-uncertainty (hatched + "c. AD ...").
    - Licensing: code MIT; derived data CC BY-SA; attributions for DARE (CC BY 4.0),
      OpenBible.info (CC BY), Theographic (CC BY-SA) in footer + README.
- Key decisions:
    - KML folder = one place; representative point picked as styleUrl "representative" >
      landpoint > first; precision flag "exact"/"approximate"; KML lon,lat swapped to
      separate lat/lon fields.
    - Theographic join by displayTitle/kjvName/esvName/aliases with NAME_ALIASES table and
      curly-quote normalization; multi-row matches resolved by nearest coordinates.
      Result: 107 places, 0 unmatched. SUPPLEMENTAL_PLACES exists but is empty (every
      journey stop is present in the KML, incl. Neapolis).
    - journeys.json hand-authored (J1/J2/J3/Rome as ordered {from,to,mode,via?} segments);
      sea legs drawn as dashed quadratic-bezier bows (single `via` acts as control point).
    - Timeline overlap resolution: monotonic midpoint boundaries with 0.5-year minimum block
      width, blocks clamped back inside their true spans; Acts 11 ends AD 43 so the Acts 12
      block starts at the AD 44 tick.
    - Acts 18 belongs to J2 and J3 -> its timeline block splits into two color stripes.
    - Journey colors defined once in js/config.js; main.js exports them to CSS custom props.
- State:
    - Milestone: 6 of 6 — SHIPPED. Live at https://mcbridecaleb.github.io/actsoftheapostles/
      (repo mcbridecaleb/actsoftheapostles, public, Pages from main root).
    - Branch/Commit: main, initial commit + markdown-link fix commit (created this session).
    - Related tickets/links: none (NOISSUE).
    - Last updated: 2026-08-29 16:45 CT
- Done:
    - Data pipeline: raw sources checked into tools/raw/; build_data.py generates
      data/places.json (107 places, 0 unmatched) + data/timeline.json (28 chapters,
      81 dated Acts events); --check validates JSON, spot-checks Jerusalem/Rome/Ephesus
      coords, and verifies journeys.json id references.
    - Front end: index.html, css/styles.css, js/{config,state,data,map,timeline,callout,main}.js
      (all pass node --check); README.md; .nojekyll.
    - Verification: --check exit 0; json.tool passes on all three data files; all page assets
      HTTP 200 via local server; DOM-id and journey-id cross-checks scripted and passing.
    - Visual verification (headless Chromium via Playwright): DARE tiles render; 4 routes
      draw with solid land / dashed bezier sea legs; hover place -> callout card + chapter
      highlight; click chapter (Acts 27) -> map fitBounds + chapter card; Escape clears;
      zero console errors.
    - Fix: strip_markdown_links() added to tools/build_data.py — Easton's dictText contained
      raw markdown links ([Acts 18:12](/acts#...)) that rendered literally in the callout;
      data/places.json regenerated (107 places, 0 unmatched, --check exit 0).
- Now:
    - Verse-section strip: timeline.json now carries 79 sections (build_sections in
      build_data.py, from theographic events with locations; ACTS_VERSE_COUNTS positions
      them within chapter blocks). Collapsed 8px sliver row under the chapters expands to
      42px on hover (body.timeline-expanded grows the grid row); hovering a section
      highlights its places on the map + shows a section card; clicking fits the map.
      Chapter hover now also highlights that chapter's places on the map.
    - Smoother map wheel zoom: zoomSnap 0.25 / zoomDelta 0.5 / wheelPxPerZoomLevel 120.
    - Design modernization MERGED (fast-forward to 884f291): design-token CSS rewrite
      (warm neutrals, Inter/Newsreader webfonts, brand mark header, pill-chip journey
      toggles, card callout, refined timeline/Leaflet styling), refined journey palette
      in config.js. Screenshots reviewed + functional smoke re-run post-merge: all pass.
      Worktree/branch worktree-agent-ab57c0593cdf461b4 left in place (user's git rules:
      never delete branches unasked) — safe to remove once satisfied:
      `git worktree remove .claude/worktrees/agent-ab57c0593cdf461b4 && git branch -d worktree-agent-ab57c0593cdf461b4`.
    - Post-ship tweaks: H hotkey resets map to home view (KEYS + EVENTS.VIEW_RESET in
      config.js, emitted by main.js keydown, handled in map.js; help tip added); route
      line opacity lowered 0.85 -> 0.55 (ROUTE_STYLE in config.js). Verified in headless
      Chromium (view resets, selection retained, zero console errors).
    - Shipped. Pushed to origin (existing empty repo Caleb pre-created; flipped private ->
      public with user approval), Pages enabled, live page + all css/js/data assets verified
      HTTP 200.
- Next:
    1. Optional polish: tune sea-leg `via` waypoints visually; consider marker clustering at
       low zoom if Jerusalem-area markers feel crowded.
    2. Optional: mini-routes for early Acts movements (Philip in ch. 8, Peter in 9-10,
       Paul's conversion road in 9).
- Open questions (UNCONFIRMED if needed):
    - None blocking. UNCONFIRMED: DARE tile-host uptime (single academic server) — modern
      fallback layer doubles as the outage fallback.
- Working set (files/ids/commands):
    - Files touched: index.html, css/styles.css, js/*.js (7 modules), data/*.json (3),
      tools/build_data.py, tools/raw/{acts.kml,Places.csv,Events.csv}, README.md,
      CONTINUITY.md, .nojekyll.
    - Commands/tests run (results): `python3 tools/build_data.py` (107 places, 0 unmatched);
      `python3 tools/build_data.py --check` (exit 0); `node --check js/*.js` (all pass);
      `python3 -m http.server 8000` + curl of every asset (all 200).
    - CI status: none configured (static site).
