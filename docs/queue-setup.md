# Queue Setup — Upstash Redis + QStash

MeasureX uses **Upstash Redis** for caching and the platform kill switch, and
**Upstash QStash** as the durable job queue. Both are serverless and work
seamlessly with Vercel's serverless architecture — no persistent worker process
required.

---

## Why Upstash instead of BullMQ?

BullMQ requires a long-running Node.js worker process to poll the queue.
Vercel's serverless functions are ephemeral (they spin up per request and shut
down after), so BullMQ workers cannot run there. QStash solves this by acting
as the worker itself: it stores messages durably and delivers them to your
Next.js API route handlers via HTTP, with automatic retries on failure.

---

## 1. Sign up at Upstash

Go to [upstash.com](https://upstash.com) and create a free account.

---

## 2. Create a Redis database

1. In the Upstash console, click **Create Database**.
2. Name it **measurex**.
3. Choose the region closest to your Vercel deployment (e.g. `us-east-1`).
4. Select the **Free** tier (10K commands/day, 256 MB storage).
5. Click **Create**.
6. On the database detail page, copy:
   - **REST URL** → `UPSTASH_REDIS_REST_URL`
   - **REST Token** → `UPSTASH_REDIS_REST_TOKEN`

---

## 3. Create a QStash URL group (topic)

QStash delivers messages to HTTP endpoints. A **URL group** lets you register
one or more endpoints under a single topic name.

1. In the Upstash console, navigate to **QStash → URL Groups**.
2. Click **Create URL Group**.
3. Name it **execute** (one group per job type).
4. Add the endpoint URL:
   - Production: `https://<your-vercel-domain>/api/jobs/execute`
   - Development: use [ngrok](https://ngrok.com) or the QStash dev server
5. Repeat for other job types: `extract`, `metrics`, `recommendations`,
   `notifications`.
6. Copy the **QStash Token** from **QStash → Settings**:
   - **Token** → `QSTASH_TOKEN`
   - **Current Signing Key** → `QSTASH_CURRENT_SIGNING_KEY`
   - **Next Signing Key** → `QSTASH_NEXT_SIGNING_KEY`

---

## 4. Copy credentials to `.env.local`

```env
# Upstash Redis
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-redis-token"

# QStash
QSTASH_TOKEN="your-qstash-token"
QSTASH_CURRENT_SIGNING_KEY="your-current-signing-key"
QSTASH_NEXT_SIGNING_KEY="your-next-signing-key"

# App base URL (used by publishJob to build webhook URLs)
# In production this is derived from VERCEL_URL automatically.
APP_URL="http://localhost:3000"
```

> **Never commit `.env.local` to git.** It is already in `.gitignore`.

---

## 5. Job flow

```
Application code
  └─ publishJob("execute", payload)
       └─ QStash Client.publishJSON({ url: "/api/jobs/execute", body: payload })
            └─ QStash stores message durably
                 └─ QStash HTTP POST → /api/jobs/execute
                      └─ verifySignatureAppRouter (HMAC check)
                           └─ handler()
                                ├─ Check platform kill switch (Redis)
                                ├─ Parse & validate payload
                                ├─ Execute AI engine call  ← Phase 2
                                ├─ Store execution result  ← Phase 2
                                └─ publishJob("extract", ...) ← Phase 2
```

### Retry behaviour

QStash retries delivery up to **3 times** (configurable) with exponential
backoff when your handler returns a non-2xx status. After all retries are
exhausted, the message moves to the **Dead Letter Queue (DLQ)** in the Upstash
console where you can inspect and replay it.

### Platform kill switch

The Redis key `platform:kill_switch` (boolean) acts as an emergency stop.
Set it to `true` to halt all job processing without redeploying:

```ts
import { redis } from '@/lib/queue';
await redis.set('platform:kill_switch', true);
```

Handlers acknowledge the job with `200 OK` when the kill switch is active,
preventing QStash from retrying indefinitely.

---

## 6. Free tier limits

| Service | Free tier | Upgrade trigger |
|---------|-----------|-----------------|
| Upstash Redis | 10K commands/day, 256 MB | >5 active workspaces |
| QStash | 500 messages/day | >10 workspaces or daily runs |

At MVP scale (1–5 workspaces, weekly runs) the free tier is sufficient.

---

## 7. Local development

For local development, QStash cannot reach `localhost` directly. Options:

**Option A — ngrok tunnel (recommended)**
```bash
ngrok http 3000
# Copy the https URL and set APP_URL in .env.local
```

**Option B — QStash dev server**

The `@upstash/qstash` package ships a local dev server that simulates QStash
without network calls. See the
[QStash local development docs](https://upstash.com/docs/qstash/howto/local-development)
for setup instructions.

**Option C — Direct handler invocation**

During development you can call the handler directly (bypassing QStash) by
temporarily disabling signature verification. Never do this in production.
