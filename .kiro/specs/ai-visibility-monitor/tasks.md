# Implementation Plan: AI Visibility Monitor

## Overview

This implementation plan covers the complete build-out of the AI Visibility Monitor MVP across 8 phases spanning approximately 12 weeks. Tasks are ordered by dependency — each phase builds on the previous. Within phases, tasks can be parallelized where noted in the dependency graph.

## Status Legend

- `[x]` — Done **and integrated** into the running system (invoked on the live path, or a standalone module that nothing else depends on).
- `[~]` — **Partial**: code exists (often built and unit-tested) but is **not wired into the runtime pipeline** or **not enforced**. Counts as a regression risk, not a completed feature.
- `[ ]` — Not started.

## Status Accuracy Audit — 2026-06-07

A verification pass (originally 643 unit tests pass; `tsc` clean) found that several Phase 3/4 items were marked `[x]` despite **not being connected to the live pipeline**. Corrected below. **Update (same day): finding #1 — the broken pipeline — has been fixed and wired (see task 4.5); suite now 654 tests green. Findings #2–#4 remain open.** Headline findings:

1. **The run → extract → metrics → recommendations pipeline is broken at the seams.** The extraction and metrics *libraries* (`src/lib/extraction/*`, `src/lib/metrics/*`) are fully built and tested, but **no runtime code invokes them** — `grep` for their imports outside `*.test.ts` returns nothing. The job handlers that should call them are stubs:
   - `src/app/api/jobs/extract/route.ts:62` — `// TODO: Actual extraction logic … will be wired here.` Creates **no** `Extraction` record.
   - `src/app/api/jobs/metrics/route.ts:47` — `// TODO: Actual metrics computation … will be wired here.` Writes **no** `Metric` rows.
   - Consequence: `onExtractionComplete` (`src/lib/scheduler/pipeline.ts:28`) gates the metrics job on every successful execution having an extraction; since extractions are never created, **the metrics job never fires** and the dashboard shows the empty state permanently — even after a fully successful data-collection run.
2. **Cost tracking is not instrumented.** The `api_usage` table is never written (no `apiUsage.upsert` anywhere in `src`), and the per-run budget / per-workspace daily-cap guards from `design.md` (“Token Burn Protection”) exist only as config keys in `src/lib/config/defaults.ts` with no enforcement code. This contradicts the implementation-guide guardrail “Never skip cost tracking” and the note below to instrument it from Phase 2.
3. ~~**No Prompts CRUD API.**~~ **RESOLVED 2026-06-07 (Stage 2 backend):** added GET/POST `/api/v1/workspaces/:id/prompts` and PATCH/DELETE `/prompts/:id` with validation, max-active limit, similarity warning, edit-as-new-version, archive, and RBAC. Validated live. The prompt-management *UI* is still pending.
4. **Dashboard quick-action links are dead.** `src/app/(dashboard)/dashboard/page.tsx` links to `/dashboard/prompts`, `/dashboard/competitors`, `/dashboard/settings` — none of those pages exist (404).

What IS correctly built and integrated: auth + RBAC, workspace/brand/competitor CRUD, the three engine adapters with retry/circuit-breaker/rate-limiting, manual-run trigger with cooldown, R2 raw-response storage with checksums, the config-over-code system, and the overview dashboard read path. The problem is integration, not module quality.

## Tasks

### Phase 1: Foundation

- [x] 1.1 Initialize Next.js 14 project with App Router, TypeScript, Tailwind CSS, and ESLint configuration
- [x] 1.2 Set up PostgreSQL database with Prisma ORM and initial schema migration (workspaces, users, workspace_members tables)
- [x] 1.3 Set up Redis instance and BullMQ for job queue infrastructure _(built with Upstash Redis + QStash, not BullMQ — matches design.md's serverless decision; task title is stale)_
- [x] 1.4 Implement authentication system (signup, login, logout, session management) using NextAuth.js
- [x] 1.5 Implement workspace CRUD API endpoints (create, read, update, delete with soft-delete)
- [x] 1.6 Implement workspace member management (invite, remove, role assignment: owner/viewer)
- [x] 1.7 Implement role-based access control middleware enforcing owner/viewer permissions on all API routes
- [x] 1.8 Implement brand profile CRUD with validation (brand name, domain, up to 3 aliases)
- [x] 1.9 Implement competitor CRUD with validation (name, domain, aliases, max 5 per workspace)
- [x] 1.10 Create database migration for brand_profiles versioning (version column, immutable historical records)

### Phase 2: Engine Integration

- [x] 2.1 Define EngineAdapter TypeScript interface (execute, parseResponse, getStatus, getRateLimits, getCostPerCall)
- [x] 2.2 Implement engine registry with dynamic adapter registration and lookup
- [x] 2.3 Implement ChatGPT adapter using OpenAI Chat Completions API (gpt-4o-mini) with StandardizedResponse output
- [x] 2.4 Implement Perplexity adapter using Sonar API with citation extraction and StandardizedResponse output
- [x] 2.5 Implement Google AI Overview adapter using SERP provider API (ValueSERP/SerpAPI) with StandardizedResponse output
- [x] 2.6 Implement circuit breaker pattern per engine (5 consecutive failures → 30min pause)
- [x] 2.7 Implement retry logic with exponential backoff (3 attempts, configurable delays)
- [x] 2.8 Implement per-engine rate limiting (OpenAI: 60/min, Perplexity: 50/min, SERP: per contract)
- [x] 2.9 Create execution record storage (timestamp, engine, prompt, raw_response_ref, status, model_version, error_details)
- [x] 2.10 Implement manual run trigger API endpoint with 24-hour cooldown per workspace
- [x] 2.11 Implement raw response storage to S3-compatible object storage with checksum computation

### Phase 3: Processing Pipeline

> ✅ **Integration gap CLOSED (2026-06-07):** These modules were originally built and unit-tested but invoked by nothing. They are now composed by `runExtraction()` and `computeRunMetrics()` and invoked by the `extract`/`metrics` job handlers via task **4.5**. Phase 3 is now **code-complete AND integrated** (live end-to-end validation pending a `DATABASE_URL` — see the audit block).

- [x] 3.1 Implement exact-match entity extraction (brand name, aliases, competitor names — case-insensitive)
- [x] 3.2 Implement fuzzy-match entity extraction (Levenshtein distance ≤ 2, minimum 80% name length)
- [x] 3.3 Implement URL extraction and domain normalization from response text
- [x] 3.4 Implement citation classification (brand domain, competitor domain, third-party)
- [x] 3.5 Implement mention position analysis (split response into thirds, assign first/middle/last)
- [x] 3.6 Implement confidence scoring (exact=1.0, fuzzy=0.5-0.9 based on edit distance)
- [x] 3.7 Implement ambiguity flagging for mentions with confidence < 0.7
- [x] 3.8 Implement recommendation-strength language detection using LLM classification (Haiku/GPT-3.5)
- [x] 3.9 Implement context disambiguation for multi-entity matches using LLM (Haiku)
- [x] 3.10 Implement ModelRouter with task-based model selection and fallback chains
- [x] 3.11 Implement visibility score computation (4 factors × 25% equal weight)
- [x] 3.12 Implement aggregate metric computation (workspace-level averages, per-prompt, per-engine)
- [x] 3.13 Implement week-over-week change calculation with "within normal variance" flagging (<10 points)
- [x] 3.14 Implement rolling 4-week average visibility score computation
- [x] 3.15 Implement per-competitor visibility score computation using same formula
- [x] 3.16 Implement share-of-voice metric (brand mentions / total mentions across all entities)
- [x] 3.17 Implement metric-to-raw-response linkage (every metric references its source execution)

### Phase 4: Scheduling and Automation

- [x] 4.1 Implement weekly cron scheduler that creates Run records and queues ExecutionJobs per workspace
- [x] 4.2 Implement run distribution logic to spread workspace runs across the week (avoid simultaneous execution)
- [x] 4.3 Implement BullMQ worker that processes ExecutionJobs with engine adapter routing
- [x] 4.4 Implement run status tracking (queued → in_progress → completed/partial/failed) with execution counts
- [x] 4.5 Implement post-execution pipeline trigger (extraction → metrics → recommendations → notifications) _(WIRED 2026-06-07: `extract` handler now calls `runExtraction()` (`src/lib/extraction/run-extraction.ts`) via the deadlock-safe `extractJob` (`src/lib/extraction/extract-job.ts`) and persists an `Extraction`; `metrics` handler now calls `computeRunMetrics()` (`src/lib/metrics/compute-run-metrics.ts`) and persists `Metric` rows. Deadlock fixed (failed extraction still writes a terminal row so the gate resolves). Local job delivery shim added to `publishJob` so the chain flows on localhost without QStash. +11 unit tests, full suite green. **Live end-to-end validation still pending a `DATABASE_URL`.** The recommendations & notifications tail remains stubbed/absent — Phase 6.)_
- [x] 4.6 Implement partial failure handling (continue run when individual executions fail, mark as skipped)
- [x] 4.7 Implement stale data detection for SERP provider responses (flag if older than 7 days)
- [x] 4.8 Implement queue priority logic (scheduled runs before manual runs, prevent duplicate prompt-engine executions)
- [x] 4.9 Implement run success rate tracking (monthly aggregate, alert if < 95%)

### Phase 5: Dashboard and UX

- [x] 5.1 Create application layout with workspace switcher, navigation, and purple/white theme system
- [x] 5.2 Implement overview dashboard panel (workspace Visibility_Score, total mentions, citation rate, WoW trends) _(read path correctly wired to the `metrics` table with a first-class empty state; will render real numbers only once 4.5 is fixed and `Metric` rows exist. Quick-action links on this page point to `/dashboard/prompts|competitors|settings`, which are not yet built — dead links.)_
- [x] 5.3 Implement prompt-level data table (per-prompt scores, mention counts, citation counts, per-engine breakdown) _(DONE 2026-06-07 — on dashboard, live + tested.)_
- [x] 5.4 Implement competitor comparison view (side-by-side visibility scores, share of voice chart) _(DONE 2026-06-07 — `/dashboard/competitors` share-of-voice bars, live + tested. Side-by-side per-competitor visibility *scores* (vs mention share) await competitor-score persistence; SoV is delivered.)_
- [x] 5.5 Implement citation sources panel (citations grouped by domain, frequency counts, brand/competitor/third-party classification) _(DONE 2026-06-07 — on dashboard, live + tested.)_
- [x] 5.6 Implement metric drill-down (click any metric → view raw response text and extraction details) _(DONE 2026-06-07 — `/dashboard/evidence/[executionId]`, raw response with highlighted mentions + classified citations; prompt-table scores link to it. Live + validated. Req 19.2, 7.5.)_
- [x] 5.7 Implement score breakdown view (show 4-factor contribution for any visibility score) _(DONE 2026-06-07 — 4-factor weighted breakdown on the evidence page via getScoreBreakdown(). Req 19.4.)_
- [ ] 5.8 Implement recommendations panel (evidence, action, impact level, confidence, ordered by impact)
- [ ] 5.9 Implement "significant shift" and "within normal variance" indicators on score changes
- [ ] 5.10 Implement CSV export (all visible metrics + prompt-level data, async generation for large datasets)
- [x] 5.11 Implement prompt management UI (create, edit, archive, assign engines, view AI suggestions) _(DONE 2026-06-07 — create/edit/archive/engine-assignment at `/dashboard/prompts`. "View AI suggestions" deferred to the onboarding wizard, 5.14.)_
- [x] 5.12 Implement prompt validation UI (character limits, duplicate warning, underperforming flag display) _(DONE 2026-06-07 — live char counter (10–500), inline validation errors, non-blocking duplicate-similarity warning. "Underperforming flag display" deferred until prompt-health tracking (Req 16.3) exists.)_
- [ ] 5.13 Implement brand and competitor configuration UI (add/edit/remove with alias management)
- [ ] 5.14 Implement onboarding wizard (brand → domain → competitors → AI-suggested prompts → trigger baseline)
- [ ] 5.15 Implement first-run summary view (key findings, next steps after baseline completes)
- [ ] 5.16 Implement ambiguous mention review UI (list flagged mentions, allow user to confirm/reject)

### Phase 6: Notifications and Recommendations

- [ ] 6.1 Implement email notification service (transactional emails via SendGrid/Resend)
- [ ] 6.2 Implement baseline completion email (summary of initial visibility metrics + dashboard link)
- [ ] 6.3 Implement weekly digest email (Visibility_Score changes, top recommendations, opt-in)
- [ ] 6.4 Implement failure alert notifications (>50% execution failure → email + in-app alert to owners)
- [ ] 6.5 Implement in-app notification system (bell icon, unread count, notification list)
- [ ] 6.6 Implement recommendation generation pipeline using Claude Sonnet/GPT-4o with structured output
- [ ] 6.7 Implement recommendation prioritization by impact level (high → medium → low)
- [ ] 6.8 Implement targeted recommendations when competitor exceeds brand by >20 points on a prompt
- [ ] 6.9 Implement notification preferences UI (enable/disable weekly digest, email preferences)

### Phase 7: Admin Panel and Cost Controls

- [ ] 7.1 Implement admin panel layout with platform-level metrics overview
- [ ] 7.2 Implement per-workspace API usage display (call counts by engine, date range filtering)
- [ ] 7.3 Implement cost estimation display (per-workspace and platform-level, based on API volumes × pricing)
- [ ] 7.4 Implement failed execution log viewer (error details, timestamps, affected prompts, retry history)
- [ ] 7.5 Implement workspace plan limit enforcement (prevent prompt creation when at limit)
- [ ] 7.6 Implement cost threshold alerting (alert admin when workspace exceeds configured spend threshold)
- [ ] 7.7 Implement workspace throttling (move to off-peak when >150% of plan allocation)
- [ ] 7.8 Implement API usage tracking per model call (track cost for classification, extraction, recommendation separately)

### Phase 8: Security, Data Integrity, and Hardening

- [ ] 8.1 Implement API key storage in encrypted secrets manager (AWS Secrets Manager or Doppler)
- [ ] 8.2 Implement data-at-rest encryption (AES-256) for sensitive fields in PostgreSQL
- [ ] 8.3 Implement TLS 1.2+ enforcement for all API endpoints and external connections
- [ ] 8.4 Implement audit logging for all auth events, permission denials, and data modifications
- [ ] 8.5 Implement immutable audit log for run executions (append-only, no update/delete)
- [ ] 8.6 Implement raw response checksum verification on read (detect data corruption)
- [ ] 8.7 Implement workspace soft-delete with 30-day retention before permanent removal
- [ ] 8.8 Implement data retention policy enforcement (12-month retention, automated archival)
- [ ] 8.9 Implement prompt similarity detection (TF-IDF + cosine similarity, warn at >80% overlap)
- [ ] 8.10 Implement input validation and sanitization for all user-facing API endpoints
- [ ] 8.11 Perform load testing at target scale (100 workspaces × 25 prompts × 3 engines)
- [ ] 8.12 Implement health check endpoints and uptime monitoring

## Task Dependency Graph

```json
{
  "waves": [
    {
      "name": "Wave 1: Project Foundation",
      "tasks": ["1.1", "1.2", "1.3"],
      "description": "Project setup, database, and queue infrastructure — no dependencies"
    },
    {
      "name": "Wave 2: Auth & Core CRUD",
      "tasks": ["1.4", "1.5", "1.6", "1.7", "1.8", "1.9", "1.10"],
      "dependencies": ["1.1", "1.2"],
      "description": "Authentication, workspace management, brand/competitor config"
    },
    {
      "name": "Wave 3: Engine Adapters",
      "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11"],
      "dependencies": ["1.2", "1.3", "1.5"],
      "description": "Engine interface, all three adapters (parallel), circuit breaker, retry, rate limiting, storage"
    },
    {
      "name": "Wave 4: Processing Pipeline",
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15", "3.16", "3.17"],
      "dependencies": ["2.1", "2.9", "2.11"],
      "description": "Entity extraction, citation analysis, metric computation — extraction tasks parallelizable"
    },
    {
      "name": "Wave 5: Scheduling & Automation",
      "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"],
      "dependencies": ["2.2", "2.8", "3.11"],
      "description": "Cron scheduler, job workers, pipeline orchestration, failure handling"
    },
    {
      "name": "Wave 6: Dashboard & UX",
      "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12", "5.13", "5.14", "5.15", "5.16"],
      "dependencies": ["3.11", "3.16", "4.5"],
      "description": "All frontend views, onboarding wizard, export — dashboard views parallelizable after layout"
    },
    {
      "name": "Wave 7: Notifications & Recommendations",
      "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9"],
      "dependencies": ["4.5", "5.1"],
      "description": "Email service, notification types, recommendation generation pipeline"
    },
    {
      "name": "Wave 8: Admin & Cost Controls",
      "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8"],
      "dependencies": ["4.9", "2.8"],
      "description": "Admin panel, usage tracking, cost alerts, throttling"
    },
    {
      "name": "Wave 9: Security & Hardening",
      "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "8.9", "8.10", "8.11", "8.12"],
      "dependencies": ["7.1", "6.1", "5.14"],
      "description": "Security hardening, data integrity, load testing — final validation phase"
    }
  ]
}
```

## Notes

- **Parallelization opportunities**: Within Phase 2, the three engine adapters (2.3, 2.4, 2.5) can be built simultaneously by different developers. Within Phase 3, extraction tasks (3.1-3.9) are largely independent. Phase 5 dashboard views can be built in parallel once the layout (5.1) is complete.
- **Critical path**: 1.1 → 1.2 → 1.5 → 1.8 → 2.1 → 2.3 → 3.1 → 3.11 → 4.5 → 5.2 (this is the minimum path to a working demo)
- **Early wins**: The onboarding wizard (5.14) and first-run summary (5.15) are critical for user activation — prioritize these within Phase 5.
- **Risk items**: Task 2.5 (Google SERP adapter) has the highest risk due to SERP provider reliability. Build this last among the three adapters and have a fallback plan (manual data entry) if the provider breaks.
- **Security tasks (Phase 8)** should be reviewed continuously during development, not just at the end. Specifically, 8.1 (secrets management) and 8.10 (input validation) should be implemented from Phase 1.
- **Cost tracking (7.2, 7.3, 7.8)** should be instrumented from Phase 2 onwards even if the admin UI comes later — retrofitting cost tracking is painful. **⚠️ 2026-06-07: this did NOT happen.** The `api_usage` table is never written and the budget/daily-cap guards from design.md exist only as unused config keys. Each execution stores an `estimatedCost` on its own row, but nothing aggregates it. Retrofitting is now owed.

## Post-Audit Recommended Next Steps (priority order)

1. **Wire 4.5** — make `/api/jobs/extract` call the extraction libraries and persist an `Extraction`; make `/api/jobs/metrics` call `src/lib/metrics/*` and persist `Metric` rows. This single change turns a pile of tested modules into a working product and unblocks the entire demo path (5.2 starts showing real data).
2. **Add a Prompts CRUD API** (`/api/v1/workspaces/[workspaceId]/prompts`) — currently missing; prompts can only be seeded. Blocks onboarding (Req 3, 11).
3. **Build the missing dashboard pages** (`/dashboard/prompts`, `/competitors`, `/settings`) or remove the dead quick-action links in `dashboard/page.tsx`.
4. **Instrument cost tracking** (write `api_usage`, enforce per-run budget + daily cap) — owed since Phase 2.
5. **Add `/api/jobs/notifications`** handler (or stop publishing that job until Phase 6) so the pipeline tail doesn't 404.
