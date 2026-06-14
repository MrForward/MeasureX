# MeasureX MVP — Product Requirements Document
## Version: Ship-in-2-Weeks | Last Updated: June 2026

---

## 1. Product Definition

MeasureX monitors how AI answer engines (ChatGPT, Perplexity) talk about a brand versus its competitors. Users see a visibility score, prompt-level breakdown, competitor comparison, and raw AI responses as evidence.

**Entry price:** $9/month USD.
**Target user:** Growth/content marketer at a US/European B2B SaaS company (Series A-C, 2-10 person marketing team).
**Core promise:** "See how AI search talks about your brand. Compare against competitors. Know what's changing."

---

## 2. Scope

### In scope (ship in 2 weeks)

| # | Feature | Priority |
|---|---------|----------|
| 1 | Landing page with value prop + Stripe Checkout | P0 |
| 2 | Stripe webhook handling (activate/deactivate) | P0 |
| 3 | Onboarding wizard (brand + competitors + prompt generation + selection) | P0 |
| 4 | ChatGPT engine runner (OpenAI gpt-4o-mini) | P0 |
| 5 | Perplexity engine runner (Sonar API) | P0 |
| 6 | Extraction pipeline (mentions, citations, position, recommendation strength) | P0 |
| 7 | Scoring engine (0-100 visibility score) | P0 |
| 8 | Dashboard (score, prompt table, competitor comparison) | P0 |
| 9 | Raw answer viewer (full AI response with highlights) | P0 |
| 10 | Manual "Run Scan" button | P0 |
| 11 | Scan completion email via Resend | P1 |
| 12 | Basic account settings (edit prompts, billing portal link) | P1 |

### Out of scope (post-launch additions, in order)

| Feature | Add in | Rationale for deferral |
|---------|--------|----------------------|
| Automated weekly scheduler (QStash/cron) | Week 4 | Hardest technical piece. Manual scan validates demand first. |
| Weekly email digest with changes | Week 4 | Requires scheduler + diff logic. |
| Score trend sparkline | Week 5 | Requires 2+ scans of historical data. Ship current score only. |
| Content recommendations via Claude | Week 5 | Raw data implicitly shows gaps. Explicit recs are a v1.1 feature. |
| Shareable dashboard URL | Week 6 | Users screenshot for now. |
| Google AI Overview (3rd engine) | Week 6+ | Requires SERP API integration + cost. |
| MCP integrations (GA4, GSC) | $29 plan | Post-PMF feature. |

---

## 3. User Flow

```
[Landing Page] → [Stripe Checkout $9/mo] → [Onboarding Wizard] → [First Scan Running] → [Dashboard with Results] → [Manual Re-scan whenever]
```

### Step 1 — Landing Page
User arrives. Sees headline, value prop, one CTA button.

### Step 2 — Payment
Clicks CTA → Stripe Checkout session opens. Pays $9/mo. On success → redirect to onboarding.

### Step 3 — Onboarding Wizard
Four-step form:
1. Brand name + domain URL
2. Competitor 1: name + domain
3. Competitor 2: name + domain
4. System generates 20-25 candidate prompts via Claude API → user reviews, edits, toggles on/off, selects 10-20 → confirms

### Step 4 — First Scan
System runs all selected prompts across both engines. Dashboard shows loading state with progress indicator. Typical completion: 2-5 minutes.

### Step 5 — Dashboard
Results render. User explores score, prompt table, competitor data, clicks into raw answers.

### Step 6 — Re-scan
User clicks "Run Scan" button on dashboard whenever they want fresh data. System runs full scan again, stores new results alongside historical ones, shows latest results with delta from previous scan.

---

## 4. Feature Specifications

### F1: Landing Page

**What it does:** Converts visitors to Stripe Checkout.

**Content structure:**
- Hero: headline + subheadline + CTA button
- Social proof section (structurally present, empty at launch — add testimonials later)
- 3 value prop blocks (brief prose, not bullet lists):
  - "Track your brand across ChatGPT and Perplexity"
  - "See exactly where competitors beat you"
  - "Evidence-backed — view every raw AI response"
- Final CTA
- Footer: minimal (link to billing portal, contact email)

**Design direction:** Clean, dark or light neutral palette, premium typography. Must not look like a template. Must not look "cheap" despite $9 price. Reference: Linear, Vercel, or PostHog landing page energy.

**Acceptance criteria:**
- [ ] Page loads in <2s on 3G throttle
- [ ] CTA links to Stripe Checkout session
- [ ] Mobile responsive (single column below 768px)
- [ ] No lorem ipsum, no placeholder images
- [ ] Meta tags: title, description, OG image set

---

### F2: Stripe Billing

**What it does:** Accepts $9/mo payment, manages subscription lifecycle.

**Stripe configuration:**
- Product: "MeasureX Scan"
- Price: $9.00 USD / month, recurring
- Checkout mode: subscription
- Success URL: `/onboarding` (with session_id param)
- Cancel URL: `/` (landing page)

**Webhook events to handle:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create user record. Set `subscriptionStatus: "active"`. Set `stripeCustomerId` and `stripeSubscriptionId`. Redirect to onboarding. |
| `customer.subscription.deleted` | Set `subscriptionStatus: "canceled"`. Block new scans. Keep data for 30 days. |
| `invoice.payment_failed` | Set `subscriptionStatus: "past_due"`. Send warning email. Block new scans after 3 consecutive failures. |

**Account management:**
- Settings page includes "Manage billing" link → Stripe Customer Portal (Stripe-hosted, handles plan changes, cancellation, payment method updates)

**Acceptance criteria:**
- [ ] Checkout completes and creates user with `active` status
- [ ] Canceled subscription blocks "Run Scan" button with "Resubscribe" prompt
- [ ] Webhook endpoint validates Stripe signature
- [ ] No API keys or secrets in client-side code
- [ ] Idempotent: duplicate webhook calls don't create duplicate users

**Eval — Billing lifecycle test:**
1. Complete checkout → verify user created, status `active`, can access dashboard
2. Cancel subscription in Stripe dashboard → verify status changes to `canceled`, "Run Scan" disabled
3. Trigger `invoice.payment_failed` test event → verify status changes to `past_due`

---

### F3: Onboarding Wizard

**What it does:** Collects brand info, competitors, generates and lets user select prompts.

**Step 1 — Brand input:**
- Fields: brand name (required, max 100 chars), domain URL (required, validated as URL)
- Validation: domain must be reachable or at least well-formed URL. Strip protocol and trailing slash for storage.

**Step 2 — Competitor 1:**
- Fields: competitor name (required), competitor domain (required)
- Same validation as brand domain

**Step 3 — Competitor 2:**
- Fields: competitor name (required), competitor domain (required)
- Allow "Skip" option if user only wants 1 competitor

**Step 4 — Prompt generation + selection:**

System calls Claude API (claude-haiku-4-5-20251001) with this prompt structure:

```
System: You are an expert in AI search optimization. Generate search prompts that a potential buyer would type into ChatGPT or Perplexity when researching products in this brand's category.

User: Brand: {brand_name}, Domain: {domain}, Competitors: {comp1_name}, {comp2_name}.

Generate exactly 25 prompts in JSON array format. Each prompt should be an object with "text" (the prompt) and "category" (one of: "category", "comparison", "buyer_intent").

Rules:
- Category prompts (10): generic category searches like "best [category] tools", "top [category] software 2026"
- Comparison prompts (8): direct comparisons like "{brand} vs {competitor}" or "compare {brand} and {competitor}"
- Buyer intent prompts (7): specific need searches like "which [category] tool for [use case]"
- Do NOT use brand name in category prompts (these test organic discovery)
- DO use brand and competitor names in comparison prompts
- Make prompts realistic — things a real buyer would search
- Return ONLY the JSON array, no other text
```

UI displays the 25 prompts as a selectable list:
- Each prompt shows text + category badge
- Toggle on/off per prompt
- Inline edit (user can modify prompt text)
- "Add custom prompt" button at bottom
- Counter: "X of 20 prompts selected" (min 10, max 20)
- Confirm button: disabled until 10+ prompts selected

On confirm: store prompts in database, trigger first scan, redirect to dashboard.

**Acceptance criteria:**
- [ ] Claude API returns valid JSON array of 25 prompts
- [ ] Handles Claude API failure gracefully (show retry button, not crash)
- [ ] User can select between 10 and 20 prompts
- [ ] User can edit prompt text inline
- [ ] User can add custom prompts (counted toward 20 limit)
- [ ] Confirm button triggers first scan
- [ ] Prompts stored with brand_id, category, text, active status

**Eval — Prompt quality test:**
Run onboarding for 3 different brands (one SaaS, one ecommerce, one agency). For each, verify:
- All 25 prompts are relevant to the brand's category
- No duplicate prompts
- Comparison prompts correctly use brand and competitor names
- Category prompts do NOT contain brand name
- JSON parsing succeeds without errors

---

### F4: Engine Runners

**What they do:** Call ChatGPT and Perplexity APIs with each prompt, return and store raw responses.

#### F4a: ChatGPT Runner

**API call spec:**
```
POST https://api.openai.com/v1/chat/completions
Model: gpt-4o-mini
Messages:
  - system: "You are a helpful assistant. Answer the user's question thoroughly. When relevant, recommend specific products, tools, or companies by name."
  - user: {prompt_text}
Temperature: 0.7
Max tokens: 1500
```

**Store per run:**
- `prompt_id`, `engine: "chatgpt"`, `model: "gpt-4o-mini"`, `raw_response` (full text), `citations: []` (ChatGPT doesn't return structured citations), `tokens_used`, `created_at`, `status: "completed" | "failed"`, `error_message` (if failed)

#### F4b: Perplexity Runner

**API call spec:**
```
POST https://api.perplexity.ai/chat/completions
Model: sonar
Messages:
  - system: same as ChatGPT
  - user: {prompt_text}
Temperature: 0.7
Max tokens: 1500
```

**Store per run:**
- Same fields as ChatGPT, plus `citations: string[]` (Perplexity returns citation URLs in response)

#### Error handling (both runners):
- Retry 3x with exponential backoff: 1s, 3s, 9s
- On 429 (rate limit): wait for `Retry-After` header value, then retry
- On 3rd failure: mark run as `status: "failed"`, store error message, continue with next prompt
- Timeout: 30 seconds per call

#### Execution strategy:
- Sequential, not parallel. Process one prompt at a time across both engines before moving to next prompt.
- Rationale: avoids rate limiting, simpler error handling, and at 40 total calls (20 prompts × 2 engines) with ~3-5s per call, total scan time is 2-4 minutes. Acceptable for manual scan.
- Show progress on dashboard: "Running prompt 7 of 20..."

**Acceptance criteria:**
- [ ] ChatGPT runner returns valid response text for a known prompt
- [ ] Perplexity runner returns valid response text + citations array
- [ ] Failed calls retry 3x before marking as failed
- [ ] Rate limit responses trigger appropriate wait
- [ ] Timeout after 30s doesn't crash the process
- [ ] All responses stored in database with correct timestamps

**Eval — Engine runner test:**
Run 5 prompts through each engine. Verify:
- 10/10 return valid responses (assuming APIs are up)
- Perplexity responses include citation URLs
- Response text is >100 chars (not truncated or empty)
- Token usage is recorded
- Failed runs (simulate by using invalid API key) are logged with error message

---

### F5: Extraction Pipeline

**What it does:** Analyzes each raw response to detect brand/competitor mentions, citations, position, and recommendation strength. Rule-based only — no LLM calls.

#### F5a: Brand Mention Detection

For brand and each competitor, check the raw response for:

**Exact match (case-insensitive):**
- Brand name: e.g., "MeasureX" matches "measurex", "MEASUREX", "Measurex"
- Domain: e.g., "measurex.io" matches if the domain appears in text

**Match rules:**
- Word boundary matching: "Arc" should NOT match "architecture" or "search". Use word boundary regex: `\b{brand_name}\b` (case-insensitive)
- Domain matching: check for domain with and without TLD: "measurex.io" and "measurex"
- Minimum name length for fuzzy: only apply word boundary matching if brand name is 3+ characters. For 1-2 char names, require exact domain match only.

**Output per entity (brand + each competitor):**
- `mentioned: boolean`
- `mention_count: integer` (total occurrences in response)
- `first_mention_position: integer | null` (character offset of first mention, used for ordering)

#### F5b: Mention Position

Determine the order in which entities appear in the response:
1. For each detected entity, record `first_mention_position` (char offset)
2. Sort all detected entities by position
3. Assign rank: 1st, 2nd, 3rd
4. Store `brand_position: integer | null` (null if brand not mentioned)

#### F5c: Citation Extraction

**Perplexity:** Extract from the native `citations` array in the API response. These are structured URLs.

**ChatGPT:** Regex scan for URLs in response text:
```regex
https?://[^\s\)\]\"\'<>]+
```
- Clean extracted URLs: remove trailing punctuation (period, comma, parenthesis)
- Normalize: lowercase domain, remove `www.` prefix, remove trailing slash

**Citation classification:**
For each extracted URL, classify by comparing domain against:
- Brand domain → `"owned"`
- Any competitor domain → `"competitor"` (store which competitor)
- Known review sites (g2.com, capterra.com, trustpilot.com, gartner.com) → `"review_site"`
- Known publications (techcrunch.com, forbes.com, wired.com, hbr.org) → `"publication"`
- reddit.com, quora.com, stackoverflow.com → `"forum"`
- Everything else → `"other"`

Store as array: `[{url, domain, classification, competitor_name?}]`

#### F5d: Recommendation Strength

Scan response text for patterns (case-insensitive):

| Classification | Patterns |
|---|---|
| `RECOMMENDED` | "I recommend {brand}", "{brand} is the best", "top pick is {brand}", "{brand} is ideal", "I'd suggest {brand}", "{brand} is my recommendation", "best option is {brand}", "{brand} stands out" |
| `MENTIONED` | Brand name detected but none of the recommendation patterns match |
| `ABSENT` | Brand name not detected in response |

**Important negative filter:** If recommendation pattern appears in a negation context ("I wouldn't recommend", "not the best", "{brand} is not ideal"), classify as `MENTIONED`, not `RECOMMENDED`.

Negation check: scan 10 characters before the recommendation pattern for: "not", "n't", "wouldn't", "don't", "shouldn't", "hardly", "barely", "no longer".

**Output:**
- `recommendation_strength: "RECOMMENDED" | "MENTIONED" | "ABSENT"`

#### Storage per extraction:

```
{
  run_id,
  brand_mentioned: boolean,
  brand_position: integer | null,
  brand_mention_count: integer,
  brand_recommendation: "RECOMMENDED" | "MENTIONED" | "ABSENT",
  competitors: [
    {
      competitor_id,
      mentioned: boolean,
      position: integer | null,
      mention_count: integer,
      recommendation: "RECOMMENDED" | "MENTIONED" | "ABSENT"
    }
  ],
  citations: [
    { url, domain, classification, competitor_name? }
  ]
}
```

**Acceptance criteria:**
- [ ] Exact brand name match works case-insensitively
- [ ] Word boundary matching prevents "Arc" → "architecture" false positive
- [ ] Domain matching detects "measurex.io" in response text
- [ ] Position ordering is correct (1st mention gets rank 1)
- [ ] Perplexity citations extracted from native array
- [ ] ChatGPT URLs extracted via regex
- [ ] Citation classification correctly identifies owned vs competitor domains
- [ ] Recommendation detection catches "I recommend X" patterns
- [ ] Negation filter catches "I wouldn't recommend X"
- [ ] Absent classification when brand not found

**Eval — Extraction accuracy test (CRITICAL):**

Create 10 synthetic responses covering edge cases:

| Test | Input Response Text | Expected Output |
|---|---|---|
| 1. Clean mention | "MeasureX is a good tool for monitoring." | mentioned: true, position: 1, rec: MENTIONED |
| 2. Recommendation | "I recommend MeasureX for AEO tracking." | mentioned: true, rec: RECOMMENDED |
| 3. Negation | "I wouldn't recommend MeasureX for enterprise." | mentioned: true, rec: MENTIONED (not RECOMMENDED) |
| 4. Absent | "Otterly and Peec are the top tools." | mentioned: false, position: null, rec: ABSENT |
| 5. Competitor first | "Otterly is great. MeasureX is also good." | brand position: 2 (Otterly is 1) |
| 6. Short name boundary | Brand "Arc" in "The architecture of search..." | mentioned: false (word boundary prevents match) |
| 7. Domain in URL | "Visit https://measurex.io for details." | mentioned: true, citation: [{url, classification: "owned"}] |
| 8. Multiple competitors | "Otterly, Peec, and MeasureX all offer..." | all three detected, positions assigned by order |
| 9. Perplexity citations | Response with citations: ["https://g2.com/...", "https://measurex.io/..."] | citations extracted with correct classification |
| 10. No URLs in ChatGPT | Response with no URLs | citations: [] |

Run all 10 tests. Pass threshold: 10/10 must pass. Extraction accuracy is non-negotiable — wrong data is worse than no data.

---

### F6: Scoring Engine

**What it does:** Computes a 0-100 visibility score from extraction results.

**Per prompt-engine score:**

| Condition | Points |
|---|---|
| Brand absent | 0 |
| Brand mentioned | 1 |
| Brand cited (brand domain URL in citations) | 2 |
| Brand recommended (rec strength = RECOMMENDED) | 3 |
| Brand appears before ALL tracked competitors | +1 bonus |

Points are not cumulative — take the highest applicable base (0/1/2/3) and add bonus if applicable. Max per prompt-engine: 4.

**Overall visibility score:**
```
score = (sum of all prompt-engine scores) / (num_prompts × num_engines × 4) × 100
```
Round to integer. Range: 0-100.

**Delta calculation:**
If a previous scan exists, compute: `delta = current_score - previous_score`
Store both current score and delta.

**Score storage:**
```
{
  brand_id,
  scan_id,
  overall_score: integer (0-100),
  delta: integer | null (null for first scan),
  per_engine_scores: { chatgpt: integer, perplexity: integer },
  prompt_scores: [{ prompt_id, engine, score: integer }],
  created_at
}
```

**Acceptance criteria:**
- [ ] Score = 0 when brand is absent from all responses
- [ ] Score = 100 when brand is recommended + cited + first position in every response
- [ ] Bonus point correctly awarded only when brand appears before ALL competitors
- [ ] Delta correctly computed against previous scan
- [ ] Delta is null for first-ever scan
- [ ] Scores persist for historical comparison

**Eval — Scoring test:**

| Scenario | Inputs | Expected Score |
|---|---|---|
| 20 prompts × 2 engines, brand absent everywhere | All scores = 0 | 0 |
| 20 prompts × 2 engines, brand mentioned everywhere | All scores = 1 | 25 |
| 20 prompts × 2 engines, brand recommended + first everywhere | All scores = 4 | 100 |
| 10 prompts mentioned (1pt), 10 absent (0pt), across 2 engines | Sum = 20, max = 160 | 13 |
| Mixed: 5 recommended (3), 5 cited (2), 5 mentioned (1), 5 absent (0) × 2 engines | Sum = 60, max = 160 | 38 |

---

### F7: Dashboard

**What it does:** Single-page display of all scan results.

**Layout:**

**Top section — Score overview:**
- Large number: visibility score (0-100)
- Delta badge: "+5" (green) or "-3" (red) or "First scan" (gray) — relative to previous scan
- Last scan timestamp: "Last scanned: June 7, 2026 at 2:34 PM"
- "Run Scan" button (primary action, top-right)

**Middle section — Prompt results table:**
Sortable, filterable table.

| Column | Content |
|---|---|
| Prompt | Prompt text (truncated to ~60 chars, full on hover) |
| Category | Badge: "category" / "comparison" / "buyer_intent" |
| Engine | Icon: ChatGPT / Perplexity |
| Your Brand | ✓ (green) or ✗ (red) |
| Competitor 1 | ✓ or ✗ (with name in column header) |
| Competitor 2 | ✓ or ✗ (with name in column header) |
| Position | "#1" / "#2" / "#3" / "—" |
| Score | 0-4 as numeric or visual indicator |

Each row is clickable → opens raw answer viewer (F8).

**Filter/sort controls:**
- Filter by engine: All / ChatGPT / Perplexity
- Filter by status: All / Brand mentioned / Brand absent / Competitor only
- Sort by: prompt text, score, position (default: score descending)

**Bottom section — Competitor comparison:**
Card per competitor:
- Competitor name + domain
- Their visibility score (computed same formula but for their brand)
- "Appears on X/Y prompts where you don't" (gap count)
- Simple horizontal bar: your score vs theirs

**States to handle:**
- Loading: shown during active scan, progress indicator "Running prompt X of Y"
- Empty: shown when no scans exist yet (should only appear briefly during first scan)
- Error: shown if scan partially failed, "X of Y prompts completed successfully, Z failed. Results shown for completed prompts."

**Acceptance criteria:**
- [ ] Score displays correctly with delta
- [ ] Table renders all prompt-engine combinations (prompts × engines rows)
- [ ] Rows correctly colored by status
- [ ] Sorting works on all columns
- [ ] Filtering works for engine and status
- [ ] Competitor cards show correct scores and gap counts
- [ ] Clicking a row opens raw answer viewer
- [ ] Loading state shows during active scan
- [ ] Partial failure state renders available results with error note

---

### F8: Raw Answer Viewer

**What it does:** Shows the full AI response for a specific prompt+engine run with entity highlighting.

**Triggered by:** clicking any row in the prompt results table.

**Content:**

Header:
- Prompt text (full)
- Engine name + icon
- Run date/time

Response body:
- Full raw response text from the AI engine
- Brand name occurrences highlighted with green background
- Competitor name occurrences highlighted with amber/orange background
- URL occurrences highlighted as clickable links (blue, underlined)

Below response:
- Citations section (if any URLs found):
  - List of extracted URLs with domain
  - Classification badge next to each: "Your site" / "Competitor" / "Review site" / "Publication" / "Forum" / "Other"
- Status summary: "Your brand: [Recommended/Mentioned/Absent] | Position: #X | Competitors mentioned: [names]"

**Implementation:** Modal or slide-out drawer. Must be dismissible with Escape key and click-outside.

**Acceptance criteria:**
- [ ] Full response text renders without truncation
- [ ] Brand mentions highlighted green
- [ ] Competitor mentions highlighted amber
- [ ] URLs are clickable
- [ ] Citations listed with correct classification
- [ ] Escape key closes viewer
- [ ] Works on mobile (full-screen drawer on small screens)

---

### F9: Manual "Run Scan" Button

**What it does:** Triggers a full scan of all active prompts across both engines.

**Location:** Dashboard top-right, always visible.

**Behavior:**
- Click → confirmation dialog: "Run a new scan? This will check all 20 prompts across ChatGPT and Perplexity. Takes about 2-4 minutes."
- On confirm → disable button (show spinner + "Scanning..."), start scan process
- Dashboard switches to loading state with progress indicator
- On complete → refresh dashboard with new results, show success toast, re-enable button
- On partial failure → show results for completed prompts + error count

**Guard rails:**
- Disable if a scan is already running
- Rate limit: max 1 scan per hour (prevent accidental cost spikes)
- Disable if subscription status is not `active`

**Acceptance criteria:**
- [ ] Button triggers scan and shows progress
- [ ] Button disabled during active scan
- [ ] Rate limit prevents scans within 1 hour of each other
- [ ] Inactive subscription blocks scan with "Resubscribe" message
- [ ] Dashboard auto-refreshes when scan completes

---

### F10: Scan Completion Email

**What it does:** Sends an email when a scan finishes.

**Trigger:** Scan completes (all prompt-engine runs finished or timed out).

**Template (via Resend):**

```
Subject: Your MeasureX scan is ready — Score: {score}

Body:
Your AI visibility scan is complete.

Visibility Score: {score}/100 {delta indicator}
Mentioned in: {mention_count}/{total_prompts} prompts
Competitors tracked: {comp1_name}, {comp2_name}

{If any competitor appears where brand doesn't:}
⚠ {comp_name} appeared on {gap_count} prompts where your brand didn't.

View your full dashboard: {dashboard_url}

— MeasureX
```

**Design:** Clean, minimal HTML email. Mobile-friendly. No images (faster delivery, fewer spam triggers). Brand color in header bar only.

**Acceptance criteria:**
- [ ] Email sends within 60s of scan completion
- [ ] Score and delta are correct
- [ ] Dashboard link works and goes to authenticated dashboard
- [ ] Email renders correctly on Gmail, Apple Mail, Outlook (test with Resend preview)

---

## 5. Data Model

### Prisma Schema

```prisma
model User {
  id                   String   @id @default(cuid())
  email                String   @unique
  name                 String?
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?  @unique
  subscriptionStatus   String   @default("inactive") // active, canceled, past_due, inactive
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  brand                Brand?
}

model Brand {
  id          String       @id @default(cuid())
  userId      String       @unique
  user        User         @relation(fields: [userId], references: [id])
  name        String
  domain      String
  aliases     String[]     @default([])
  competitors Competitor[]
  prompts     Prompt[]
  scans       Scan[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model Competitor {
  id        String   @id @default(cuid())
  brandId   String
  brand     Brand    @relation(fields: [brandId], references: [id])
  name      String
  domain    String
  createdAt DateTime @default(now())
}

model Prompt {
  id        String      @id @default(cuid())
  brandId   String
  brand     Brand       @relation(fields: [brandId], references: [id])
  text      String
  category  String      // "category", "comparison", "buyer_intent"
  active    Boolean     @default(true)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  runs      EngineRun[]
}

model Scan {
  id             String      @id @default(cuid())
  brandId        String
  brand          Brand       @relation(fields: [brandId], references: [id])
  status         String      @default("running") // running, completed, partial, failed
  overallScore   Int?
  previousScore  Int?
  delta          Int?
  engineScores   Json?       // { chatgpt: Int, perplexity: Int }
  totalPrompts   Int
  completedRuns  Int         @default(0)
  failedRuns     Int         @default(0)
  startedAt      DateTime    @default(now())
  completedAt    DateTime?
  runs           EngineRun[]
}

model EngineRun {
  id              String      @id @default(cuid())
  scanId          String
  scan            Scan        @relation(fields: [scanId], references: [id])
  promptId        String
  prompt          Prompt      @relation(fields: [promptId], references: [id])
  engine          String      // "chatgpt", "perplexity"
  model           String      // "gpt-4o-mini", "sonar"
  status          String      @default("pending") // pending, completed, failed
  rawResponse     String?     @db.Text
  nativeCitations Json?       // Perplexity citation URLs array
  tokensUsed      Int?
  errorMessage    String?
  createdAt       DateTime    @default(now())
  extraction      Extraction?
}

model Extraction {
  id                     String   @id @default(cuid())
  runId                  String   @unique
  run                    EngineRun @relation(fields: [runId], references: [id])
  brandMentioned         Boolean
  brandPosition          Int?
  brandMentionCount      Int      @default(0)
  brandRecommendation    String   // "RECOMMENDED", "MENTIONED", "ABSENT"
  competitorResults      Json     // [{competitor_id, mentioned, position, mention_count, recommendation}]
  citations              Json     // [{url, domain, classification, competitor_name?}]
  promptScore            Int      // 0-4
  createdAt              DateTime @default(now())
}
```

### Key relationships:
- User 1:1 Brand (one brand per account in MVP)
- Brand 1:N Competitors (max 2)
- Brand 1:N Prompts (max 20)
- Brand 1:N Scans (historical)
- Scan 1:N EngineRuns (prompts × engines per scan)
- EngineRun 1:1 Extraction

---

## 6. API Routes

| Method | Route | Purpose | Auth |
|--------|-------|---------|------|
| POST | `/api/stripe/checkout` | Create Stripe Checkout session | No (pre-auth) |
| POST | `/api/stripe/webhook` | Handle Stripe webhook events | Stripe signature |
| GET | `/api/brand` | Get user's brand + competitors + prompts | Yes |
| PUT | `/api/brand` | Update brand name/domain | Yes |
| POST | `/api/brand/onboard` | Create brand + competitors + prompts in one call | Yes |
| GET | `/api/prompts` | List user's prompts | Yes |
| POST | `/api/prompts` | Add a prompt | Yes |
| PUT | `/api/prompts/[id]` | Edit a prompt | Yes |
| DELETE | `/api/prompts/[id]` | Delete a prompt | Yes |
| POST | `/api/prompts/generate` | Call Claude to generate prompt suggestions | Yes |
| POST | `/api/scan/run` | Trigger a new scan | Yes |
| GET | `/api/scan/status` | Get current scan progress | Yes |
| GET | `/api/scan/latest` | Get latest scan results with extractions | Yes |
| GET | `/api/scan/[id]` | Get specific scan results | Yes |
| GET | `/api/run/[id]` | Get specific engine run + raw response | Yes |

**Auth:** NextAuth session check. Return 401 if not authenticated. All data queries filtered by user ID.

---

## 7. Evaluation Plan

### E1: End-to-end user journey test
Walk through the complete flow as a real user:
1. Visit landing page → click CTA → complete Stripe test checkout
2. Complete onboarding with a real brand (use your own or a well-known SaaS)
3. Wait for prompt generation → verify 25 prompts are relevant and well-categorized
4. Select 15 prompts → confirm → verify first scan starts
5. Wait for scan to complete → verify dashboard shows results
6. Check: is the visibility score plausible? (not 0 or 100 for a real brand)
7. Click 5 different prompt rows → verify raw answer viewer shows correct highlighted responses
8. Check competitor cards → verify competitor scores and gap counts make sense
9. Click "Run Scan" again → verify rate limit blocks within 1 hour
10. Wait 1 hour → run again → verify delta appears

**Pass criteria:** All 10 steps complete without errors. Score and extractions are manually verified against raw responses for at least 5 prompts.

### E2: Extraction accuracy test
Use the 10 synthetic response test cases from F5 eval section. Must pass 10/10.

### E3: Scoring math test
Use the 5 scenarios from F6 eval section. Must pass 5/5.

### E4: Error resilience test
1. Set invalid OpenAI API key → verify scan marks ChatGPT runs as failed, Perplexity runs succeed, partial results shown
2. Set invalid Perplexity API key → same, reversed
3. Set both invalid → verify scan fails gracefully, user sees clear error
4. Simulate timeout (set timeout to 1ms) → verify retry behavior, eventual failure logging
5. Cancel Stripe subscription → verify dashboard blocks new scans

### E5: Data integrity test
1. Run 2 scans for the same brand
2. Verify both scans stored independently with correct timestamps
3. Verify delta correctly computed between scan 1 and scan 2
4. Verify latest scan endpoint returns scan 2, not scan 1
5. Verify historical data accessible via scan/[id] endpoint

### E6: Performance test
1. Dashboard loads in <3s with 20 prompts × 2 engines (40 rows)
2. Raw answer viewer opens in <500ms
3. Scan completes in <5 minutes for 20 prompts × 2 engines
4. Landing page Lighthouse score: Performance >80, Accessibility >90

---

## 8. Tech Stack Summary

| Component | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | Neon PostgreSQL + Prisma ORM |
| Auth | NextAuth.js (email/password or magic link) |
| Payments | Stripe Checkout + Customer Portal |
| Email | Resend |
| Styling | Tailwind CSS + shadcn/ui |
| AI APIs | OpenAI (gpt-4o-mini), Perplexity (sonar), Anthropic (claude-haiku) |
| Hosting | Vercel |
| Scheduler (post-MVP) | QStash or Vercel Cron |

---

## 9. Post-MVP Roadmap (Weeks 4-8)

| Week | Addition |
|------|----------|
| 4 | Automated weekly scheduler (QStash) + weekly email digest with changes |
| 5 | Score trend sparkline (requires 3+ data points) + content recommendations (2/month via Claude Sonnet) |
| 6 | $29/mo "Analyze" plan: 50 prompts, 5 competitors, Google AI Overview, shareable dashboard URL, action plan report |
| 7 | Smart alerts: new competitor detected, citation source changed |
| 8 | Industry prompt templates, "Share your score" social card |
