# BantayBaha

Static, mobile-first campus flood-reporting PWA with a desktop operations dashboard.

## Project structure

- `bantayagos-design-mockup.html` — semantic page structure and dashboard content
- `js/app.js` — report form interactions, submission feedback, and app bootstrap
- `js/camera.js` — mobile camera capture and gallery fallback
- `manifest.webmanifest` — PWA installation metadata
- `service-worker.js` — offline app-shell cache
- `bantayagos-icon.svg` — installable app icon
- `seed/photos/` — demo photo set (MVP spec §10.1): 5 CC-licensed Wikimedia
  Commons images (clogged drains, blocked storm drains, urban flooding) + 2
  trap images (selfie, cat) used to demo the vision spam filter / quarantine.
  All EXIF/GPS metadata stripped; `manifest.json` maps each file to its
  expected hazard type, severity, license/attribution, and manual campus
  seed coordinates (approximate OSM — adjust to your campus).
- `seed/tools/` — helpers to rebuild/verify the demo set:
  - `list_commons_candidates.py` — searches Wikimedia Commons for freely
    licensed candidates per topic
  - `download_web_images.py` — downloads the selection, strips EXIF/GPS,
    and (re)generates `seed/photos/manifest.json`
    (`--check` verifies files exist and contain no metadata)
  - `verify_commons_files.py` — quick URL resolution check for the selection

Serve the folder on `localhost` or HTTPS to enable mobile camera access and PWA installation. For example, use VS Code Live Server and open `bantayagos-design-mockup.html`.
