# Implementation Plan: AI Visibility Monitor

## Overview

This implementation plan covers the complete build-out of the AI Visibility Monitor MVP across 8 phases spanning approximately 12 weeks. Tasks are ordered by dependency — each phase builds on the previous. Within phases, tasks can be parallelized where noted in the dependency graph.

## Tasks

### Phase 1: Foundation

- [x] 1.1 Initialize Next.js 14 project with App Router, TypeScript, Tailwind CSS, and ESLint configuration
- [x] 1.2 Set up PostgreSQL database with Prisma ORM and initial schema migration (workspaces, users, workspace_members tables)
- [x] 1.3 Set up Redis instance and BullMQ for job queue infrastructure
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

- [ ] 3.1 Implement exact-match entity extraction (brand name, aliases, competitor names — case-insensitive)
- [ ] 3.2 Implement fuzzy-match entity extraction (Levenshtein distance ≤ 2, minimum 80% name length)
- [ ] 3.3 Implement URL extraction and domain normalization from response text
- [ ] 3.4 Implement citation classification (brand domain, competitor domain, third-party)
- [ ] 3.5 Implement mention position analysis (split response into thirds, assign first/middle/last)
- [ ] 3.6 Implement confidence scoring (exact=1.0, fuzzy=0.5-0.9 based on edit distance)
- [ ] 3.7 Implement ambiguity flagging for mentions with confidence < 0.7
- [ ] 3.8 Implement recommendation-strength language detection using LLM classification (Haiku/GPT-3.5)
- [ ] 3.9 Implement context disambiguation for multi-entity matches using LLM (Haiku)
- [ ] 3.10 Implement ModelRouter with task-based model selection and fallback chains
- [ ] 3.11 Implement visibility score computation (4 factors × 25% equal weight)
- [ ] 3.12 Implement aggregate metric computation (workspace-level averages, per-prompt, per-engine)
- [ ] 3.13 Implement week-over-week change calculation with "within normal variance" flagging (<10 points)
- [ ] 3.14 Implement rolling 4-week average visibility score computation
- [ ] 3.15 Implement per-competitor visibility score computation using same formula
- [ ] 3.16 Implement share-of-voice metric (brand mentions / total mentions across all entities)
- [ ] 3.17 Implement metric-to-raw-response linkage (every metric references its source execution)

### Phase 4: Scheduling and Automation

- [ ] 4.1 Implement weekly cron scheduler that creates Run records and queues ExecutionJobs per workspace
- [ ] 4.2 Implement run distribution logic to spread workspace runs across the week (avoid simultaneous execution)
- [ ] 4.3 Implement BullMQ worker that processes ExecutionJobs with engine adapter routing
- [ ] 4.4 Implement run status tracking (queued → in_progress → completed/partial/failed) with execution counts
- [ ] 4.5 Implement post-execution pipeline trigger (extraction → metrics → recommendations → notifications)
- [ ] 4.6 Implement partial failure handling (continue run when individual executions fail, mark as skipped)
- [ ] 4.7 Implement stale data detection for SERP provider responses (flag if older than 7 days)
- [ ] 4.8 Implement queue priority logic (scheduled runs before manual runs, prevent duplicate prompt-engine executions)
- [ ] 4.9 Implement run success rate tracking (monthly aggregate, alert if < 95%)

### Phase 5: Dashboard and UX

- [ ] 5.1 Create application layout with workspace switcher, navigation, and purple/white theme system
- [ ] 5.2 Implement overview dashboard panel (workspace Visibility_Score, total mentions, citation rate, WoW trends)
- [ ] 5.3 Implement prompt-level data table (per-prompt scores, mention counts, citation counts, per-engine breakdown)
- [ ] 5.4 Implement competitor comparison view (side-by-side visibility scores, share of voice chart)
- [ ] 5.5 Implement citation sources panel (citations grouped by domain, frequency counts, brand/competitor/third-party classification)
- [ ] 5.6 Implement metric drill-down (click any metric → view raw response text and extraction details)
- [ ] 5.7 Implement score breakdown view (show 4-factor contribution for any visibility score)
- [ ] 5.8 Implement recommendations panel (evidence, action, impact level, confidence, ordered by impact)
- [ ] 5.9 Implement "significant shift" and "within normal variance" indicators on score changes
- [ ] 5.10 Implement CSV export (all visible metrics + prompt-level data, async generation for large datasets)
- [ ] 5.11 Implement prompt management UI (create, edit, archive, assign engines, view AI suggestions)
- [ ] 5.12 Implement prompt validation UI (character limits, duplicate warning, underperforming flag display)
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
- **Cost tracking (7.2, 7.3, 7.8)** should be instrumented from Phase 2 onwards even if the admin UI comes later — retrofitting cost tracking is painful.
