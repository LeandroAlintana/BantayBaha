# BantayBahaAI (Campus Edition) — MVP Build Specification

## Hand-off Document v2.0 · Post Design-Thinking Refinement · 2026-09-09

**Status:** Ready for build hand-off
**Team:** [Names] · **Timeline:** 24–48 hr hackathon build
**North Star Metric:** Mean Time from Hazard Detection to Dispatch (MT3D) — target < 60 seconds

---

## 0. Problem Frame (Pitch Foundation)

> **POV:** Campus residents experience preventable flooding because hazard reports are slow, unstructured, and untriaged. Reports die in group chats and hotlines; maintenance crews fix what's loudest, not what's most dangerous.
> > >
> **HMW:** How might we turn any student's 10-second photo into a ranked work order for maintenance — with zero signup friction?

**One-sentence positioning:**
*"BantayBahaAI turns 10 seconds of any student's attention into a prioritized flood-prevention work order — no login, no hotline, no waiting. Detection to dispatch in under a minute."*

---

## 1. MVP Scope: The Single Closed Loop

$$
\text{Student Upload (PWA)} \rightarrow \text{AI Triage + Prioritization (Engine)} \rightarrow \text{Dispatch \& Resolve (Admin)} \rightarrow \text{Status Visible to Reporter (Feedback Loop ✦ NEW)}
$$

Architecture is unchanged from v1.0 — the refinements are **rules, fallbacks, and feedback**, not new modules.

---

## 2. Core Modules & Feature Requirements

### Module A: Citizen Reporting Web App (Lightweight PWA)

| Requirement | Spec Detail |
| --- | --- |
| Zero-auth upload | No login, password, or profile. Friction budget: ≤ 10 seconds end-to-end. |
| Geotagged photo | `navigator.geolocation` + native camera/file input. |
| Photo-less fallback ✦ NEW | Submission allowed **without** a photo (type + landmark + geotag only). Severity falls back to type heuristic (see §4.4). Camera permission failure must never block a report. |
| Hazard dropdown | 3 presets: *Clogged Drain/Grate*, *Trash Buildup*, *Standing Water/Flooding*. |
| Optional landmark | Free text, e.g. "Near Science Hall Rear Entrance". |
| Instant confirmation | Report tracking ID + short link to **"Check My Report"** page. ✦ REFINED |
| **Check My Report page ✦ NEW** | Public lookup by tracking ID only (no login). Shows: status (`Pending / In Progress / Cleared`), AI severity, timestamp, pin location on mini-map. This closes the accountability loop — the psychological hook that drives repeat reporting. |

### Module B: Processing & Prioritization Engine (Backend)

#### B.1 Computer Vision Triage

- Off-the-shelf vision API (Gemini 1.5 Flash or GPT-4o-mini), prompt-engineered for structured JSON output: `{ severity: LOW|MEDIUM|HIGH, confidence: 0-1, rationale: string }`.
- **Mock-classifier fallback flag ✦ NEW (DEMO INSURANCE):** env var `USE_MOCK_VISION=true`. On API timeout/error OR when flag is set, severity = type heuristic. Judges must never see a loading spinner or a failed submission.

#### B.2 Geofenced Deduplication — ✦ REFINED RULE

- Cluster only if: **same hazard category AND within 15 m of an open pin.** Different category → always new pin (prevents a HIGH flooding report being silently absorbed into a LOW trash cluster).
- Match found → attach report to existing cluster, increment `report_count`, keep the **max severity** across member reports, recalculate priority score.
- Match not found → create new cluster/pin.

#### B.3 Priority Scoring (unchanged formula)

$$
\text{Priority} = (\text{Severity} \times 0.40) + (\text{Density} \times 0.35) + (\text{Proximity} \times 0.25)
$$

| Component | Values |
| --- | --- |
| Severity Weight | LOW = 20 · MEDIUM = 60 · HIGH = 100 |
| Report Density | `min(report_count × 25, 100)` |
| Infra Proximity | 100 if ≤ 30 m of critical buildings (Library, Main Lecture Halls — hardcode coordinates); else 50 |

#### B.4 Severity Fallback Heuristic ✦ NEW

| Hazard Type (photo-less or API failure) | Default Severity |
| --- | --- |
| Standing Water / Flooding | HIGH |
| Clogged Drain / Grate | HIGH |
| Trash Buildup | MEDIUM |

#### B.5 Reporter Notification (lightweight) ✦ NEW

- On status transitions `In Progress` and `Cleared`, update is visible via the tracking page. No SMS/push in MVP — the tracking ID *is* the token. (Post-hackathon: push subscriptions.)

### Module C: Physical Plant Operations Dashboard (Admin Portal)

| Feature | Spec Detail |
| --- | --- |
| Interactive map | Leaflet + OpenStreetMap, campus bounds pre-zoomed. Color by score: 🟢 < 40 · 🟡 40–70 · 🔴 > 70. |
| Ranked work-order queue | Sidebar sorted strictly by priority score, descending. Auto-refresh (polling 5 s or websocket). |
| Card inspection drawer | Photo, AI severity + rationale, timestamp, landmark, report_count, status history. |
| Status toggle | `Pending → In Progress → Cleared`. ✦ REFINED: pin stays **amber on map** while `In Progress` (map must tell a live ops story: red → amber → gone). `Cleared` removes from active queue and turns pin green/archive. |
| Queue counters ✦ NEW | Header chips: `🔴 n critical · 🟡 n moderate · 🟢 n low` — instant situational awareness for judges. |

---

## 3. Data Model (minimal)

```javascript
reports        id, tracking_id (public token), hazard_type, photo_url,
               lat, lng, landmark, created_at, status, cluster_id
clusters       id, hazard_type, lat, lng, severity, report_count,
               priority_score, status, created_at, updated_at
critical_sites id, name, lat, lng          -- hardcoded: Library, Lecture Halls
status_events  id, cluster_id, from_status, to_status, actor, at
```

Supabase (PostgreSQL + PostGIS) for geospatial queries; `earthdistance` or PostGIS `ST_DWithin` for the 15 m dedupe.

---

## 4. Tech Stack (locked)

| Layer | Choice | Rationale |
| --- | --- | --- |
| PWA frontend | React/Next.js + Tailwind | Mobile-first, fast styling |
| Backend | FastAPI (Python) or Express | Team's strongest language wins — do not debate > 10 min |
| DB | Supabase (Postgres + PostGIS) | Instant REST, spatial queries |
| Maps | Leaflet + OpenStreetMap | No API key / credit card |
| Vision | Gemini 1.5 Flash (primary) | Fast, cheap, structured JSON; GPT-4o-mini as swap-in |

**Build order (risk-sequenced):**

1. DB schema + seed script (see §6)
2. Report submit endpoint (photo-less path first — it unblocks everything)
3. Vision integration + fallback flag
4. Dedupe + scoring engine
5. Reporter PWA (submit + confirmation + tracking page)
6. Admin dashboard (map → queue → drawer → toggles)
7. Demo hardening pass (§7)

---

## 5. Success Criteria & Measurement

| Metric | Target | How Measured |
| --- | --- | --- |
| **MT3D** (photo submitted → appears in admin queue) | < 60 s | Timestamps in DB; show live on dashboard footer ✦ NEW |
| Submission friction | ≤ 10 s, ≤ 3 taps | Timer in demo |
| Dedupe accuracy | Same-category ≤ 15 m merges; different category never merges | Unit test the rule |
| Demo reliability | 0 failed submissions in 3 demo runs | Full dress rehearsal |
| (Pitch stat) Traditional channel latency | hours–days | Cite campus maintenance intake process — frames MT3D |

---

## 6. Seed Data & Demo Prep (cold-start insurance)

- Pre-seed **4–5 clusters** across campus: one 🟢, two 🟡, one 🟢 near Library, and **one pre-built 🔴 cluster of 3 reports** (demonstrates dedupe: 3 reports → 1 pin, count = 3, density weight = 75).
- Demo photo pre-saved on presenter's phone (clogged drain); camera failure plan = file upload.
- QR code to PWA printed **large** (projector contrast kills small codes).
- Admin dashboard pre-open, pre-zoomed to campus.
- `USE_MOCK_VISION` flag rehearsed both ways (live API preferred; mock as safety net).
- Seed script is a **first-class deliverable** (`/seed`) — reset-to-demo-state in one command.

---

## 7. Demo Script (3 minutes, two presenters)

| T | Screen 1 — Mobile (P1) | Screen 2 — Dashboard (P2) |
| --- | --- | --- |
| 0:00 | Open PWA via QR | Live dashboard with seeded map |
| 0:30 | Snap photo of mock clogged drain | — |
| 0:45 | Submit (5 s) + show tracking ID | Auto-refresh: new 🔴 pin lands at #1 queue |
| 1:30 | Opens "Check My Report" link | Opens card: photo, AI severity HIGH, rationale, MT3D timer stops (< 60 s) |
| 2:15 | Watches live | `Pending → In Progress` (pin turns 🟡 on map) → `Cleared` (pin leaves queue) |
| 2:45 | Sees status change on tracking page | "Closed loop complete — reporter and admin in sync" |

**Pitch arc (2 min):** hook (flooded walkway photo, "reported 6 hours late") → insight (problem is *triage latency*, not awareness) → demo → MT3D stat → scale (campus → LGU → city; vision API is language- and locale-agnostic).

---

## 8. Out of Scope (unchanged — protected list)

❌ Native app store builds · ❌ Registration/OTP/passwords · ❌ Hydrologic simulation · ❌ SMS gateway · ❌ Live weather API (mock inputs for demo)

**Post-hackathon roadmap (pitch one slide):** push notifications, building/dorm leaderboards ("Bantay Hero" gamification — supply-side sustainability), LGU multi-tenant mode, weather-radar fusion.

---

## 9. Open Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Vision API latency/failure on stage | `USE_MOCK_VISION` fallback; dress-rehearse both paths |
| Geolocation denied on phone | Manual pin-drop on a mini-map in the PWA ✦ NEW (acceptable fallback) |
| Supabase free-tier rate limits in demo | Seed locally cached; polling 5 s is well within limits |
| Scope creep | §8 list is binding; any new idea goes to roadmap slide, not the build |

---

*Document owner: [PM name] · Sign-off required from: frontend lead, backend lead, demo presenter.*

---

## 10. Dev Implementation Notes — Demo Data, Mapping, Input Handling, Visibility

### 10.1 Sample / Demo Images — what & where to get

Build a demo set of **~14 images**. Mix of sources, priority order:

1. **Take your own (best, do this)** — 6–8 real photos shot around campus the day before the demo: actual clogged drains, puddles/standing water, trash buildup. Real geotags + recognizable campus context = demo credibility judges notice. This takes 30 minutes walking around.
2. **Web-sourced (fill diversity)** — 4–5 images from Wikimedia Commons (search "clogged drain", "blocked storm drain", "urban flooding"; all CC-licensed, no attribution issues on stage). Strip EXIF GPS if present, assign campus coordinates manually in the seed script.
3. **Trap images (functional, not decorative)** — 1 meme/selfie + 1 clearly unrelated photo, used to demo the spam filter (§Canvas Q6): vision model flags them, they land in quarantine. This turns a defense question into a 10-second live feature.

| Image | Type | Expected Vision Output |
| --- | --- | --- |
| 5 | Clogged drain/grate | HIGH (2 borderline → MEDIUM) |
| 4 | Trash buildup | MEDIUM |
| 4 | Standing water/flooding | HIGH |
| 1 | Meme/selfie | quarantine (mismatch) |
| 1 | Unrelated | quarantine (low confidence) |

Store in `/seed/photos/` with a manifest JSON mapping filename → expected type/severity/seed coordinates.

### 10.2 Campus Mapping — don't map anything

**Do not create custom maps. Zero mapping work required.**

- **Base map:** OpenStreetMap already has nearly every Philippine campus with roads and building footprints. Leaflet default tiles + a bounding-box zoom is the entire "campus map."
- **Campus bounds:** 2 corner coordinates (SW + NE) — get them by right-clicking the campus in openstreetmap.org. 2 minutes.
- **Critical sites (Library, Lecture Halls):** 2 lat/lng pairs, same method. Hardcode into `critical_sites` seed table. 15 minutes total.
- **Fallback:** if the campus is poorly mapped, no problem — the *pins* are the content, not the map art. Plain OSM tiles with pins still reads perfectly on stage.

#### 10.2a No access to official campus map / PPDO? — mock data is fine, with one rule

**Yes, fully acceptable for the hackathon.** The only inputs that must exist are 4 numbers (campus bounding box) and 4–6 numbers (critical-site coordinates) — approximate values work:

- **Use OSM as the source of truth.** It's public, current, and already shows campus roads/buildings. Right-click approximate building positions in openstreetmap.org. If a building is missing, drop the pin within ~30 m of where it visibly stands on the satellite layer — the proximity weight only cares about 30 m vs. farther.
- **Fully fictional coordinates are acceptable too.** If you want zero real-campus dependency, center the demo map on *any* mapped campus and seed accordingly — the loop works identically.
- **The one rule: never present approximations as official.** Label seed data `source: "approximate (OSM)"` in the manifest. Judges respect honest approximations; they punish silent ones.

**Judge Q&A (if asked):** *"Demo uses OSM-derived approximate geometry — no PPDO data needed. Production onboarding includes a one-time critical-site tagging step with the Physical Plant, which is itself part of our onboarding service. The product doesn't require an official map; it works on any 4 coordinates."*

### 10.3 Are images/locations modifiable at input?

**Before submit — yes, both:**

- **Photo:** preview + retake/replace button. Cost: one line of UI; prevents the #1 bad-demo moment (accidental blurry/selfie photo submitted live).
- **Location:** show the captured pin on a mini confirm-map with **drag-to-adjust**. Phone GPS is routinely 10–30 m off — that error is larger than the 15 m dedupe radius. Drag-to-adjust is not a nice-to-have; without it, the dedupe demo can fail live. Text landmark stays free-text alongside.

**After submit — immutable, by design:**

- No reporter edits post-submit (would break dedupe logic, scoring history, and the audit trail). Correction path = file a new report; if it's the same spot + category, dedupe merges it into the same cluster automatically. The system self-heals.
- **Admin may edit metadata** (hazard type, pin position) — they are the trusted party; their edits are logged in `status_events`.

### 10.4 Reporter visibility — does the student wait for admin confirmation?

**No. Reporter sees their report instantly; admin confirmation gates *dispatch*, never *visibility*.**

Sequence on the tracking page:

```javascript
Submit → tracking page live immediately: "Received ✓ — Queued for triage"
       → admin clicks In Progress:  "Crew assigned / Being inspected"
       → admin clicks Cleared:      "Resolved ✓ — thank you!"
```

Why this matters (don't compromise on this in the build):

- **The psychological contract** — "my report exists and is #1 priority" *in the first 10 seconds* is the retention hook (spec §2 Module A). Waiting for admin approval before showing anything destroys the zero-friction promise — the reporter can't tell if the app even worked.
- **Spam is handled by state, not by hiding:** quarantined/flagged reports show as *"Under verification"* on the tracking page. The reporter isn't deceived, the queue stays clean, and the spam-filter question (Canvas Q6) answers itself.
- Admin approval protects **physical action only** — nobody dispatches a crew without a human click. Visibility was never the risk.

---

*Dev owner: backend lead (10.1, 10.4) · frontend lead (10.2, 10.3) · demo presenter approves 10.1 image set.*