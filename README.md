# BantayBaha — Campus Flood-Reporting PWA (MVP v2.0)

Mobile-first PWA + desktop ops dashboard. Zero-auth reporting → AI triage → deduped priority queue → dispatch → tracking feedback loop. Spec: `MVP_Guideline.md`.

## Quick start

1. **Supabase** — create project → SQL Editor → run in order:
   - `supabase/migrations/000_schema.sql` (tables + RLS + storage bucket)
   - `supabase/migrations/001_dedupe_scoring.sql` (15 m dedupe + priority scoring)
   - `seed/seed.sql` (19 critical sites, 5 clusters, 7 reports — 1× 🔴 dedupe demo count=3)
2. **Config** — copy `js/supabase-config.example.js` → `js/supabase-config.js` and paste `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (anon key, RLS-protected).
3. **Vision** — deploy `supabase/functions/vision-triage` → set secrets `GEMINI_API_KEY` / `OPENROUTER_API_KEY` → `USE_MOCK_VISION=true` for demo insurance (heuristic fallback).
4. **Serve** — `npx serve .` or VS Code Live Server on `https://` or `localhost` (camera requires secure context) → open `index.html` (PWA) and `pages/tracking.html?id=TRK-XXXX`.

## Project structure

- `index.html` — PWA shell (report view on mobile, dashboard on desktop) + Leaflet maps
- `pages/tracking.html` — “Check My Report” lookup by `tracking_id` (status, severity, mini-map, timeline)
- `js/app.js` — report submit, vision call, offline queue (`localStorage`), pin drag, toast
- `js/camera.js` — camera capture + file fallback + volume/Enter shutter
- `js/admin.js` — ops map/queue/counters/MT3D, drawer (photo + AI summary + status history + admin edits)
- `js/vision.js` — `heuristicVision` + `callVisionEdge` (Edge Function)
- `js/supabase.js` / `js/supabase-config.js` — Supabase client + anon session
- `supabase/functions/vision-triage/index.ts` — Gemini → OpenRouter → heuristic, `quarantined` flag, `USE_MOCK_VISION`
- `supabase/migrations/` — `000_schema.sql`, `001_dedupe_scoring.sql`
- `seed/seed.sql` — one-command demo reset (see `DEMO.md`)
- `seed/photos/` — 5 CC Wikimedia + 2 trap images (selfie/cat) for quarantine demo, EXIF stripped, `manifest.json` with expected hazard/severity/coords
- `seed/map/critical_sites.coords.json` — 19 OSM-derived pins (approximate, never present as official)
- `seed/tools/` — `download_web_images.py`, `list_commons_candidates.py`, `verify_commons_files.py`, `verify_seed_distances.py`
- `manifest.webmanifest` + `service-worker.js` + `bantaybaha-*.png` — PWA install + offline shell
- `styles/main.css` — design system
- `DEMO.md` — 3-minute two-presenter script + pre-flight checklist

## Spec mapping

- **Module A (PWA):** zero-auth, geotag + drag pin, photo-less fallback, 3 hazard chips, landmark, tracking ID → `pages/tracking.html`
- **Module B (Engine):** vision triage + `USE_MOCK_VISION`, 15 m same-category dedupe, priority `Severity*0.40 + Density*0.35 + Proximity*0.25`, quarantine `spam/irrelevant → Quarantined → Under verification`
- **Module C (Admin):** Leaflet OSM, color by score, ranked queue (5 s poll), drawer with AI rationale + timeline, `Pending → In Progress (amber) → Cleared`, counters, MT3D
- **Data:** `reports`, `clusters`, `critical_sites`, `status_events` + `report-photos` bucket

## Demo

See `DEMO.md` — reset DB, set `USE_MOCK_VISION`, pre-open dashboard at `10.7155,122.5664` z18, QR large, trap photo for quarantine.
