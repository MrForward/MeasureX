# MeasureX — MVP Delivery Roadmap (re-prioritized)

**Created:** 2026-06-07 · **Owner:** engineering

## Purpose

`tasks.md` is the canonical task list (8 phases, dependency waves, acceptance
criteria). This roadmap is **not a replacement** — it re-sequences those same
tasks into delivery stages ordered by the *critical path to a usable MVP*,
based on the 2026-06-07 connectivity audit. Every stage traces back to numbered
tasks and requirements; nothing here is new scope.

**Why re-prioritize?** The original plan completes Phase 5 (all dashboard views)
before Phases 6–7. The audit showed the highest-leverage gap is elsewhere: a
customer literally cannot onboard (no Prompts API). So we route by "shortest
line to a working product," matching the critical path the spec itself names:
`1.1 → 1.2 → 1.5 → 1.8 → 2.1 → 2.3 → 3.1 → 3.11 → 4.5 → 5.2`.

**Legend:** ✅ done · 🚧 in progress · ⬜ not started

---

## Stage 1 — Prove the pipeline runs end-to-end ✅

- **Tasks:** 4.5 (wiring) · **Requirements:** 6
- **Done when:** a run produces `Metric` rows and `/dashboard` renders real
  visibility scores against a live database.
- **Status:** ✅ Validated 2026-06-07 — demo run produced 15 metrics; dashboard
  shows Visibility 68/100 for the HubSpot workspace. Added: extraction & metrics
  orchestrators, deadlock-safe extract job, in-process job shim, DEMO_MODE,
  DB-fallback raw-response storage.

## Stage 2 — Customer prompt management ✅ *(onboarding-critical)*

- **Tasks:** Prompts CRUD API (audit gap — no task #) · 5.11 · 5.12 ·
  5.13(prompts) · **Requirements:** 3, 16
- **Done when:** a workspace **owner** can create / edit / archive / list prompts
  via `/api/v1/workspaces/:id/prompts` **and** a UI screen, with validation:
  10–500 chars (16.1), max 25 active (3.3), intent category (16.4), ≥1 engine
  (3.7), duplicate-similarity warning (16.2), edit-as-new-version (3.6). RBAC
  enforced (viewer read-only).
- **Why first:** without this, no real customer can configure anything — today
  prompts exist only via the seed script.
- **Status:**
  - ✅ **Backend API done + validated live (2026-06-07):** GET/POST
    `/prompts`, PATCH/DELETE `/prompts/:id`. Validation, 25-active limit (from
    config), non-blocking similarity warning, edit-as-new-version (archives
    original + links `parentPromptId`), archive-on-DELETE, owner/viewer RBAC.
    +17 unit tests; smoke-tested against Supabase. Files: `validations/prompt.ts`,
    `prompts/similarity.ts`, `api/.../prompts/route.ts`, `.../prompts/[promptId]/route.ts`.
  - ✅ **UI screen done + validated live (2026-06-07)** (`/dashboard/prompts`):
    list (active + collapsible archived), create/edit form with char counter,
    intent select, engine toggles, archive with confirm, surfaces validation
    errors + similarity warnings, owner-only controls. Renders HTTP 200 with
    real data; fixes the previously-dead sidebar link. Files:
    `app/(dashboard)/dashboard/prompts/page.tsx`, `components/dashboard/prompts-manager.tsx`.

## Stage 3 — Dashboard depth 🚧

- **Tasks:** 5.3 (prompt table) · 5.4 (competitor comparison) · 5.5 (citations) ·
  5.6 (drill-down) · 5.7 (score breakdown) · 5.8 (recommendations panel) · 5.9
  (variance indicators) · 5.13(competitors/brand) · **Requirements:** 7, 17, 19
- **Done when:** the sidebar links (`/dashboard/prompts|competitors|settings`,
  currently dead) resolve to pages rendering real data, and any metric drills
  down to its source response.
- **Status (2026-06-07):**
  - ✅ **5.3 Prompt-level performance table** — per-prompt score (bar), mentions,
    citation rate, per-engine breakdown, on the dashboard. Live + tested.
    (`lib/dashboard/prompt-breakdown.ts`, `components/dashboard/prompt-table.tsx`)
  - ✅ **5.4 Competitor comparison / share of voice** — real `/dashboard/competitors`
    page (replaced placeholder): SoV bars (brand highlighted) + competitor list.
    Live + tested. (`lib/dashboard/competitor-comparison.ts`, `components/dashboard/competitor-comparison.tsx`)
  - ✅ **5.5 Citation sources panel** — domains grouped with frequency + classification
    (brand/competitor/third-party), on the dashboard. Live + tested.
    (`lib/dashboard/citation-sources.ts`, `components/dashboard/citation-sources.tsx`)
  - ✅ Earlier UX pass: all sidebar links resolve (placeholder pages), "Run scan" button.
  - ✅ **5.6 drill-down + 5.7 score breakdown** — "view source" evidence page at
    `/dashboard/evidence/[executionId]`: 4-factor score breakdown, raw response with
    brand/competitor mentions highlighted, classified citations. Prompt-table engine
    scores link to it. Live + validated. (Req 19.2, 19.4, 7.5)
    (`lib/dashboard/evidence.ts`, `components/dashboard/evidence-view.tsx`)
  - ⬜ **5.8 recommendations panel** — blocked on Stage 5 (recommendation generation).
  - ⬜ **5.9 variance indicators** · **5.13 competitor/brand edit UI** — pending polish.

## Stage 4 — Cost tracking & fair-use limits ✅ (core)

- **Tasks:** 7.2 · 7.3 · 7.5 · 7.8 · **Requirements:** 10, 20
- **Done when:** `api_usage` is written per engine call (audit gap), plan prompt
  limits are enforced server-side, and an admin view shows per-workspace usage.
- **Status (2026-06-07):**
  - ✅ **7.8 cost tracking instrumented** — every engine call writes `api_usage`
    (`lib/usage/track.ts`, wired into execute-job). Closes audit finding #2.
  - ✅ **7.2/7.3 usage + cost display** — per-engine call counts + estimated cost
    on the Settings page (`lib/dashboard/usage.ts`). Live + validated.
  - ✅ **7.5 plan limit enforcement** — already enforced in the Prompts API.
  - ⬜ **7.1 admin panel, 7.4 failed-execution log, 7.6 cost alerts, 7.7
    throttling** — ops features; deferred (not MVP-blocking).

## Stage 5 — Notifications & recommendations 🚧

- **Tasks:** Phase 6 (6.1–6.9) · **Requirements:** 8, 9
- **Done when:** the stubbed recommendations handler generates real
  recommendations, the `/api/jobs/notifications` handler exists (currently 404s),
  and baseline/digest/failure emails + in-app notifications work.
- **Status (2026-06-07):**
  - ✅ **Recommendation engine (6.6, 6.7) + panel (5.8)** — rule-based,
    evidence-backed, prioritized recommendations from visibility gaps, citation
    opportunities, and share-of-voice. Wired into the pipeline (recommendations
    job no longer a stub); real `/dashboard/recommendations` page + dashboard
    panel. Works in DEMO_MODE (no LLM keys); an LLM rewrite of action text is a
    later enhancement. Live + validated (6 recs from a run). +5 tests.
    (`lib/recommendations/generate.ts`, `run-recommendations.ts`,
    `lib/dashboard/recommendations.ts`, `components/dashboard/recommendations-panel.tsx`)
  - ⬜ **6.8 targeted competitor recs** (competitor > brand by >20 pts on a prompt)
    — needs per-prompt competitor visibility scores (not yet persisted).
  - ✅ **In-app notifications (6.5) + pipeline tail** — built the missing
    `/api/jobs/notifications` handler (closed the dangling 404); run-completion
    notifications for owners (with partial-failure summary, Req 18.4); read API
    (list + unread count + mark-read); notification bell in the sidebar. Live +
    validated. (`lib/notifications/create.ts`, `api/jobs/notifications/route.ts`,
    `api/v1/notifications/*`, `components/dashboard/notification-bell.tsx`)
  - ⬜ **Email (6.1–6.4) + digest/baseline + preferences (6.9)** — Resend-based
    email delivery, weekly digest, opt-in. Pending (in-app foundation in place).

---

## Deferred to post-MVP (tracked, not in critical path)

- Onboarding wizard + first-run summary (5.14, 5.15) — high activation value;
  schedule right after Stage 2 if time allows.
- CSV export (5.10).
- Phase 8 — security, encryption, audit immutability, load testing. Review
  continuously; harden before any real launch.

## How we track progress

Each stage is "done" only when its **Done when** criteria are met *and verified*
(test + live run), not when code is merely written — this is the exact mistake
the audit caught (Phase 3 marked done but disconnected). Update `tasks.md`
checkboxes as integration lands, not as modules are authored.
