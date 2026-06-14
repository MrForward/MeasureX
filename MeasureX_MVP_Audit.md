# MeasureX MVP Audit — Codebase vs PRD

**Audited against:** `MeasureX_MVP_PRD.md` (Ship-in-2-Weeks)
**Date:** 2026-06-07
**Repo state:** `main` @ merged `feat/mvp-pipeline-prompts-dashboard`

---

## Framing (read this first)

The codebase was built against the **`.kiro` "AI Visibility Monitor"** spec — a **multi-tenant, 3-engine, workspace/RBAC, weekly-scheduled, queue-driven** platform. The MVP PRD is a **different, leaner product**: **single brand per user, 2 engines, Stripe-billed, manual synchronous scans, no queue/scheduler, no RBAC, a 0–4 point score**, and a **completely different data model** (`User→Brand→Scan→EngineRun→Extraction`).

The **algorithmic layer** (extraction primitives, ChatGPT/Perplexity adapters, retry, raw-answer viewer, UI primitives) is largely reusable. The **orchestration layer** (workspaces, runs, metrics, scheduler, queue, R2, RBAC, config system) is built on the wrong model and is mostly REBUILD/DELETE/IRRELEVANT. **Stripe billing and Claude prompt-generation don't exist at all.**

**Verdict legend:** KEEP · FIX · REBUILD · IRRELEVANT · DELETE

---

## 1. File-by-file verdict table

### Root config

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `package.json` | §8 | FIX | Add `stripe`, `@anthropic-ai/sdk`; remove `@upstash/redis`, `@upstash/qstash`, `@aws-sdk/client-s3`, `recharts`, `fast-levenshtein`. |
| `package-lock.json` | — | FIX | Regenerate after dep changes. |
| `tsconfig.json` | §8 | KEEP | Fine. |
| `next.config.mjs` | §8 | KEEP | Verify no R2/QStash-specific config. |
| `postcss.config.mjs` | §8 | KEEP | — |
| `tailwind.config.ts` | F1/§8 | KEEP | Indigo-violet theme works for the premium look F1 wants. |
| `vitest.config.ts` | E2/E3 | KEEP | Needed for extraction/scoring evals. |
| `.eslintrc.json` | — | KEEP | — |
| `next-env.d.ts` | — | KEEP | Generated. |
| `tsconfig.tsbuildinfo` | — | IRRELEVANT | Build artifact; should be gitignored. |
| `README.md` | — | REBUILD | Describes the old multi-tenant product. |
| `MeasureX_MVP_PRD.md` | — | KEEP | The spec itself. |

### prisma

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `prisma/schema.prisma` | §5 | REBUILD | Wrong model entirely (Workspace/Run/Metric/etc.). Replace with PRD §5. See Schema Diff (§2). |
| `prisma/migrations/…_init_brand_profiles_versioning/migration.sql` | — | DELETE | Brand-profile versioning isn't in the MVP; wrong model. Reset migrations. |

### src/app — pages

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `app/page.tsx` | F1 | FIX | Landing page exists; repoint CTA from `/login` to Stripe Checkout, add 3 value-prop blocks + meta/OG, polish. |
| `app/layout.tsx` | — | KEEP | Root layout. |
| `app/globals.css` | F1 | KEEP | — |
| `app/(auth)/login/page.tsx` | §8 auth | FIX | NextAuth login OK; flow is post-checkout in MVP. |
| `app/(auth)/.gitkeep` | — | IRRELEVANT | — |
| `app/(dashboard)/.gitkeep` | — | IRRELEVANT | — |
| `app/(dashboard)/layout.tsx` | F7 | REBUILD | Sidebar + workspace switcher; MVP is a single-page dashboard, no workspace nav. |
| `app/(dashboard)/dashboard/page.tsx` | F7 | REBUILD | Score+delta header, prompt table, competitor cards — current is workspace/overview-card based. Reuse inline-onboarding pattern. |
| `app/(dashboard)/dashboard/error.tsx` | — | KEEP | Generic boundary. |
| `app/(dashboard)/dashboard/loading.tsx` | F7 | KEEP | Reusable loading state. |
| `app/(dashboard)/dashboard/onboarding/page.tsx` | F3 | FIX | Reshape to brand + 2 competitors + Claude 25-prompt gen; gate behind active subscription. |
| `app/(dashboard)/dashboard/prompts/page.tsx` | F12 | FIX | Prompt editing belongs in settings; reuse list/edit. |
| `app/(dashboard)/dashboard/competitors/page.tsx` | F7 | DELETE | Competitor comparison is a dashboard *section* in MVP, not a page. |
| `app/(dashboard)/dashboard/recommendations/page.tsx` | — | DELETE | Recommendations are **out of MVP** (week 5). |
| `app/(dashboard)/dashboard/settings/page.tsx` | F12 | REBUILD | MVP settings = edit prompts + "Manage billing" (Stripe portal). Current shows usage/cost (out of scope). |
| `app/(dashboard)/dashboard/evidence/[executionId]/page.tsx` | F8 | FIX | This *is* the raw-answer viewer. Re-key `executionId`→`EngineRun.id`; PRD wants modal/drawer, not a full page. |

### src/app/api — routes

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `api/auth/[...nextauth]/route.ts` | §8 | KEEP | NextAuth handler. |
| `api/cron/weekly-run/route.ts` | — | DELETE | Scheduler is out of MVP (week 4). |
| `api/jobs/execute/route.ts` | F4 | REBUILD | No queue in MVP; scan runs sequentially in `/api/scan/run`. Logic partially reusable. |
| `api/jobs/extract/route.ts` | F5 | DELETE | No queue; extraction runs inline during scan. |
| `api/jobs/metrics/route.ts` | F6 | DELETE | No Metric model; scoring runs inline. |
| `api/jobs/notifications/route.ts` | F10 | DELETE | No queue; email sent directly via Resend on completion. |
| `api/jobs/recommendations/route.ts` | — | DELETE | Recs out of MVP. |
| `api/v1/notifications/route.ts` | — | DELETE | In-app notifications out of MVP (email only). |
| `api/v1/notifications/mark-read/route.ts` | — | DELETE | Same. |
| `api/v1/workspaces/route.ts` | — | DELETE | No workspaces. |
| `api/v1/workspaces/[workspaceId]/route.ts` | — | DELETE | No workspaces. |
| `api/v1/workspaces/[workspaceId]/brand/route.ts` | §6 `/api/brand` | FIX | Reuse domain-validation + create logic; drop workspace scoping & versioning; re-path to `/api/brand`. |
| `api/v1/workspaces/[workspaceId]/brand/history/route.ts` | — | DELETE | No brand versioning in MVP. |
| `api/v1/workspaces/[workspaceId]/competitors/route.ts` | §6 onboard | FIX | Fold into `/api/brand/onboard`; cap at 2 competitors. |
| `api/v1/workspaces/[workspaceId]/competitors/[competitorId]/route.ts` | F12 | FIX | Simplify to `/api/competitors/[id]`. |
| `api/v1/workspaces/[workspaceId]/members/route.ts` | — | DELETE | No multi-user/RBAC. |
| `api/v1/workspaces/[workspaceId]/members/[userId]/route.ts` | — | DELETE | Same. |
| `api/v1/workspaces/[workspaceId]/prompts/route.ts` | §6 `/api/prompts` | FIX | Strong reuse (validation, limits). Re-path; categories→`category/comparison/buyer_intent`; max 20. |
| `api/v1/workspaces/[workspaceId]/prompts/[promptId]/route.ts` | §6 | FIX | Re-path to `/api/prompts/[id]`; drop edit-as-new-version. |
| `api/v1/workspaces/[workspaceId]/runs/route.ts` | F9 §6 `/api/scan/run` | REBUILD | Manual sequential scan over 2 engines; no queue; 24h cooldown→1/hr rate limit + subscription gate. |
| `api/v1/workspaces/[workspaceId]/runs/[runId]/route.ts` | §6 `/api/scan/[id]` | FIX | Reuse run-fetch shape; map Run→Scan. |

**Missing routes (must build):** `/api/stripe/checkout`, `/api/stripe/webhook`, `/api/prompts/generate` (Claude), `/api/scan/status`, `/api/scan/latest`, `/api/run/[id]`.

### src/components

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `components/ui/button.tsx` | — | KEEP | — |
| `components/ui/card.tsx` | — | KEEP | — |
| `components/ui/badge.tsx` | — | KEEP | — |
| `components/ui/skeleton.tsx` | — | KEEP | — |
| `components/providers/session-provider.tsx` | §8 | KEEP | NextAuth provider. |
| `components/auth/login-form.tsx` | §8 | KEEP | — |
| `components/dashboard/onboarding-wizard.tsx` | F3 | FIX | Strong base. Needs Claude-25-prompt step, exactly 2 competitors w/ skip-2nd, 10–20 selection, inline edit, add-custom. |
| `components/dashboard/run-scan-button.tsx` | F9 | FIX | Reuse trigger/poll; add confirm dialog, 1/hr rate limit, subscription gate. |
| `components/dashboard/prompt-table.tsx` | F7 | FIX | Reuse; column set differs (✓/✗ per entity, position #, 0–4 score, category badge, engine icon, row→viewer). |
| `components/dashboard/evidence-view.tsx` | F8 | FIX | Closest existing component. Add competitor amber + URL link highlighting; make it a drawer/modal w/ Esc. |
| `components/dashboard/competitor-comparison.tsx` | F7 | FIX | Reuse for competitor cards; switch share-of-voice → per-competitor score + gap count. |
| `components/dashboard/prompts-manager.tsx` | F12 | FIX | Reuse for settings prompt editing. |
| `components/dashboard/overview.tsx` | F7 | REBUILD | Score-overview block differs (big number + delta badge + last-scan + Run Scan). |
| `components/dashboard/overview-card.tsx` | F7 | REBUILD | Card metric set differs. |
| `components/dashboard/overview-skeleton.tsx` | F7 | FIX | Reusable loading visual. |
| `components/dashboard/citation-sources.tsx` | — | IRRELEVANT | Not in MVP dashboard; citations live inside F8 viewer. |
| `components/dashboard/recommendations-panel.tsx` | — | DELETE | Recs out of MVP. |
| `components/dashboard/notification-bell.tsx` | — | DELETE | In-app notifications out of MVP. |
| `components/dashboard/coming-soon.tsx` | — | DELETE | Placeholder; not needed. |
| `components/dashboard/sidebar.tsx` | — | DELETE | No sidebar nav in single-page MVP. |
| `components/dashboard/workspace-switcher.tsx` | — | DELETE | No workspaces. |
| `components/dashboard/user-menu.tsx` | §8 | FIX | Keep a minimal account/logout menu. |
| `components/dashboard/nav-item.tsx` | — | DELETE | Part of sidebar. |
| `components/dashboard/types.ts` | — | REBUILD | Workspace-centric types. |
| `components/dashboard/initials.ts` | — | KEEP | Tiny avatar util. |
| `components/dashboard/initials.test.ts` | — | KEEP | Test for above. |

### src/lib/engines

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `lib/engines/adapters/chatgpt-adapter.ts` | F4a | FIX | Matches gpt-4o-mini; align system prompt + 1500 tokens + temp 0.7; return tokensUsed. |
| `lib/engines/adapters/chatgpt-adapter.test.ts` | F4a | FIX | Follows source. |
| `lib/engines/adapters/perplexity-adapter.ts` | F4b | FIX | Model `sonar`; surface native citations array. |
| `lib/engines/adapters/perplexity-adapter.test.ts` | F4b | FIX | Follows source. |
| `lib/engines/adapters/google-ai-adapter.ts` | — | DELETE | Google AI Overview out of MVP (week 6+). |
| `lib/engines/adapters/google-ai-adapter.test.ts` | — | DELETE | Same. |
| `lib/engines/base-adapter.ts` | F4 | FIX | Useful base; strip circuit-breaker (not needed for sequential manual scan). |
| `lib/engines/base-adapter.test.ts` | F4 | FIX | Follows source. |
| `lib/engines/circuit-breaker.test.ts` | — | DELETE | Circuit breaker not in MVP. |
| `lib/engines/retry.ts` | F4 | KEEP | PRD wants 3x backoff 1/3/9s + Retry-After — align constants. |
| `lib/engines/retry.test.ts` | F4 | KEEP | — |
| `lib/engines/registry.ts` | F4 | FIX | Useful; 2 fixed engines — could simplify to a map. |
| `lib/engines/registry.test.ts` | F4 | FIX | Follows source. |
| `lib/engines/execution-store.ts` | F4 | REBUILD | `Execution`→`EngineRun`; store rawResponse/nativeCitations/tokensUsed/errorMessage. |
| `lib/engines/execution-store.test.ts` | F4 | REBUILD | Follows source. |
| `lib/engines/rate-limiter.ts` | — | IRRELEVANT | Sequential scan; PRD uses retry+Retry-After, not a token-bucket limiter. |
| `lib/engines/rate-limiter.test.ts` | — | IRRELEVANT | Same. |
| `lib/engines/demo-mode.ts` | — | IRRELEVANT | Handy for dev/evals; not in PRD. Keep optionally for tests. |
| `lib/engines/types.ts` | F4 | FIX | Trim to MVP shape. |
| `lib/engines/index.ts` | F4 | FIX | Barrel; prune deleted exports. |

### src/lib/extraction (the reusable gold — but PRD is rule-based only)

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `lib/extraction/exact-match.ts` | F5a | FIX | Ensure `\b…\b` word-boundary regex + 3-char min rule; align to PRD exactly. |
| `lib/extraction/exact-match.test.ts` | F5a | FIX | Re-point at F5 eval cases. |
| `lib/extraction/fuzzy-match.ts` | — | DELETE | PRD F5a forbids fuzzy (word-boundary exact + domain only). |
| `lib/extraction/fuzzy-match.test.ts` | — | DELETE | Same. |
| `lib/extraction/levenshtein.ts` | — | DELETE | No fuzzy distance in MVP. |
| `lib/extraction/levenshtein.test.ts` | — | DELETE | Same. |
| `lib/extraction/url-extract.ts` | F5c | KEEP | URL regex + domain normalize close to PRD; align regex to PRD's. |
| `lib/extraction/url-extract.test.ts` | F5c | KEEP | — |
| `lib/extraction/citation-classify.ts` | F5c | FIX | Classes match (owned/competitor/review_site/publication/forum/other); add `competitor_name`. |
| `lib/extraction/citation-classify.test.ts` | F5c | FIX | Follows source. |
| `lib/extraction/recommendation-strength.ts` | F5d | FIX | Keep rule path; replace patterns w/ PRD list + 10-char negation window; **drop LLM path**. |
| `lib/extraction/recommendation-strength.test.ts` | F5d | FIX | Re-point at F5 eval (negation test). |
| `lib/extraction/position-analysis.ts` | F5b | FIX | PRD wants **rank ordering** (1st/2nd/3rd by char offset), not first/middle/last thirds. |
| `lib/extraction/position-analysis.test.ts` | F5b | FIX | Follows source. |
| `lib/extraction/confidence.ts` | — | DELETE | No confidence score in MVP. |
| `lib/extraction/confidence.test.ts` | — | DELETE | Same. |
| `lib/extraction/ambiguity.ts` | — | DELETE | No ambiguity flagging in MVP. |
| `lib/extraction/ambiguity.test.ts` | — | DELETE | Same. |
| `lib/extraction/disambiguation.ts` | — | DELETE | LLM disambiguation forbidden (rule-based only). |
| `lib/extraction/disambiguation.test.ts` | — | DELETE | Same. |
| `lib/extraction/run-extraction.ts` | F5 | REBUILD | Outputs brand-only `ExtractionResult`; PRD needs `{brand…, competitors[], citations[], promptScore}`. |
| `lib/extraction/run-extraction.test.ts` | F5 | REBUILD | Rebuild around F5 eval table (10/10). |
| `lib/extraction/extract-job.ts` | — | DELETE | No queue; extraction runs inline. |
| `lib/extraction/types.ts` | F5 | FIX | Reshape to PRD extraction output. |

### src/lib/metrics (wrong formula/model)

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `lib/metrics/visibility-score.ts` | F6 | REBUILD | 4-factor×25% → PRD 0–4 points (absent/mentioned/cited/recommended + first-position bonus). |
| `lib/metrics/visibility-score.test.ts` | F6 | REBUILD | Re-point at F6's 5 scoring scenarios. |
| `lib/metrics/competitor-score.ts` | F7 | REBUILD | Needed for competitor cards, using the new 0–4 formula. |
| `lib/metrics/competitor-score.test.ts` | F7 | REBUILD | Follows source. |
| `lib/metrics/compute-run-metrics.ts` | F6 | REBUILD | Compute Scan score from EngineRuns/Extractions; store on `Scan`. |
| `lib/metrics/compute-run-metrics.test.ts` | F6 | REBUILD | Follows source. |
| `lib/metrics/persist.ts` | F6 | REBUILD | Metric model → Scan score fields. |
| `lib/metrics/persist.test.ts` | F6 | REBUILD | Follows source. |
| `lib/metrics/change-detection.ts` | F6 delta | FIX | PRD delta is `current-previous`; reuse a thin slice, drop "within variance". |
| `lib/metrics/change-detection.test.ts` | F6 | FIX | Follows source. |
| `lib/metrics/aggregate.ts` | — | DELETE | Workspace-level rollups; wrong model. |
| `lib/metrics/aggregate.test.ts` | — | DELETE | Same. |
| `lib/metrics/rolling-average.ts` | — | DELETE | Trend smoothing out of MVP (week 5). |
| `lib/metrics/rolling-average.test.ts` | — | DELETE | Same. |
| `lib/metrics/share-of-voice.ts` | — | IRRELEVANT | Not in MVP dashboard/scoring. |
| `lib/metrics/share-of-voice.test.ts` | — | IRRELEVANT | Same. |

### src/lib/scheduler, queue, storage (no async infra in MVP)

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `lib/scheduler/execute-job.ts` | F4 | REBUILD | Per-prompt execution core → fold into a synchronous `runScan()` sequential loop. |
| `lib/scheduler/execute-job.test.ts` | F4 | REBUILD | Follows source. |
| `lib/scheduler/run-lifecycle.ts` | F9 | FIX | Scan status (running/completed/partial/failed) → `Scan.status`; reusable. |
| `lib/scheduler/run-lifecycle.test.ts` | F9 | FIX | Follows source. |
| `lib/scheduler/pipeline.ts` | — | DELETE | Async job-chaining; scan is synchronous in MVP. |
| `lib/scheduler/pipeline.test.ts` | — | DELETE | Same. |
| `lib/scheduler/weekly-scheduler.ts` | — | DELETE | Scheduler out of MVP. |
| `lib/scheduler/weekly-scheduler.test.ts` | — | DELETE | Same. |
| `lib/scheduler/distribution.ts` | — | DELETE | Run-distribution; out of MVP. |
| `lib/scheduler/distribution.test.ts` | — | DELETE | Same. |
| `lib/scheduler/success-rate.ts` | — | DELETE | Not in MVP. |
| `lib/scheduler/success-rate.test.ts` | — | DELETE | Same. |
| `lib/scheduler/README.md` | — | DELETE | Docs for deleted system. |
| `lib/queue/qstash.ts` | — | DELETE | No queue in MVP. |
| `lib/queue/redis.ts` | — | DELETE | No Redis in MVP. |
| `lib/queue/types.ts` | — | DELETE | Same. |
| `lib/queue/index.ts` | — | DELETE | Same. |
| `lib/storage/r2.ts` | — | DELETE | PRD stores `rawResponse` in DB `@db.Text`, not R2. |
| `lib/storage/r2.test.ts` | — | DELETE | Same. |

### src/lib — other

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `lib/prompts/suggestions.ts` | F3 | REBUILD | Rule-based 6 → Claude (`claude-haiku-4-5-20251001`) returning **25** prompts in 3 categories per F3. |
| `lib/prompts/suggestions.test.ts` | F3 | REBUILD | Re-point at F3 prompt-quality eval. |
| `lib/prompts/similarity.ts` | — | DELETE | Duplicate-warning not in MVP. |
| `lib/prompts/similarity.test.ts` | — | DELETE | Same. |
| `lib/recommendations/generate.ts` | — | DELETE | Recs out of MVP. |
| `lib/recommendations/generate.test.ts` | — | DELETE | Same. |
| `lib/recommendations/run-recommendations.ts` | — | DELETE | Same. |
| `lib/notifications/create.ts` | F10 | REBUILD | In-app notification → **Resend email** on scan completion (subject/body per F10). |
| `lib/usage/track.ts` | — | DELETE | Cost tracking out of MVP (token usage lives on `EngineRun`). |
| `lib/llm/classifier.ts` | — | DELETE | Extraction is rule-based; not needed. |
| `lib/llm/classifier.test.ts` | — | DELETE | Same. |
| `lib/llm/model-router.ts` | — | DELETE | Over-engineered; MVP calls 3 fixed models directly. |
| `lib/llm/model-router.test.ts` | — | DELETE | Same. |
| `lib/llm/types.ts` | — | DELETE | Same. |
| `lib/config/defaults.ts` | — | DELETE | `platform_config` system; MVP hardcodes thresholds. |
| `lib/config/index.ts` | — | DELETE | Same. |
| `lib/dashboard/overview.ts` | F7 | REBUILD | Score-overview loader; wrong model. |
| `lib/dashboard/overview.test.ts` | F7 | REBUILD | Follows source. |
| `lib/dashboard/prompt-breakdown.ts` | F7 | FIX | Prompt-table data; reshape to per-prompt-engine rows w/ 0–4 score + ✓/✗. |
| `lib/dashboard/prompt-breakdown.test.ts` | F7 | FIX | Follows source. |
| `lib/dashboard/competitor-comparison.ts` | F7 | FIX | Competitor cards data; switch SoV → score + gap count. |
| `lib/dashboard/competitor-comparison.test.ts` | F7 | FIX | Follows source. |
| `lib/dashboard/evidence.ts` | F8 | FIX | Raw-answer loader; map Execution→EngineRun, add competitor highlight ranges. |
| `lib/dashboard/citation-sources.ts` | — | IRRELEVANT | Not in MVP dashboard. |
| `lib/dashboard/citation-sources.test.ts` | — | IRRELEVANT | Same. |
| `lib/dashboard/recommendations.ts` | — | DELETE | Recs out. |
| `lib/dashboard/usage.ts` | — | DELETE | Usage/cost out. |
| `lib/validations/brand.ts` | F3 | FIX | Domain validation reusable; drop aliases-versioning. |
| `lib/validations/competitor.ts` | F3 | FIX | Reuse; cap 2. |
| `lib/validations/prompt.ts` | F3/F12 | FIX | Reuse; categories → `category/comparison/buyer_intent`; max 20. |
| `lib/validations/prompt.test.ts` | F3 | FIX | Follows source. |
| `lib/validations/workspace.ts` | — | DELETE | No workspaces. |
| `lib/api/rbac.ts` | — | DELETE | No RBAC/workspaces; replace with simple session→userId guard. |
| `lib/api/rbac.test.ts` | — | DELETE | Same. |
| `lib/api/response.ts` | §6 | KEEP | `{data,error}` envelope is fine. |
| `lib/auth/config.ts` | §8 | FIX | NextAuth; switch to email/magic-link, drop workspace assumptions; keep dev bypass for local. |
| `lib/auth/utils.ts` | §8 | FIX | `requireAuth` keep; drop workspace-access helpers. |
| `lib/db/index.ts` | §8 | KEEP | Prisma singleton. |
| `lib/utils.ts` | — | KEEP | `cn()`. |
| `lib/format.ts` | F7 | KEEP | Number formatting. |
| `middleware.ts` | §8 | FIX | Auth gate; remove workspace routing. |

### src/types, scripts

| File Path | Maps to PRD | Verdict | Notes |
|---|---|---|---|
| `types/index.ts` | §5 | REBUILD | Types for the old model (3-engine EngineId, ExtractionResult shape). |
| `types/next-auth.d.ts` | §8 | FIX | Drop workspace fields from session type. |
| `types/fast-levenshtein.d.ts` | — | DELETE | No levenshtein. |
| `scripts/seed-dev-data.ts` | E1 | REBUILD | Seeds workspace model; reseed User→Brand→Prompts. |
| `scripts/dev-grant-access.ts` | — | DELETE | Workspace membership hack. |
| `scripts/dev-trigger-run.ts` | — | DELETE | Old pipeline helper. |
| `scripts/dev-run-status.ts` | — | DELETE | Old model. |
| `scripts/dev-reset-cooldown.ts` | — | DELETE | Cooldown→1/hr rate limit differs. |
| `scripts/dev-clean-runs.ts` | — | DELETE | Old model. |

**Tally (approx):** KEEP 23 · FIX 55 · REBUILD 26 · IRRELEVANT 9 · DELETE 78.

---

## 2. Schema diff (current `schema.prisma` → PRD §5)

### Models that exist and roughly match (need field changes)
- **`User`** — exists. **Add** `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `brand Brand?`. **Remove** workspace/membership relations. (id `uuid()`→`cuid()` cosmetic.)
- **`Competitor`** — exists. **Change** `workspaceId`→`brandId`. **Remove** `aliases`, `active`. Cap 2 in app logic.
- **`Prompt`** — exists. **Change** `workspaceId`→`brandId`, `intent`→`category` (`category|comparison|buyer_intent`). **Remove** `version`, `parentPromptId`, `geography`, `language`, `engines`, `status`(→`active`). **Add** `runs EngineRun[]`.

### Models that must be REBUILT (wrong shape)
- **`Brand`** — new (replaces `BrandProfile`): `userId @unique`, `name`, `domain`, `aliases[]`, relations Competitor/Prompt/Scan. Drop `version`.
- **`Scan`** — new (replaces `Run`): `brandId`, `status`, `overallScore`, `previousScore`, `delta`, `engineScores Json`, `totalPrompts`, `completedRuns`, `failedRuns`, `startedAt`, `completedAt`, `runs EngineRun[]`.
- **`EngineRun`** — new (replaces `Execution`): `scanId`, `promptId`, `engine`, `model`, `status`, `rawResponse @db.Text`, `nativeCitations Json`, `tokensUsed`, `errorMessage`, `extraction Extraction?`.
- **`Extraction`** — exists but fields change: `runId @unique`, `brandMentioned`, `brandPosition`, `brandMentionCount`, `brandRecommendation`, `competitorResults Json`, `citations Json`, `promptScore Int`. (Current `executionId`/`mentionPosition`/`recommendationStrength`/`confidenceScore`/`ambiguous`/`mentionsJson` all change.)

### Models in current schema NOT in PRD → remove
`Workspace`, `WorkspaceMember`, `BrandProfile`, `Run`, `Execution`, `Metric`, `Recommendation`, `AuditLog`, `ApiUsage`, `Notification`, `PlatformConfig`. (Keep `Account`/`Session`/`VerificationToken` only if using NextAuth DB sessions.)

### Models missing entirely → add
`Brand`, `Scan`, `EngineRun`. PRD has **no separate `Metric`** model (score lives on `Scan`).

### Migration commands
```bash
# This is a model rewrite, not an incremental migration. With no prod data, reset:
rm -rf prisma/migrations
# Replace schema.prisma with PRD §5 verbatim, then:
npx prisma migrate dev --name init_mvp     # or: prisma db push (dev DB)
npx prisma generate
```

---

## 3. Pipeline gap map (PRD §3 Steps + §4 F4–F6)

| Step | Working code? | What works / what's broken | Closest start point / blocking deps |
|---|---|---|---|
| **Landing → Checkout (Step 1–2 / F1–F2)** | No | Landing page exists (`app/page.tsx`) but CTA→`/login`, not Stripe. **Zero Stripe code** — no checkout, no webhook, no `subscriptionStatus`. | Start: `app/page.tsx`. Needs: `stripe` dep, `User` Stripe fields, `/api/stripe/checkout` + `/api/stripe/webhook`. |
| **Onboarding (Step 3 / F3)** | Partial | Wizard UI works and orchestrates brand/competitor/prompt APIs. Broken: prompt gen is rule-based 6, not Claude-25; competitors not capped at 2; no inline edit/add-custom; no 10–20 enforcement. | Start: `onboarding-wizard.tsx` + `lib/prompts/suggestions.ts`. Needs: `@anthropic-ai/sdk`, `/api/prompts/generate`, new schema. |
| **F4 ChatGPT runner** | Partial | `chatgpt-adapter.ts` calls gpt-4o-mini; `retry.ts` does 3x backoff. Broken: queue-coupled; system prompt/token params need PRD alignment; tokensUsed surfacing. | Start: `chatgpt-adapter.ts` + `retry.ts`. Needs: new `EngineRun` store; remove queue. |
| **F4 Perplexity runner** | Partial | `perplexity-adapter.ts` exists with citation extraction. Broken: queue coupling; confirm `sonar` + native citations stored. | Start: `perplexity-adapter.ts`. Needs: same as above. |
| **F4 Scan orchestration (sequential)** | Partial→Rebuild | `execute-job.ts` runs one prompt×engine with retry/store — reusable logic, but queue-driven/parallel. PRD wants a **synchronous sequential loop** with "Running prompt X of Y". | Start: `execute-job.ts` + `run-lifecycle.ts`. Needs: `/api/scan/run`, `/api/scan/status`, `Scan`/`EngineRun` schema. |
| **F5 Extraction** | Partial (strong) | Primitives exist & tested: exact-match, url-extract, citation-classify, recommendation-strength, position. Broken: fuzzy/Levenshtein/LLM used (PRD forbids); rec patterns differ + need negation; position is thirds not ranks; brand-only output. | Start: `lib/extraction/*`. Rebuild `run-extraction.ts` to PRD output. Needs: nothing — pure functions; **do this first.** |
| **F6 Scoring** | No (wrong formula) | `visibility-score.ts` is 4-factor×25%. PRD is 0–4 points + first-position bonus + `(sum)/(N×2×4)×100`. | Start: rewrite `visibility-score.ts` against F6's 5 eval scenarios. Needs: extraction output shape. |
| **F7 Dashboard** | Partial | Prompt table, competitor comparison, evidence drill-down render real data — but wrong model/score and multi-page. | Start: `prompt-table.tsx`, `competitor-comparison.tsx`, `dashboard/page.tsx`. Needs: F6 scoring, new loaders. |
| **F8 Raw answer viewer** | Partial (close) | `evidence-view.tsx` shows raw response + highlighted brand mentions + classified citations + score breakdown. Broken: full page not drawer/modal; no competitor/URL highlight; keyed to `executionId`. | Start: `evidence-view.tsx`. Needs: `EngineRun` model. |
| **F9 Run Scan button** | Partial | `run-scan-button.tsx` triggers + polls + shows progress. Broken: 24h cooldown (PRD wants 1/hr); no confirm dialog; no subscription gate. | Start: `run-scan-button.tsx`. Needs: `/api/scan/run` rate limit + `subscriptionStatus`. |
| **F10 Email** | No | `notifications/create.ts` writes in-app rows; `resend` installed but unused. No scan-completion email. | Start: `notifications/create.ts` → Resend send. Needs: Resend key, F10 template. |

---

## 4. Dependency audit (`package.json`)

**Needed & installed (keep):** `next`, `react`, `react-dom`, `@prisma/client`, `prisma`, `next-auth`, `@auth/prisma-adapter`, `zod`, `openai`, `resend` (installed but **currently unused** — wire for F10), `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tailwindcss`/`postcss`/`autoprefixer`, `typescript`, `@types/*`, `eslint`/`eslint-config-next`, `tsx`, `vitest`, `@tailwindcss/typography`.

**Needed but MISSING (must add):**
- `stripe` — F2 billing (checkout + webhook + portal). **Absent.**
- `@anthropic-ai/sdk` — F3 Claude prompt generation (`claude-haiku-4-5-20251001`). **Absent** (no Anthropic client anywhere).

**Installed but NOT needed (remove):**
- `@upstash/redis`, `@upstash/qstash` — no queue/scheduler in MVP.
- `@aws-sdk/client-s3` — no R2; rawResponse stored in DB.
- `recharts` — **0 imports** in code; dashboard uses CSS bars.
- `fast-levenshtein` — only used by fuzzy/levenshtein (PRD forbids).

**Version/health:** No conflicts. `next@14.2.35` + `next-auth@4.24.8` is a valid, stable pairing (NextAuth v4 — configure email/magic-link v4-style). Pin `stripe@^17`. Everything else current enough.

---

## 5. Environment variables

**MVP-required, already in `.env.example`:** `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, dev toggles (`DEV_AUTH_BYPASS`, `DEMO_MODE`).

**MVP-required, MISSING from `.env.example`:**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` ($9/mo price), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — none present.
- A canonical app/dashboard URL for the F10 email link (code uses `APP_URL`/`VERCEL_URL` — reconcile to e.g. `NEXT_PUBLIC_APP_URL`).

**Referenced in code but NOT in `.env.example`:**
- `CRON_SECRET` (`api/cron/weekly-run` — being deleted).
- `APP_URL` (queue shim — being deleted).
- A spurious `process.env.R` (truncated ref in the R2 region) — dies with R2 deletion.

**Now-unneeded (remove after deletions):** `UPSTASH_REDIS_REST_URL/TOKEN`, `QSTASH_TOKEN`, `QSTASH_CURRENT/NEXT_SIGNING_KEY`, `R2_*`, `SERP_API_KEY`, `GOOGLE_CLIENT_ID/SECRET` (unless keeping Google login).

---

## 6. Verdict (3 sentences)

**~35–40% of the MVP pipeline works end-to-end today** — the engine adapters, extraction *primitives*, raw-answer viewer, prompt/dashboard UI, and auth are reusable, but they sit on the wrong data model and wrong scoring formula, and the two commercial pillars (Stripe billing, Claude prompt-gen) plus the synchronous-scan orchestration are entirely absent.

**Build on this codebase, do not start fresh** — you'd be re-deriving the extraction logic, adapters, retry, and UI primitives that already exist and are tested; a fresh project throws away more than it saves.

**Start with `prisma/schema.prisma`** — rewrite it to PRD §5 first, because every route, store, and scorer depends on the `Scan`/`EngineRun`/`Extraction` shape, and nothing else can be correctly rebuilt until that model exists (immediately followed by `lib/extraction/run-extraction.ts` + `lib/metrics/visibility-score.ts`, which are pure and unblock the whole scan→score path).

---

## Suggested build order (derived from the gap map)

1. **`prisma/schema.prisma`** → PRD §5; reset migrations; `prisma generate`.
2. **Extraction** — fix `exact-match`/`citation-classify`/`recommendation-strength`/`position-analysis`; rebuild `run-extraction.ts`; delete fuzzy/levenshtein/confidence/ambiguity/disambiguation. Pass the F5 10/10 eval.
3. **Scoring** — rebuild `visibility-score.ts` to 0–4 + bonus; pass the F6 5/5 eval.
4. **Scan orchestration** — synchronous sequential `runScan()` from `execute-job.ts`; `/api/scan/run` + `/api/scan/status` + `/api/scan/latest`.
5. **Stripe** — `stripe` dep, `User` fields, `/api/stripe/checkout` + `/api/stripe/webhook`, portal link.
6. **Onboarding + Claude** — `@anthropic-ai/sdk`, `/api/prompts/generate`, wire wizard to 25-prompt flow.
7. **Dashboard + viewer** — repoint `prompt-table`/`competitor-comparison`/`evidence-view` to new model/score; drawer for F8.
8. **Run Scan button** (1/hr + subscription gate) → **F10 Resend email**.
9. **Landing page** polish + Stripe CTA. Delete dead code (queue/scheduler/recs/notifications/usage/config/RBAC).
