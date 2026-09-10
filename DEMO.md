# BantayBaha — 3-Minute Demo Script (Spec §7)

Two screens, two presenters. Pre-open both before judges arrive.

## Pre-flight (5 min before)
1. **Reset DB**: Supabase SQL Editor → run `supabase/migrations/000_schema.sql` → `001_dedupe_scoring.sql` → `seed/seed.sql` (one-command reset). Verify: 5 clusters, 7 reports, 19 critical_sites.
2. **Env**: `USE_MOCK_VISION=false` for live (or `true` for mock fallback). Set `GEMINI_API_KEY` + `OPENROUTER_API_KEY` in `supabase/functions/vision-triage` secrets.
3. **PWA**: Open `index.html` via HTTPS/Live Server. Dashboard pre-zoomed to `10.7155,122.5664` z18. QR printed large (projector contrast kills small codes).
4. **Phone**: Demo photo pre-saved (clogged drain). Camera fallback = file upload.

## Script
| T | P1 — Mobile (Report) | P2 — Dashboard (Ops) |
|---|----------------------|----------------------|
| 0:00 | Open PWA via QR | Live dashboard with seeded map (1🔴 2🟡 2🟢) |
| 0:30 | Snap photo of mock clogged drain, drag pin if needed, Submit | — |
| 0:45 | Show tracking ID + “Check My Report” link | Auto-refresh (5s): new 🔴 pin lands at #1 queue, MT3D <60s |
| 1:30 | Opens tracking link → Pending, AI severity HIGH, rationale, mini-map | Opens drawer: photo, AI summary, report_count, status history |
| 2:15 | Watches live | Pending → In Progress (pin amber #D4A017) → Cleared (pin gone) |
| 2:45 | Sees status change on tracking page | “Closed loop complete — reporter and admin in sync” |

## Trap demo (10s, if asked about spam)
Submit `seed/photos/trap-01-selfie.jpg` → vision returns `quarantined:true` → `clusters.status='Quarantined'` → hidden from queue, tracking shows “Under verification”.

## Failure modes
- Vision timeout → heuristic fallback (Trash=MEDIUM, Clog/Standing=HIGH), never spinner.
- Geolocation denied → drag pin on mini-map.
- Offline → queued in localStorage, flush on online.
