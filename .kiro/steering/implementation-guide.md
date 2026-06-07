---
inclusion: auto
---

# MeasureX — Implementation Guide

## Project Context

MeasureX is an AI Visibility Monitor (AEO/GEO tool) that tracks brand presence across AI answer engines. It monitors ChatGPT, Perplexity, and Google AI Overviews to show where brands appear in AI-generated responses.

**Repository:** https://github.com/MrForward/MeasureX.git
**Spec Location:** .kiro/specs/ai-visibility-monitor/

## Tech Stack

- **Framework:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database:** Neon PostgreSQL (free tier) with Prisma ORM
- **Queue:** Upstash Redis + QStash (free tier)
- **Storage:** Cloudflare R2 (free tier) for raw AI responses
- **Auth:** NextAuth.js with email magic links + Google OAuth
- **Email:** Resend (free tier)
- **Monitoring:** Sentry (free tier)
- **Hosting:** Vercel (free tier)

## Key Architecture Decisions

1. **Modular Engine Adapters** — Each AI engine (ChatGPT, Perplexity, Google SERP) is an independent module behind a common `EngineAdapter` interface. Never couple engine logic.
2. **Config over Code** — All thresholds, limits, and weights are in a `platform_config` database table. Never hardcode tunable values.
3. **Algorithmic First, LLM Second** — Use string matching and regex before calling LLMs for entity extraction. LLM calls are expensive.
4. **Token Burn Protection** — Max 3 retries per job, max 1 LLM call per response for disambiguation, dead letter queue for permanent failures, per-run budget cap.
5. **Free-Tier-First** — Use free tiers for all infrastructure. Only upgrade when traffic demands it.

## Implementation Rules

### Code Style
- Use TypeScript strict mode
- Use Prisma for all database operations
- Use Zod for runtime validation of API inputs and LLM outputs
- Use server actions or API routes (Next.js App Router patterns)
- Tailwind CSS for styling — white-dominant theme with purple/violet accents
- Component library: shadcn/ui (installed via CLI)

### File Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth pages (login, signup)
│   ├── (dashboard)/       # Protected dashboard pages
│   ├── api/               # API routes
│   └── layout.tsx
├── components/            # React components
│   ├── ui/               # shadcn/ui base components
│   ├── dashboard/        # Dashboard-specific components
│   └── shared/           # Shared components
├── lib/                   # Core business logic
│   ├── engines/          # Engine adapters
│   ├── extraction/       # Entity extraction pipeline
│   ├── metrics/          # Score computation
│   ├── config/           # Platform config system
│   ├── queue/            # Job queue utilities
│   └── db/              # Database utilities
├── scripts/              # Seed scripts, migrations
└── types/                # TypeScript type definitions
```

### Database Conventions
- Use UUID for all primary keys
- Use `created_at` and `updated_at` timestamps on all tables
- Use soft-delete (`deleted_at`) for workspaces and user data
- Use JSONB for flexible fields (aliases[], engines[], metadata)
- Version brand profiles and prompts (immutable historical records)

### API Conventions
- REST endpoints under `/api/v1/`
- Return consistent JSON: `{ data, error, meta }`
- Use HTTP status codes correctly (200, 201, 400, 401, 403, 404, 500)
- Validate all inputs with Zod schemas
- Apply RBAC middleware on all protected routes

### Testing
- Unit tests for pure functions (scoring, extraction, config)
- Integration tests for API routes (use test database)
- Property-based tests for score computation (always 0-100, deterministic)
- Seed script for development data (HubSpot brand, competitors)

## Test Data (Seed)

**Brand:** HubSpot
- Domain: hubspot.com
- Aliases: ["HubSpot", "Hubspot", "hubspot"]

**Competitors:**
1. Salesforce (salesforce.com)
2. Zoho CRM (zoho.com)
3. Pipedrive (pipedrive.com)
4. Monday.com (monday.com)
5. ActiveCampaign (activecampaign.com)

**Admin Account:** aibrain.play@gmail.com

## Color Theme

- **Background:** White (#FFFFFF) dominant — heavy white space
- **Primary accent:** Indigo-violet (signature #5147E6), gradient #5147E6 → #220296 (adapted from openoperative.com)
- **Brand scale anchors:** light #D0CBFF, periwinkle #9B93FF, deep #220296
- **Text:** Near-black #1D1D1F (headings), slate/gray for body and borders
- **Success:** Green (#10B981)
- **Warning:** Amber (#F59E0B)
- **Error:** Red (#EF4444)
- **Cards:** White with subtle border, slight shadow
- **Navigation:** White background, purple active state

## Critical Guardrails (Never Violate)

1. **Never hardcode API keys** — Always use environment variables
2. **Never retry infinitely** — Max 3 retries, then dead letter queue
3. **Never call LLM without timeout** — 30s hard timeout on every call
4. **Never skip cost tracking** — Log every API call cost immediately
5. **Never mutate raw responses** — They are immutable with checksums
6. **Never block the main thread** — All engine calls are async/queued
7. **Max 1 LLM disambiguation call per response** — Then flag for human review
8. **Always validate LLM output** — Parse with Zod, max 3 validation attempts
9. **Always link metrics to source** — Every score must trace back to raw data
10. **Always check platform kill switch** — Before processing any job

## Environment Variables Template

```env
# Database
DATABASE_URL=postgresql://...@neon.tech/measurex

# Redis/Queue
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
QSTASH_TOKEN=...

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...          # Optional for MVP
GOOGLE_CLIENT_SECRET=...      # Optional for MVP

# AI Engines
OPENAI_API_KEY=...
PERPLEXITY_API_KEY=...
ANTHROPIC_API_KEY=...
SERP_API_KEY=...

# Storage
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=measurex-responses

# Email
RESEND_API_KEY=...

# Monitoring
SENTRY_DSN=...

# Development
NODE_ENV=development
DEV_AUTH_BYPASS=true
SKIP_EMAIL_VERIFY=true
DEMO_MODE=false
```

## Spec Reference

Always consult these files before implementing:
- #[[file:.kiro/specs/ai-visibility-monitor/requirements.md]] — Acceptance criteria
- #[[file:.kiro/specs/ai-visibility-monitor/design.md]] — Architecture and interfaces
- #[[file:.kiro/specs/ai-visibility-monitor/tasks.md]] — Implementation order and dependencies
