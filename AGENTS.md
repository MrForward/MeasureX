# AGENTS.md — MeasureX Build Instructions

## Source of truth
MeasureX_MVP_PRD.md is the product spec. When in doubt, follow the PRD. Do not add features not in the PRD. Do not simplify features described in the PRD.

## Architecture decisions (locked)
- **Schema:** PRD Section 5 is the exact Prisma schema. Do not modify field names, types, or relations.
- **2 engines only:** ChatGPT (gpt-4o-mini) and Perplexity (sonar). Do not add Google AI, Gemini, or any third engine.
- **Extraction is rule-based:** No LLM calls for entity detection, citation extraction, or recommendation classification. String matching and regex only. LLM calls are reserved for prompt generation (onboarding) and future content recommendations (not in MVP).
- **Scans are client-driven batches (no server-side background work):** No job queue, no QStash, no Redis, no async workers — and NO detached/fire-and-forget promises (they die when a Vercel serverless function suspends after responding). `POST /api/scan/run` creates the `Scan` + every `EngineRun` as `pending` and returns immediately with `{ scanId, totalRuns }`. The client then calls `POST /api/scan/process` repeatedly; each call processes the next batch of up to 4 pending runs sequentially (one engine call at a time → extraction → store), and the call that drains the last pending run finalizes the scan (F6 scoring) and sends the F10 email **exactly once**, guarded by an atomic status compare-and-swap (`running` → terminal). `GET /api/scan/status` reaps scans stuck in `running`. Core lives in `src/lib/scan/batch.ts`. This is intentional — do not reintroduce detached background processing or a synchronous long-running request handler.
- **No workspaces, no RBAC, no teams:** One user = one brand = one account. Auth is session-based via NextAuth.
- **Stripe is the only billing system:** No free tier in MVP. User must pay $9/mo before accessing onboarding.

## Code quality rules
- Every new function that computes or transforms data must have a vitest test.
- Extraction pipeline must pass all 10 F5 eval cases (see PRD Section 4, F5 eval table).
- Scoring engine must pass all 5 F6 eval cases (see PRD Section 4, F6 eval table).
- Do not leave `console.log` in production code. Use structured error handling.
- TypeScript strict mode. No `any` types except in third-party API response parsing where the shape is genuinely unknown.

## What NOT to build
- Automated scheduler / cron / QStash (post-MVP, week 4)
- Content recommendations (post-MVP, week 5)
- Score trend sparkline (post-MVP, needs 3+ data points)
- Google AI Overview engine (post-MVP, $29 plan)
- CSV export, PDF reports, shareable URLs (post-MVP)
- Admin panel, usage tracking, cost tracking
- In-app notifications (email only via Resend)
- Fuzzy matching, Levenshtein distance, LLM-based disambiguation

## Dependencies
**Must be installed:** next, react, @prisma/client, prisma, next-auth, @auth/prisma-adapter, openai, stripe, @anthropic-ai/sdk, resend, zod, tailwindcss, vitest
**Must NOT be installed:** @upstash/redis, @upstash/qstash, @aws-sdk/client-s3, recharts, fast-levenshtein

## Environment variables required
DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, OPENAI_API_KEY, PERPLEXITY_API_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY, EMAIL_FROM, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, NEXT_PUBLIC_APP_URL

## File structure conventions
- API routes: src/app/api/{resource}/route.ts
- Page routes: src/app/(dashboard)/dashboard/page.tsx, src/app/page.tsx
- Lib modules: src/lib/{domain}/{module}.ts with co-located {module}.test.ts
- Components: src/components/{domain}/{component}.tsx
- Shared UI: src/components/ui/ (shadcn)
