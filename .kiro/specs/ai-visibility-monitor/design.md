# Design Document: MeasureX — AI Visibility Monitor

## Overview

MeasureX is a modular, event-driven SaaS platform that tracks brand visibility across AI answer engines. It collects responses from ChatGPT, Perplexity, and Google AI Overviews, extracts entity mentions and citations, computes visibility scores, and presents actionable insights through a dashboard. The system is designed for extensibility (new engines), reliability (circuit breakers, retries), and cost efficiency (model routing by task complexity).

## Architecture

### System Architecture

The AI Visibility Monitor follows a modular, event-driven architecture with clear separation between data collection, processing, and presentation layers.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js)                         │
│  Dashboard │ Onboarding │ Admin Panel │ Workspace Management     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API / WebSocket
┌──────────────────────────────┴──────────────────────────────────┐
│                     API Layer (Node.js/Express)                   │
│  Auth │ Workspace │ Prompts │ Runs │ Metrics │ Recommendations   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                    Background Processing Layer                    │
│  ┌─────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐ │
│  │Scheduler│  │Data Collector│  │  Entity    │  │  Metric   │ │
│  │ (Cron)  │  │  (Workers)   │  │ Extractor  │  │  Engine   │ │
│  └─────────┘  └──────────────┘  └────────────┘  └───────────┘ │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐ │
│  │Recommendation Eng│  │       Engine Adapters                │ │
│  └──────────────────┘  │ ChatGPT │ Perplexity │ Google SERP  │ │
│                         └─────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                       Data Layer                                  │
│  PostgreSQL (primary) │ Redis (queue/cache) │ S3 (raw responses) │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack (MVP — Free-Tier-First Strategy)

The MVP uses free tiers wherever possible to prove product value before committing to paid infrastructure. No quality compromises — the architecture remains production-grade and horizontally scalable; only the hosting tier changes when traffic grows.

| Layer | Technology | Free Tier Capacity | Upgrade Path |
|-------|-----------|-------------------|--------------|
| Frontend + API | Next.js 14 (App Router) on **Vercel Free** | 100GB bandwidth, serverless functions, edge network | Vercel Pro ($20/mo) when traffic exceeds free tier |
| Database | **Neon PostgreSQL Free** | 0.5GB storage, 1 compute branch, autoscaling to zero | Neon Pro ($19/mo) or Supabase Pro ($25/mo) at 100+ workspaces |
| Queue + Cache | **Upstash Redis Free** | 10K commands/day, 256MB storage | Upstash Pay-as-you-go ($0.2/100K commands) when run volume grows |
| Object Storage | **Cloudflare R2 Free** | 10GB storage, 1M reads/mo, zero egress fees | R2 paid ($0.015/GB/mo) — stays cheap at scale |
| Auth | **NextAuth.js** (self-hosted, free) | Unlimited users, email magic links + Google OAuth | Add Clerk ($25/mo) only if SSO needed in V2 |
| Email | **Resend Free** | 100 emails/day, 3000/month | Resend Pro ($20/mo) when user base exceeds ~100 |
| Secrets | **Environment variables** (Vercel encrypted) | Unlimited secrets per project | Doppler ($0) or AWS Secrets Manager when team grows |
| Background Jobs | **Vercel Cron + Upstash QStash Free** | 1 cron/day (Vercel), 500 messages/day (QStash) | Railway ($5/mo) for dedicated worker when run volume exceeds free limits |
| Monitoring | **Sentry Free** | 5K errors/month, performance monitoring | Sentry Team ($26/mo) at scale |
| Error Logging | **Axiom Free** (or Vercel Logs) | 500MB ingest/month | Axiom Pro when log volume grows |

**MVP Monthly Cost Estimate: $0–5/month** (only pay-as-you-go API costs for OpenAI, Perplexity, and SERP provider)

**Key Decisions:**
- **Neon over Supabase**: Neon's serverless Postgres scales to zero (no idle cost), generous free tier, and branching for dev/staging
- **Upstash over self-hosted Redis**: Serverless, no container to manage, free tier covers MVP job queue needs
- **Cloudflare R2 over AWS S3**: Zero egress fees (critical for raw response reads), generous free tier
- **QStash over BullMQ**: Serverless message queue that works with Vercel's serverless architecture — no persistent worker needed for MVP volume
- **Vercel Cron**: Free tier supports 1 daily cron; for weekly runs we trigger via QStash scheduled messages

**SERP Provider (Paid — Required):**
- **SerpAPI Free Tier**: 100 searches/month (enough for 1-2 test workspaces during development)
- **ValueSERP**: $50/month for 5,000 searches (needed once you have 3+ real workspaces)
- **MVP Strategy**: Use SerpAPI free tier during development, switch to ValueSERP when onboarding real users

**When to Upgrade (Triggers):**
| Trigger | Action |
|---------|--------|
| >5 active workspaces | Move to Upstash paid tier for Redis |
| >10 workspaces | Add Railway worker ($5/mo) for background processing |
| >50 workspaces | Upgrade Neon to Pro, consider dedicated Postgres |
| >100 emails/day | Upgrade Resend to Pro |
| Revenue > $500/mo | Move all infra to paid tiers for SLA guarantees |

---

## Components and Interfaces

### 1. Engine Adapter Interface

```typescript
interface EngineAdapter {
  engineId: string;
  engineName: string;
  
  execute(prompt: PromptInput): Promise<EngineResponse>;
  parseResponse(raw: unknown): StandardizedResponse;
  getStatus(): EngineStatus;
  getRateLimits(): RateLimitConfig;
  getCostPerCall(): number;
}

interface PromptInput {
  text: string;
  language: string;
  geography: string;
}

interface StandardizedResponse {
  rawText: string;
  citations: Citation[];
  metadata: Record<string, unknown>;
  modelVersion: string;
  timestamp: Date;
  executionTimeMs: number;
}

interface EngineStatus {
  available: boolean;
  consecutiveFailures: number;
  circuitBreakerOpen: boolean;
  lastSuccessAt: Date | null;
}

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerDay: number;
  cooldownMs: number;
}
```

**Engine Implementations:**

| Engine | API | Model | Cost Estimate |
|--------|-----|-------|---------------|
| ChatGPT | OpenAI Chat Completions | gpt-4o-mini | ~$0.0015/prompt |
| Perplexity | Sonar API | sonar-small | ~$0.005/prompt (includes search) |
| Google AI Overview | SerpAPI or ValueSERP | N/A (SERP scraping) | ~$0.01/prompt |

### 2. Scheduler Design

```
Weekly Run Flow:
1. Cron triggers at workspace-configured time (distributed across week)
2. Scheduler creates a Run record (status: "queued")
3. For each active prompt × assigned engines → create ExecutionJob
4. Jobs added to BullMQ with per-engine rate limiting
5. Workers process jobs with retry logic (3 attempts, exponential backoff)
6. On completion → trigger Entity Extraction pipeline
7. On extraction complete → trigger Metric Computation
8. On metrics complete → trigger Recommendation Generation
9. On all complete → send notifications
```

### 3. Visibility Score Computation

```typescript
function computeVisibilityScore(extraction: ExtractionResult): number {
  const WEIGHT = 0.25; // Equal weight for all four factors
  
  // Factor 1: Mention Presence (binary)
  const mentionPresence = extraction.brandMentioned ? 100 : 0;
  
  // Factor 2: Mention Position
  const positionScore = extraction.mentionPosition === 'first' ? 100
    : extraction.mentionPosition === 'middle' ? 66
    : extraction.mentionPosition === 'last' ? 33
    : 0; // not mentioned
  
  // Factor 3: Recommendation Strength
  const recommendationScore = extraction.recommendationStrength === 'explicit' ? 100
    : extraction.recommendationStrength === 'neutral' ? 50
    : 0; // no mention
  
  // Factor 4: Citation Inclusion
  const citationScore = extraction.brandCited ? 100 : 0;
  
  return Math.round(
    (mentionPresence * WEIGHT) +
    (positionScore * WEIGHT) +
    (recommendationScore * WEIGHT) +
    (citationScore * WEIGHT)
  );
}
```

### 4. Entity Extraction Pipeline

```
Response Text → 
  1. Exact Match (brand name, aliases, competitor names)
  2. Fuzzy Match (Levenshtein distance ≤ 2, case-insensitive)
  3. URL Extraction (regex + normalization to base domain)
  4. Position Analysis (split response into thirds, locate mentions)
  5. Recommendation Language Detection (keyword + context analysis)
  6. Confidence Scoring (exact=1.0, fuzzy=0.5-0.9 based on distance)
  7. Ambiguity Flagging (confidence < 0.7 → flag for review)
  8. Citation Classification (brand domain, competitor domain, third-party)
```

## Data Models

### 5. Database Schema (Key Tables)

```sql
-- Core entities
workspaces (id, name, owner_id, plan, created_at, deleted_at)
users (id, email, name, auth_provider, created_at)
workspace_members (workspace_id, user_id, role)
brand_profiles (id, workspace_id, brand_name, domain, aliases[], version, created_at)
competitors (id, workspace_id, name, domain, aliases[], active, created_at)
```

```sql
-- Prompt management
prompts (id, workspace_id, text, intent, topic, geography, language, 
         engines[], version, parent_prompt_id, status, created_at, archived_at)

-- Execution tracking
runs (id, workspace_id, type, status, started_at, completed_at, 
      total_executions, successful, failed, skipped)
executions (id, run_id, prompt_id, engine, status, raw_response_ref,
            model_version, execution_time_ms, retry_count, error_details,
            created_at)

-- Extraction results
extractions (id, execution_id, brand_mentioned, mention_position,
             recommendation_strength, confidence_score, ambiguous,
             mentions_json, citations_json, created_at)

-- Computed metrics
metrics (id, workspace_id, run_id, prompt_id, engine, date,
         visibility_score, mention_count, avg_position, citation_rate,
         wow_change, rolling_4wk_avg, raw_execution_id, created_at)

-- Recommendations
recommendations (id, workspace_id, run_id, evidence_text, action,
                 impact_level, confidence, prompt_id, created_at)

-- Audit & admin
audit_log (id, workspace_id, event_type, details_json, created_at)
api_usage (id, workspace_id, engine, date, call_count, estimated_cost)
notifications (id, workspace_id, user_id, type, content, read, created_at)
```

---

## Structured Feasibility Analysis

### Technical Feasibility

| Component | Feasibility | Risk | Notes |
|-----------|-------------|------|-------|
| ChatGPT API integration | ✅ High | Low | Well-documented, stable API, predictable costs |
| Perplexity Sonar API | ✅ High | Low | Official API with citations built-in |
| Google AI Overview (SERP) | ⚠️ Medium | Medium | Depends on SERP provider reliability; Google changes AI Overview format frequently |
| Entity extraction (exact) | ✅ High | Low | String matching is deterministic |
| Entity extraction (fuzzy) | ⚠️ Medium | Medium | Fuzzy matching on short brand names produces false positives |
| Recommendation generation | ✅ High | Low | LLM-based, well-understood pattern |
| Weekly scheduling | ✅ High | Low | Standard cron + queue pattern |
| Visibility score computation | ✅ High | Low | Deterministic formula, well-defined inputs |
| 60K executions/month | ✅ High | Low | ~2K/day distributed across engines, within API limits |
| Circuit breaker pattern | ✅ High | Low | Well-established pattern, BullMQ supports natively |

### Cost Feasibility (MVP Phase — Free-Tier-First)

**MVP Monthly Cost (1-5 workspaces, proving value):**

| Item | Calculation | Monthly Cost |
|------|-------------|--------------|
| ChatGPT API (gpt-4o-mini) | ~375 calls × $0.0015 | ~$0.56 |
| Perplexity Sonar | ~375 calls × $0.005 | ~$1.88 |
| SERP Provider (SerpAPI free) | 100 calls free | $0 |
| Classification LLM (Haiku) | ~1,125 calls × $0.0003 | ~$0.34 |
| Recommendation LLM (Sonnet) | ~50 calls × $0.01 | ~$0.50 |
| Neon PostgreSQL | Free tier | $0 |
| Upstash Redis | Free tier | $0 |
| Cloudflare R2 | Free tier | $0 |
| Vercel hosting | Free tier | $0 |
| Resend email | Free tier | $0 |
| Sentry monitoring | Free tier | $0 |
| **Total MVP** | | **~$3.28/month** |

**Growth Phase (10-50 workspaces):**

| Item | Calculation | Monthly Cost |
|------|-------------|--------------|
| ChatGPT API (gpt-4o-mini) | ~7,500 calls × $0.0015 | ~$11.25 |
| Perplexity Sonar | ~7,500 calls × $0.005 | ~$37.50 |
| SERP Provider (ValueSERP) | ~7,500 calls × $0.01 | ~$75.00 |
| Classification LLM (Haiku) | ~22,500 calls × $0.0003 | ~$6.75 |
| Recommendation LLM (Sonnet) | ~750 calls × $0.01 | ~$7.50 |
| Neon PostgreSQL Pro | Upgraded | ~$19.00 |
| Upstash Redis (paid) | Pay-as-you-go | ~$5.00 |
| Cloudflare R2 | Still free tier | $0 |
| Vercel Pro | Upgraded | ~$20.00 |
| Railway (worker) | Background jobs | ~$5.00 |
| **Total Growth** | | **~$187/month** |

**Full Scale (100 workspaces):**

| Item | Calculation | Monthly Cost |
|------|-------------|--------------|
| ChatGPT API (gpt-4o-mini) | 25,000 calls × $0.0015 | ~$37.50 |
| Perplexity Sonar | 25,000 calls × $0.005 | ~$125.00 |
| SERP Provider (ValueSERP) | 25,000 calls × $0.01 | ~$250.00 |
| Recommendation LLM (Claude Sonnet) | 2,500 calls × $0.01 | ~$25.00 |
| Classification LLM (Haiku/3.5) | 75,000 calls × $0.0003 | ~$22.50 |
| PostgreSQL (managed) | Neon Pro | ~$25.00 |
| Redis (managed) | Upstash Pro | ~$15.00 |
| R2 storage (raw responses) | ~5GB/month | ~$0.50 |
| Hosting (Vercel Pro + Railway) | Pro plans | ~$40.00 |
| **Total Full Scale** | | **~$540/month** |

**Break-even analysis:** At $49/workspace/month, break-even at ~11 paying workspaces (~$187/month costs at that scale).

### Operational Feasibility

| Concern | Assessment | Mitigation |
|---------|-----------|------------|
| API key management | Medium complexity | Use secrets manager from day 1 |
| Monitoring & alerting | Standard | Sentry + custom admin panel |
| Data growth | ~5GB/month raw responses | S3 archival with 12-month retention |
| Support burden | Entity extraction disputes | "View source" on every metric reduces support tickets |
| Onboarding friction | Wizard reduces time-to-value | AI-suggested prompts eliminate blank-slate problem |

---

## Edge Cases and Failure Scenarios

### Entity Extraction Edge Cases

| Edge Case | Scenario | Handling |
|-----------|----------|----------|
| Generic brand names | Brand named "Monday" or "Notion" — common English words | Require disambiguation aliases; use context window (±20 words) for classification; flag confidence < 0.7 |
| Brand name in URL only | Brand mentioned only in a cited URL, not in response text | Count as citation but NOT as text mention; separate metric |
| Partial name matches | "HubSpot" matching "hub" or "spot" independently | Require minimum 80% of brand name length for fuzzy match |
| Multi-language responses | Engine responds in different language than prompt | Store language metadata; apply language-aware matching |
| Brand mentioned negatively | "Don't use X" or "X has issues" | V1: count as mention regardless of sentiment; flag for V2 sentiment analysis |
| Competitor aliases overlap | Two competitors share a word (e.g., "Salesforce" and "Force") | Longest-match-first strategy; context disambiguation |
| Empty/minimal responses | Engine returns "I don't have information about that" | Classify as "no mention" with 100% confidence; don't flag as error |
| Response truncation | API returns truncated response due to token limits | Store as-is; flag in metadata; extraction operates on available text |

### Data Collection Failure Scenarios

| Failure | Impact | Recovery Strategy |
|---------|--------|-------------------|
| OpenAI API rate limit hit | ChatGPT executions delayed | Exponential backoff; distribute across time windows; BullMQ rate limiter |
| OpenAI API outage | No ChatGPT data for run | Circuit breaker opens; partial run completes; dashboard shows missing engine indicator |
| Perplexity API key invalid | All Perplexity calls fail | Immediate alert to admin; circuit breaker; run continues for other engines |
| SERP provider returns no AI Overview | Google didn't show AI Overview for that query | Store as "no AI overview present" — valid data point (not an error) |
| SERP provider format change | Parsing breaks for Google data | Circuit breaker triggers; admin alert; requires adapter code update |
| Network timeout (>30s) | Individual execution hangs | 30s timeout per call; retry with backoff; mark as failed after 3 attempts |
| Database connection pool exhausted | Workers can't write results | Queue backs up; BullMQ retries; alert on queue depth > threshold |
| Redis queue crash | Scheduled jobs lost | Persistent BullMQ jobs; Redis AOF persistence; cron re-queues missed runs |
| S3 write failure | Raw response not archived | Retry 3x; store in PostgreSQL JSONB as fallback; alert admin |

### Metric Computation Edge Cases

| Edge Case | Scenario | Handling |
|-----------|----------|----------|
| First run (no history) | No WoW change possible | Display "baseline" label; WoW shows "N/A" |
| All prompts score 0 | Brand has zero AI visibility | Show 0 score with specific recommendations; don't hide bad news |
| Score = 100 | Perfect visibility | Celebrate but warn about non-determinism; show rolling average |
| Prompt assigned to 0 engines | User unchecks all engines | Validation prevents this; minimum 1 engine required |
| Competitor scores higher on all prompts | Brand losing everywhere | Prioritize recommendations by gap size; surface as "critical" alert |
| Model version changes mid-run | OpenAI updates model during execution | Store model version per execution; flag in audit log; note in variance analysis |

### User Experience Edge Cases

| Edge Case | Scenario | Handling |
|-----------|----------|----------|
| User deletes all prompts | Workspace has no active prompts | Skip scheduled run; show "no active prompts" state; prompt to add prompts |
| User changes brand name | Historical data under old name | Version brand profile; historical data linked to version at collection time |
| Workspace with 0 competitors | No competitor comparison possible | Hide competitor panel; show "add competitors" CTA |
| CSV export with 52 weeks of data | Large file generation | Generate async; email download link; show progress indicator |
| Simultaneous manual + scheduled run | Race condition | Queue manual behind scheduled; prevent duplicate executions for same prompt-engine |
| User invites themselves | Edge case in invitation flow | Validate email ≠ current user; show friendly error |

---

## Versioning Strategy

### API Versioning

```
/api/v1/workspaces
/api/v1/prompts
/api/v1/runs
/api/v1/metrics
```

- URL-based versioning (v1, v2) for breaking changes
- Non-breaking additions (new fields) don't require version bump
- Deprecation policy: old versions supported for 6 months after new version release

### Data Versioning

| Entity | Versioning Approach | Trigger |
|--------|-------------------|---------|
| Brand Profile | Immutable versions with `version` column | Brand name, domain, or alias change |
| Prompts | New record with `parent_prompt_id` reference | Prompt text edit |
| Competitors | Soft-delete + new record | Name or domain change |
| Metrics | Linked to specific run + execution IDs | Never mutated (append-only) |
| Raw Responses | Immutable with checksum | Never mutated |

### Schema Migration Strategy

- Use Prisma Migrate (or Drizzle) for schema versioning
- All migrations are forward-only (no destructive rollbacks in production)
- Feature flags for gradual rollout of new capabilities
- Database schema changes deployed independently from application code

### Feature Versioning (Product Roadmap)

```
V1.0 (MVP) — Current scope
├── 3 engines (ChatGPT, Perplexity, Google AI Overview)
├── 25 prompts/workspace
├── Weekly refresh + manual runs
├── Equal-weight visibility score
├── Basic recommendations
└── CSV export

V1.1 (Fast Follow)
├── Custom score weights (user-configurable)
├── Prompt templates library
├── Improved fuzzy matching with ML
└── Slack/Teams notifications

V2.0 (Growth)
├── Gemini engine adapter
├── Copilot engine adapter
├── Sentiment analysis layer
├── Daily refresh option
├── Multi-language support
├── White-label agency portal
└── Advanced permissions (editor role)

V3.0 (Scale)
├── Traffic attribution (GA4 integration)
├── Automated content generation
├── Custom scoring formulas
├── API access for customers
└── SSO / SAML
```

---

## Model & Agent Integration Instructions

### Which Models to Use Where

| Task | Model | Rationale | Cost/Call |
|------|-------|-----------|-----------|
| **Data Collection: ChatGPT queries** | gpt-4o-mini | Cheapest OpenAI model that produces representative answers | ~$0.0015 |
| **Data Collection: Perplexity queries** | sonar-small (via Sonar API) | Built-in citations, search-grounded | ~$0.005 |
| **Entity Extraction: Classification** | Claude 3.5 Haiku or GPT-3.5-turbo | Fast, cheap, sufficient for NER tasks | ~$0.0003 |
| **Entity Extraction: Fuzzy matching** | Algorithmic (no LLM) | Levenshtein/Jaro-Winkler — deterministic, free | $0 |
| **Entity Extraction: Context disambiguation** | Claude 3.5 Haiku | When fuzzy match is ambiguous, use LLM for context | ~$0.0005 |
| **Recommendation Generation** | Claude 3.5 Sonnet or GPT-4o | Needs reasoning quality for actionable insights | ~$0.01 |
| **Prompt Suggestion (Onboarding)** | Claude 3.5 Sonnet or GPT-4o | Creative task requiring industry knowledge | ~$0.01 |
| **Prompt Similarity Detection** | Algorithmic (TF-IDF + cosine) | Deterministic, no API cost | $0 |
| **Recommendation Strength Detection** | Claude 3.5 Haiku | Keyword + context classification | ~$0.0003 |

### Integration Architecture for AI Models

```typescript
// Model router — centralizes model selection and fallback logic
interface ModelRouter {
  // Route to appropriate model based on task type
  route(task: ModelTask): ModelConfig;
  
  // Fallback chain if primary model is unavailable
  getFallbackChain(task: ModelTask): ModelConfig[];
}

enum ModelTask {
  ENTITY_CLASSIFICATION = 'entity_classification',
  CONTEXT_DISAMBIGUATION = 'context_disambiguation',
  RECOMMENDATION_GENERATION = 'recommendation_generation',
  PROMPT_SUGGESTION = 'prompt_suggestion',
  RECOMMENDATION_STRENGTH = 'recommendation_strength',
}

interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'perplexity';
  model: string;
  maxTokens: number;
  temperature: number;
  costPerCall: number;
}
```

### How to Add a New Engine (Step-by-Step)

Adding a new engine (e.g., Gemini in V2) requires these steps:

```
1. Create adapter file: src/engines/gemini-adapter.ts
2. Implement EngineAdapter interface:
   - execute(): Call Gemini API with prompt
   - parseResponse(): Normalize to StandardizedResponse format
   - getStatus(): Report availability and circuit breaker state
   - getRateLimits(): Return Gemini-specific rate limits
   - getCostPerCall(): Return per-call cost estimate

3. Register adapter in engine registry:
   // src/engines/registry.ts
   registerEngine('gemini', new GeminiAdapter(config));

4. Add engine to database enum:
   ALTER TYPE engine_type ADD VALUE 'gemini';

5. Update UI engine selector:
   // Add to engine options in prompt creation form
   
6. No changes needed to:
   - Scheduler (discovers engines from prompt config)
   - Entity Extractor (works on StandardizedResponse)
   - Metric Engine (engine-agnostic scoring)
   - Recommendation Engine (engine-agnostic analysis)
```

### Prompt Engineering Templates

**For Entity Classification (Haiku/GPT-3.5):**
```
Given this AI-generated response and these brand/competitor names, 
identify all mentions. For each mention, provide:
- matched_text: exact text from response
- entity: which brand/competitor it refers to
- confidence: 0-1 score
- position: first_third | middle_third | last_third

Brand: {brand_name}
Aliases: {aliases}
Competitors: {competitor_names}

Response text:
{response_text}

Return JSON array of mentions.
```

**For Recommendation Generation (Sonnet/GPT-4o):**
```
You are an AI visibility optimization expert. Based on the following 
visibility data, generate actionable recommendations.

Brand: {brand_name}
Current visibility score: {score}/100
Competitor scores: {competitor_scores}
Key gaps: {gaps}
Citation analysis: {citations}

For each recommendation provide:
- evidence: specific quote or data point supporting this recommendation
- action: specific, actionable step the user should take
- impact: high/medium/low
- confidence: how certain you are this will improve visibility

Focus on content optimization, not technical SEO.
Limit to top 5 recommendations ordered by impact.
```

### Cost Optimization Rules

1. **Never use GPT-4o or Claude Sonnet for classification** — Haiku/GPT-3.5 achieves 95%+ accuracy on NER tasks
2. **Batch extraction calls** — Send multiple responses in one LLM call where context window allows
3. **Cache prompt suggestions** — Same industry/domain → reuse suggestions for 7 days
4. **Algorithmic first, LLM second** — Use regex/string matching before LLM for entity extraction
5. **Model fallback chain** — If Sonnet is unavailable, fall back to GPT-4o-mini (not GPT-4o)
6. **Track cost per workspace** — Alert at 150% of expected cost; throttle at 200%

### Error Handling Strategy for AI Calls

```typescript
async function executeWithFallback(
  task: ModelTask, 
  input: string
): Promise<ModelResponse> {
  const chain = modelRouter.getFallbackChain(task);
  
  for (const config of chain) {
    try {
      const response = await callModel(config, input);
      trackCost(config.costPerCall);
      return response;
    } catch (error) {
      if (isRateLimitError(error)) {
        await delay(getBackoffMs(config));
        continue;
      }
      if (isAuthError(error)) {
        alertAdmin(`Auth failure for ${config.provider}`);
        continue; // try next in chain
      }
      // Unknown error — log and try next
      logError(error, config);
      continue;
    }
  }
  
  throw new AllModelsFailedError(task);
}
```

---

## Security Design

### API Key Management

```
User's AI engine keys → NOT stored (platform uses its own keys)
Platform API keys → AWS Secrets Manager (rotated quarterly)
User auth tokens → Short-lived JWTs (15min) + refresh tokens (7 days)
Workspace API keys → Hashed in DB, displayed once on creation
```

### Data Access Control Matrix

| Resource | Owner | Viewer | Admin |
|----------|-------|--------|-------|
| Workspace config | CRUD | R | CRUD |
| Prompts | CRUD | R | CRUD |
| Run data | R (trigger) | R | R |
| Metrics | R | R | R |
| Raw responses | R | R | R |
| Recommendations | R | R | R |
| Billing/costs | R | — | CRUD |
| Admin panel | — | — | CRUD |

---

## Monitoring & Observability

### Key Metrics to Track

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| Run success rate | < 95% over 24h | Page on-call |
| Engine circuit breaker open | Any engine | Alert admin |
| Queue depth | > 1000 jobs | Scale workers |
| API cost (daily) | > 2x daily average | Alert admin |
| Dashboard p95 latency | > 3s | Investigate query performance |
| Extraction confidence avg | < 0.6 across workspace | Review brand config |
| Failed login attempts | > 10/min from same IP | Rate limit + alert |

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- Project setup (Next.js, PostgreSQL, Redis, Prisma)
- Auth system (signup, login, session management)
- Workspace CRUD
- Brand profile configuration
- Database schema + migrations

### Phase 2: Engine Integration (Weeks 3-4)
- Engine adapter interface
- ChatGPT adapter implementation
- Perplexity adapter implementation
- SERP provider adapter implementation
- Circuit breaker + retry logic
- Manual run trigger (no scheduling yet)

### Phase 3: Processing Pipeline (Weeks 5-6)
- Entity extraction (exact + fuzzy matching)
- Citation extraction and normalization
- Confidence scoring
- Visibility score computation
- Metric storage and aggregation

### Phase 4: Scheduling & Automation (Week 7)
- BullMQ job queue setup
- Weekly scheduler (cron)
- Rate limiting per engine
- Run status tracking
- Error logging and retry handling

### Phase 5: Dashboard & UX (Weeks 8-10)
- Overview dashboard
- Prompt-level detail view
- Competitor comparison view
- Citation sources panel
- Recommendation display
- CSV export
- Onboarding wizard
- Notification system (email + in-app)

### Phase 6: Admin & Hardening (Weeks 11-12)
- Admin panel (costs, usage, failures)
- Rate limiting and fair usage enforcement
- Data integrity checks (checksums)
- Audit logging
- Performance optimization
- Security review
- Load testing at target scale (100 workspaces)

---

## Error Handling

### Strategy Overview

The system uses a layered error handling approach:

1. **Engine-level**: Circuit breakers + exponential backoff retries (3 attempts)
2. **Pipeline-level**: Partial failure tolerance — one failed extraction doesn't block the run
3. **Model-level**: Fallback chains — if primary LLM fails, route to secondary
4. **Platform-level**: Queue-based resilience — failed jobs are retried; dead-letter queue for permanent failures

### Error Categories

| Category | Examples | Response |
|----------|----------|----------|
| Transient | Rate limits, timeouts, 503s | Retry with backoff |
| Auth | Invalid API key, expired token | Alert admin, circuit break |
| Data | Unparseable response, empty result | Store raw, mark extraction failed, continue |
| System | DB connection lost, Redis down | Queue backs up, auto-recover on reconnect |
| Business | Plan limit exceeded, duplicate prompt | Reject with user-friendly message |

## Testing Strategy

### Unit Tests
- Visibility score computation (deterministic, property-testable)
- Entity extraction (exact match, fuzzy match, edge cases)
- URL normalization
- Confidence scoring
- Rate limit calculations

### Integration Tests
- Engine adapter → real API calls (limited, use test prompts)
- Database operations (CRUD, versioning, soft-delete)
- Queue processing (job creation → worker execution → completion)
- Auth flow (signup → login → workspace access)

### Property-Based Tests
- Score bounds (always 0-100)
- Score determinism (same input → same output)
- Metric traceability (every metric has valid source chain)
- Prompt limit enforcement (never exceeds 25)
- Run completeness (successful + failed + skipped = total)

### End-to-End Tests
- Onboarding → baseline run → dashboard display
- Manual run trigger → results visible
- Competitor addition → appears in next run

---

## Correctness Properties

### Property 1: Visibility Score Bounds
FOR ALL extraction results, THE Metric_Engine SHALL produce a Visibility_Score between 0 and 100 inclusive.
**Validates: Requirements 6.1**

### Property 2: Score Determinism
FOR ALL identical extraction inputs, THE Metric_Engine SHALL produce identical Visibility_Score outputs (pure function).
**Validates: Requirements 6.1**

### Property 3: Metric Traceability
FOR ALL displayed metrics, there SHALL exist a valid chain: metric → execution → raw_response with matching IDs.
**Validates: Requirements 6.6**

### Property 4: Engine Adapter Isolation
FOR ALL engine failures, THE System SHALL complete runs for all other engines without data loss.
**Validates: Requirements 18.1**

### Property 5: Data Versioning Integrity
FOR ALL brand profile changes, historical metrics SHALL remain linked to the brand profile version active at collection time (no retroactive recalculation).
**Validates: Requirements 12.2**

### Property 6: Rate Limit Compliance
FOR ALL time windows, THE System SHALL not exceed configured per-engine rate limits regardless of concurrent workspace activity.
**Validates: Requirements 20.5**

### Property 7: Prompt Limit Enforcement
FOR ALL workspaces, THE active prompt count SHALL never exceed the configured plan maximum (25 for V1).
**Validates: Requirements 3.3**

### Property 8: Extraction Confidence Consistency
FOR ALL exact brand name matches, THE Entity_Extractor SHALL assign a Confidence_Score of 1.0.
**Validates: Requirements 5.6**

### Property 9: Run Completeness
FOR ALL completed runs, THE sum of (successful + failed + skipped) executions SHALL equal (active_prompts × assigned_engines).
**Validates: Requirements 4.6**

### Property 10: Audit Log Immutability
FOR ALL audit log entries, THE Data_Store SHALL reject any update or delete operations (append-only).
**Validates: Requirements 19.1**
**Validates: Requirement 19.1**

---

## Platform Configuration System (Runtime-Configurable)

All tunable parameters are stored in a `platform_config` table and loaded at runtime. This means you can change behavior from the admin panel or database without redeploying code. Every config value has a sensible default hardcoded in the application as fallback.

### Config Table Schema

```sql
platform_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  category VARCHAR(50), -- 'scoring', 'limits', 'engines', 'costs', 'auth'
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(100)
)
```

### Configurable Parameters

| Key | Default | Category | Purpose |
|-----|---------|----------|---------|
| `scoring.mention_weight` | 0.25 | scoring | Weight for mention presence factor |
| `scoring.position_weight` | 0.25 | scoring | Weight for mention position factor |
| `scoring.recommendation_weight` | 0.25 | scoring | Weight for recommendation strength factor |
| `scoring.citation_weight` | 0.25 | scoring | Weight for citation inclusion factor |
| `scoring.variance_threshold` | 10 | scoring | Points below which WoW change is "normal variance" |
| `scoring.significant_shift` | 30 | scoring | Points above which change is "significant shift" |
| `limits.max_prompts_free` | 25 | limits | Max active prompts per free workspace |
| `limits.max_competitors` | 5 | limits | Max competitors per workspace |
| `limits.max_aliases` | 3 | limits | Max brand aliases |
| `limits.manual_run_cooldown_hours` | 24 | limits | Hours between manual runs |
| `limits.max_prompt_length` | 500 | limits | Max characters in prompt text |
| `limits.min_prompt_length` | 10 | limits | Min characters in prompt text |
| `limits.prompt_similarity_threshold` | 0.8 | limits | Cosine similarity threshold for duplicate warning |
| `engines.openai_rpm` | 60 | engines | OpenAI requests per minute |
| `engines.perplexity_rpm` | 50 | engines | Perplexity requests per minute |
| `engines.serp_rpm` | 30 | engines | SERP provider requests per minute |
| `engines.circuit_breaker_failures` | 5 | engines | Consecutive failures before circuit opens |
| `engines.circuit_breaker_pause_ms` | 1800000 | engines | Pause duration when circuit opens (30min) |
| `engines.retry_max_attempts` | 3 | engines | Max retry attempts per execution |
| `engines.retry_base_delay_ms` | 1000 | engines | Base delay for exponential backoff |
| `engines.timeout_ms` | 30000 | engines | Per-call timeout |
| `costs.run_budget_usd` | 5.00 | costs | Max spend per single run before abort |
| `costs.workspace_daily_cap_calls` | 500 | costs | Max API calls per workspace per day |
| `costs.platform_daily_cap_usd` | 50.00 | costs | Platform-wide daily spend cap |
| `costs.throttle_threshold_pct` | 150 | costs | % of plan allocation before throttling |
| `costs.kill_threshold_pct` | 200 | costs | % of plan allocation before hard stop |
| `extraction.confidence_threshold` | 0.7 | extraction | Below this → flag as ambiguous |
| `extraction.fuzzy_min_length_pct` | 0.8 | extraction | Min % of brand name for fuzzy match |
| `extraction.max_llm_calls_per_response` | 1 | extraction | Max LLM disambiguation calls per response |
| `auth.token_expiry_minutes` | 15 | auth | JWT access token lifetime |
| `auth.refresh_expiry_days` | 7 | auth | Refresh token lifetime |
| `auth.dev_bypass_enabled` | false | auth | Enable dev auth bypass (NEVER true in prod) |
| `notifications.stale_data_days` | 7 | notifications | Days before SERP data is flagged stale |
| `notifications.failure_alert_threshold_pct` | 50 | notifications | % failure rate before alerting |

### How It Works in Code

```typescript
// src/lib/config.ts
class PlatformConfig {
  private cache: Map<string, any> = new Map();
  private readonly CACHE_TTL_MS = 60_000; // Refresh from DB every 60s
  
  async get<T>(key: string, defaultValue: T): Promise<T> {
    if (this.cache.has(key) && !this.isStale(key)) {
      return this.cache.get(key) as T;
    }
    const row = await db.platformConfig.findUnique({ where: { key } });
    const value = row?.value ?? defaultValue;
    this.cache.set(key, { value, fetchedAt: Date.now() });
    return value as T;
  }
  
  async set(key: string, value: any, updatedBy: string): Promise<void> {
    await db.platformConfig.upsert({
      where: { key },
      update: { value, updated_at: new Date(), updated_by: updatedBy },
      create: { key, value, updated_by: updatedBy }
    });
    this.cache.delete(key); // Invalidate cache
  }
}

export const config = new PlatformConfig();

// Usage anywhere in the app:
const maxRetries = await config.get('engines.retry_max_attempts', 3);
const budget = await config.get('costs.run_budget_usd', 5.00);
```

**Why this matters for debugging:** If something breaks (e.g., too many false positives), you can immediately adjust `extraction.confidence_threshold` from 0.7 to 0.85 without deploying code. If an engine is flaky, increase `engines.circuit_breaker_failures` from 5 to 10 to be more tolerant.

---

## Token Burn Protection & Agentic Safety Guards

These guards prevent runaway costs from stuck loops, infinite retries, or misbehaving LLM calls. Every guard is configurable via the platform_config table.

### Guard Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Cost Guardian Layer                    │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Per-Run  │  │Per-Work- │  │ Platform │  │  Kill  ││
│  │  Budget  │  │space Cap │  │Daily Cap │  │ Switch ││
│  └──────────┘  └──────────┘  └──────────┘  └────────┘│
└─────────────────────────────────────────────────────────┘
         │               │              │            │
┌────────┴───────────────┴──────────────┴────────────┴────┐
│                    Execution Layer                        │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐│
│  │ Timeout  │  │Dead Letter│  │ Response │  │ Queue  ││
│  │  Guard   │  │  Queue   │  │Validator │  │ Depth  ││
│  └──────────┘  └──────────┘  └──────────┘  └────────┘│
└─────────────────────────────────────────────────────────┘
```

### Guard Implementations

#### 1. Per-Run Budget Guard
```typescript
class RunBudgetGuard {
  private runningCost: number = 0;
  
  async checkBudget(estimatedCost: number): Promise<boolean> {
    const budget = await config.get('costs.run_budget_usd', 5.00);
    if (this.runningCost + estimatedCost > budget) {
      await this.abortRun('BUDGET_EXCEEDED', {
        spent: this.runningCost,
        budget,
        attempted: estimatedCost
      });
      return false; // Do NOT proceed
    }
    return true;
  }
  
  trackCost(actualCost: number): void {
    this.runningCost += actualCost;
  }
  
  private async abortRun(reason: string, details: object): Promise<void> {
    // Mark remaining jobs as "aborted - budget exceeded"
    // Alert admin
    // Log full details for investigation
  }
}
```

#### 2. Per-Workspace Daily Cap
```typescript
async function checkWorkspaceDailyCap(workspaceId: string): Promise<boolean> {
  const cap = await config.get('costs.workspace_daily_cap_calls', 500);
  const today = new Date().toISOString().split('T')[0];
  const usage = await db.apiUsage.aggregate({
    where: { workspace_id: workspaceId, date: today },
    _sum: { call_count: true }
  });
  return (usage._sum.call_count ?? 0) < cap;
}
```

#### 3. LLM Call Timeout (Hard 30s)
```typescript
async function callModelWithTimeout(config: ModelConfig, input: string): Promise<string> {
  const timeout = await platformConfig.get('engines.timeout_ms', 30000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(config.endpoint, {
      signal: controller.signal,
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: input }] })
    });
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
```

#### 4. Dead Letter Queue (No Infinite Retries)
```typescript
// BullMQ job configuration
const jobOptions = {
  attempts: 3, // Max 3 attempts total
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: true,
  removeOnFail: false, // Keep in DLQ for investigation
};

// After 3 failures → job moves to DLQ automatically
// DLQ jobs are NEVER auto-retried — require manual intervention or admin action
```

#### 5. Response Validation (Prevent Malformed Output Loops)
```typescript
function validateLLMResponse(response: string, expectedSchema: ZodSchema): ValidationResult {
  try {
    const parsed = JSON.parse(response);
    return expectedSchema.safeParse(parsed);
  } catch {
    return { success: false, error: 'Invalid JSON from LLM' };
  }
}

// If validation fails 3 times for same input → skip, flag for manual review
// NEVER retry indefinitely hoping for valid output
async function extractWithValidation(input: string, maxAttempts = 3): Promise<ExtractionResult | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await callModel(input);
    const validation = validateLLMResponse(response, ExtractionSchema);
    if (validation.success) return validation.data;
    logWarning(`LLM validation failed attempt ${i + 1}`, { input, response });
  }
  // Give up — flag for manual review, don't burn more tokens
  await flagForManualReview(input, 'LLM_VALIDATION_FAILED');
  return null;
}
```

#### 6. Extraction Loop Guard (Max 1 LLM Call Per Response)
```typescript
// CRITICAL: Prevents recursive LLM calls that spiral costs
const MAX_LLM_CALLS_PER_RESPONSE = await config.get('extraction.max_llm_calls_per_response', 1);

async function extractEntities(response: RawResponse): Promise<ExtractionResult> {
  let llmCallCount = 0;
  
  // Step 1: Algorithmic extraction (free, always runs)
  const exactMatches = findExactMatches(response.text, brandConfig);
  const fuzzyMatches = findFuzzyMatches(response.text, brandConfig);
  
  // Step 2: LLM disambiguation ONLY if needed AND within budget
  const ambiguousMatches = fuzzyMatches.filter(m => m.confidence < 0.7);
  
  if (ambiguousMatches.length > 0 && llmCallCount < MAX_LLM_CALLS_PER_RESPONSE) {
    // ONE batch call for ALL ambiguous matches — not one per match
    const disambiguation = await disambiguateWithLLM(ambiguousMatches, response.text);
    llmCallCount++;
  }
  
  // If still ambiguous after 1 LLM call → flag for human review, move on
  // NEVER call LLM again for the same response
}
```

#### 7. Scheduler Idempotency (Prevent Duplicate Runs)
```typescript
async function createWeeklyRun(workspaceId: string): Promise<Run | null> {
  const thisWeek = getISOWeek(new Date());
  
  // Check if run already exists for this workspace + week
  const existing = await db.runs.findFirst({
    where: { workspace_id: workspaceId, week: thisWeek, type: 'scheduled' }
  });
  
  if (existing) {
    logInfo(`Run already exists for workspace ${workspaceId} week ${thisWeek}, skipping`);
    return null; // Idempotent — no duplicate
  }
  
  return await db.runs.create({ data: { workspace_id: workspaceId, week: thisWeek, type: 'scheduled', status: 'queued' } });
}
```

#### 8. Platform Kill Switch
```typescript
// Admin can pause ALL processing instantly
async function checkKillSwitch(): Promise<boolean> {
  const killed = await config.get('platform.kill_switch', false);
  if (killed) {
    logCritical('KILL SWITCH ACTIVE — all processing paused');
    return false; // Do not proceed with any execution
  }
  return true;
}

// Called at the start of every worker job
worker.on('active', async (job) => {
  if (!await checkKillSwitch()) {
    throw new Error('Platform kill switch active');
  }
});
```

#### 9. Queue Depth Monitor
```typescript
// Runs every 5 minutes
async function monitorQueueHealth(): Promise<void> {
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const delayed = await queue.getDelayedCount();
  
  const total = waiting + active + delayed;
  
  if (total > 1000) {
    await alertAdmin('QUEUE_DEPTH_HIGH', { waiting, active, delayed, total });
    // Pause new job creation until queue drains
    await config.set('platform.pause_new_runs', true, 'system:queue_monitor');
  }
  
  if (total < 100 && await config.get('platform.pause_new_runs', false)) {
    // Queue recovered — resume
    await config.set('platform.pause_new_runs', false, 'system:queue_monitor');
  }
}
```

#### 10. Cost Tracking Per Call (Real-Time)
```typescript
// Wraps every external API call
async function trackedApiCall(
  engine: string, 
  workspaceId: string, 
  callFn: () => Promise<any>
): Promise<any> {
  const startTime = Date.now();
  
  // Pre-check: can this workspace still make calls today?
  if (!await checkWorkspaceDailyCap(workspaceId)) {
    throw new WorkspaceDailyCapExceededError(workspaceId);
  }
  
  const result = await callFn();
  
  // Post-call: record usage immediately
  const cost = getEngineCostPerCall(engine);
  await db.apiUsage.upsert({
    where: { workspace_id_engine_date: { workspace_id: workspaceId, engine, date: today() } },
    update: { call_count: { increment: 1 }, estimated_cost: { increment: cost } },
    create: { workspace_id: workspaceId, engine, date: today(), call_count: 1, estimated_cost: cost }
  });
  
  return result;
}
```

### Summary: What Prevents Token Burning

| Scenario | Guard | Outcome |
|----------|-------|---------|
| Engine keeps failing, retries forever | Circuit breaker + DLQ | Stops after 3 retries, pauses engine after 5 failures |
| LLM returns garbage JSON repeatedly | Response validator (3 attempts max) | Flags for manual review, stops calling |
| Disambiguation LLM called recursively | Loop guard (1 call/response) | One batch call max, then human review |
| Cron fires twice, creates duplicate run | Scheduler idempotency check | Second call is no-op |
| Single workspace burns through budget | Per-workspace daily cap | Hard stop at 500 calls/day |
| Entire run costs spiral | Per-run budget ($5 default) | Aborts remaining jobs when budget hit |
| Everything goes wrong at once | Platform kill switch | Admin pauses all processing instantly |
| Queue fills up from cascading failures | Queue depth monitor | Pauses new runs at 1000 pending jobs |

---

## Authentication & Testing Strategy

### MVP Auth Flow (NextAuth.js — Free)

```
┌─────────────────────────────────────────────────┐
│              Auth Flow (Production)               │
│                                                  │
│  User → Email Magic Link → Verify → Session     │
│  User → Google OAuth → Callback → Session       │
│                                                  │
│  Session: JWT (15min) + Refresh Token (7 days)  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│           Auth Flow (Development)                │
│                                                  │
│  DEV_AUTH_BYPASS=true → Auto-login as admin     │
│  No email verification required                  │
│  Long-lived tokens (24h) for convenience        │
└─────────────────────────────────────────────────┘
```

### Development & Testing Setup

```typescript
// src/lib/auth-config.ts
export const authConfig = {
  providers: [
    // Always available
    EmailProvider({ server: process.env.EMAIL_SERVER }),
    
    // Google OAuth (optional — works without it)
    ...(process.env.GOOGLE_CLIENT_ID ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    ] : []),
  ],
  
  // Dev bypass — ONLY when DEV_AUTH_BYPASS=true AND NODE_ENV=development
  ...(process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV === 'development' ? {
    callbacks: {
      async session() {
        return { user: { id: 'dev-admin', email: 'admin@localhost', role: 'admin' } };
      }
    }
  } : {}),
};
```

### Test Account Seeding

```typescript
// src/scripts/seed-dev-data.ts
// Run with: npx tsx src/scripts/seed-dev-data.ts

async function seedDevData() {
  // 1. Create test users
  const admin = await createUser({ email: 'admin@test.local', name: 'Test Admin', role: 'admin' });
  const owner = await createUser({ email: 'owner@test.local', name: 'Test Owner', role: 'owner' });
  const viewer = await createUser({ email: 'viewer@test.local', name: 'Test Viewer', role: 'viewer' });
  
  // 2. Create workspace with realistic data
  const workspace = await createWorkspace({
    name: 'Demo Brand',
    owner: owner.id,
    brand: { name: 'Acme SaaS', domain: 'acme.io', aliases: ['Acme', 'AcmeSaaS'] },
    competitors: [
      { name: 'CompetitorA', domain: 'competitor-a.com' },
      { name: 'CompetitorB', domain: 'competitor-b.com' },
    ]
  });
  
  // 3. Create sample prompts
  const prompts = await createPrompts(workspace.id, [
    { text: 'What is the best project management tool for startups?', intent: 'commercial' },
    { text: 'Compare Acme SaaS vs CompetitorA', intent: 'navigational' },
    { text: 'How to manage remote teams effectively', intent: 'informational' },
  ]);
  
  // 4. Create fake run results (no real API calls)
  await createFakeRunResults(workspace.id, prompts, {
    weeks: 4, // 4 weeks of historical data
    visibilityRange: [30, 75], // Realistic score range
    includeCompetitors: true,
  });
  
  console.log('✅ Dev data seeded successfully');
  console.log('   Admin: admin@test.local');
  console.log('   Owner: owner@test.local');
  console.log('   Viewer: viewer@test.local');
}
```

### Demo Mode (For Showing Product Without Real API Calls)

```typescript
// When DEMO_MODE=true, the system uses pre-recorded responses instead of calling real APIs
// This lets you demo the full product flow without spending API credits

interface DemoConfig {
  enabled: boolean;
  mockResponses: Map<string, StandardizedResponse>; // prompt hash → canned response
  simulateDelay: boolean; // Add realistic delays to feel authentic
}

// Demo mode is toggled via env var or admin panel
// Useful for: sales demos, investor presentations, onboarding walkthroughs
```

### Beta Testing Auth Strategy

| Phase | Auth Method | Why |
|-------|------------|-----|
| **Local development** | `DEV_AUTH_BYPASS=true` | Zero friction, instant access |
| **Staging/preview** | Email magic links (no verification) | Test email flow without real emails (use Mailtrap) |
| **Private beta (5-10 users)** | Email magic links + Google OAuth | Low friction, real auth flow |
| **Public beta** | Email magic links + Google OAuth + email verification | Full production auth |

### Environment Variables for Auth Control

```env
# Development
NODE_ENV=development
DEV_AUTH_BYPASS=true          # Auto-login as admin
SKIP_EMAIL_VERIFY=true        # Don't require email verification
AUTH_TOKEN_EXPIRY=86400       # 24h tokens in dev (vs 15min in prod)

# Staging
NODE_ENV=staging
DEV_AUTH_BYPASS=false
SKIP_EMAIL_VERIFY=true        # Still skip for beta testers
AUTH_TOKEN_EXPIRY=3600        # 1h tokens

# Production
NODE_ENV=production
DEV_AUTH_BYPASS=false         # NEVER true in production
SKIP_EMAIL_VERIFY=false
AUTH_TOKEN_EXPIRY=900         # 15min tokens
```

---

## Infrastructure Requirements Checklist

### What You Need to Provide (Before We Start Building)

#### Phase 1 — Immediate (Project Setup)

| Item | Action | Cost | Notes |
|------|--------|------|-------|
| GitHub/GitLab repo | Create empty repo | Free | I'll initialize the project structure |
| Vercel account | Sign up at vercel.com | Free | Connect to your Git repo |
| Neon account | Sign up at neon.tech | Free | PostgreSQL — auto-provisions |
| Upstash account | Sign up at upstash.com | Free | Redis + QStash — auto-provisions |
| Cloudflare account | Sign up at cloudflare.com | Free | R2 storage — create bucket |
| Resend account | Sign up at resend.com | Free | Email — get API key |
| Sentry account | Sign up at sentry.io | Free | Error monitoring |
| Your admin email | Provide to me | — | First admin account |
| Product name/domain | Decide | ~$12/year | For deployment and emails |

#### Phase 2 — Before Engine Integration

| Item | Action | Cost | Notes |
|------|--------|------|-------|
| OpenAI API key | Sign up at platform.openai.com | Pay-as-you-go | ~$0.0015/call with gpt-4o-mini |
| Perplexity API key | Sign up at perplexity.ai/settings/api | Pay-as-you-go | ~$0.005/call |
| SerpAPI key (free tier) | Sign up at serpapi.com | Free (100/month) | For development; upgrade later |
| Anthropic API key | Sign up at console.anthropic.com | Pay-as-you-go | For Haiku classification |

#### Phase 3 — Before Beta Launch

| Item | Action | Cost | Notes |
|------|--------|------|-------|
| Google OAuth credentials | Create in Google Cloud Console | Free | For "Sign in with Google" |
| Custom domain | Purchase + point DNS to Vercel | ~$12/year | Optional for beta, required for launch |
| ValueSERP account | Sign up when SerpAPI free tier runs out | $50/month | Only when you have real users |
| 5-10 beta tester emails | Recruit from your network | Free | For private beta invites |

#### Not Needed Until Post-MVP

| Item | When | Why |
|------|------|-----|
| AWS account | V2 (if scaling beyond free tiers) | Secrets Manager, larger infra |
| Stripe account | When launching paid plans | Payment processing |
| Custom SMTP | When sending >100 emails/day | Resend free tier limit |
| Dedicated worker hosting | When >10 workspaces run weekly | Railway or Fly.io ($5-25/mo) |

### Decisions Still Needed From You

| Decision | Options | Impact |
|----------|---------|--------|
| **Product name** | (your choice) | Domain, branding, email sender name |
| **Your admin email** | (provide) | First account, notifications |
| **Sample brand for testing** | Your own brand or a test brand | Seed data, demo workspace |
| **2-3 competitors for testing** | Real competitors in your space | Realistic test data |
| **Target beta date** | Rough timeline | Prioritization of features |

---

## Modifiability Design Principles

### Why Every Component Is Easy to Fix

| Principle | Implementation | Benefit |
|-----------|---------------|---------|
| **Config over code** | All thresholds in `platform_config` table | Change behavior without deployment |
| **Adapter pattern** | Each engine is an independent module | Fix one engine without touching others |
| **Pipeline isolation** | Extraction → Metrics → Recommendations are separate stages | Debug one stage independently |
| **Feature flags** | Toggle features on/off per workspace | Roll back features without reverting code |
| **Immutable data** | Raw responses never modified; metrics append-only | Always have ground truth to debug against |
| **Audit trail** | Every extraction decision logged with reasoning | Trace exactly why a score was computed |
| **View source** | Every metric links to its raw data | Users can verify; you can debug |
| **Versioned configs** | Brand profiles and prompts are versioned | Compare behavior before/after changes |
| **Graceful degradation** | Partial failures don't block the system | One broken thing doesn't cascade |
| **Dead letter queue** | Failed jobs preserved for investigation | Never lose context on what went wrong |

### Debugging Workflow (When Something Goes Wrong)

```
1. User reports: "My visibility score seems wrong"
   → Click "view source" on the metric
   → See raw response + extraction decisions + confidence scores
   → Identify if it's an extraction issue or scoring issue

2. Admin notices: "Costs spiked today"
   → Check admin panel → per-workspace usage breakdown
   → Identify which workspace/engine caused the spike
   → Adjust config (throttle workspace, reduce limits)

3. Engine starts failing: "Perplexity returning errors"
   → Circuit breaker auto-opens after 5 failures
   → Dashboard shows "Perplexity data unavailable" indicator
   → Admin gets alert → investigate → fix → circuit breaker auto-resets

4. LLM producing bad extractions: "Too many false positives"
   → Check extraction confidence average in admin panel
   → Increase confidence_threshold from 0.7 to 0.85 via config
   → Immediate effect on next run — no code change needed
```
