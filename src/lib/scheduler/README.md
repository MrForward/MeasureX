# Scheduler — Queue Priority & Duplicate Prevention

## Queue Priority Model

MeasureX uses **QStash** (Upstash's serverless message queue) for job delivery.
Priority between scheduled and manual runs is handled **implicitly** through
timing and delivery semantics:

### Scheduled Runs (Higher Effective Priority)

- Published with a **distribution delay** (`delayMs`) to spread load across the
  week (see `distribution.ts`).
- Because they are queued ahead of time (cron fires at the start of the week),
  they are already in the queue before any manual run can be triggered.
- QStash processes messages in **FIFO order per endpoint**, so scheduled jobs
  that are already queued will be delivered before a manual run triggered later.

### Manual Runs (Lower Effective Priority)

- Published **immediately** (no delay) when the user triggers them.
- The 24-hour cooldown (Requirement 20.1) prevents rapid-fire manual runs.
- Because scheduled runs are already queued with their distribution delays,
  manual runs naturally slot in behind them in the delivery timeline.

### Why No Explicit Priority Field?

QStash does not support message priority levels. Instead, the system achieves
the same effect through:

1. **Temporal ordering** — scheduled runs are queued first (cron fires weekly).
2. **Rate limiting** — manual runs are limited to 1 per 24 hours per workspace.
3. **Independent execution** — each execution is an independent QStash message,
   so a manual run's jobs don't block or preempt scheduled run jobs.

## Duplicate Prevention

### Scheduled Runs

The `runs` table has a **unique constraint** on `[workspaceId, week, type]`:

```prisma
@@unique([workspaceId, week, type])
```

This prevents duplicate scheduled runs for the same workspace in the same ISO
week. If the cron fires twice, the second invocation's `db.run.findUnique()`
check in `weekly-scheduler.ts` will find the existing run and skip.

### Manual Runs

- **24-hour cooldown**: The manual run endpoint (`POST /api/v1/workspaces/:id/runs`)
  checks for any manual run created in the last 24 hours before allowing a new one.
- **No week-based dedup**: Manual runs don't use the `week` field (it's nullable),
  so the unique constraint doesn't apply. The cooldown is the sole guard.

### Prompt-Engine Execution Dedup

Each execution is created as a database record before the QStash job is published.
The combination of `runId + promptId + engine` is unique per run by construction
(the scheduler iterates `prompts × engines` exactly once per run). There is no
risk of duplicate prompt-engine executions within a single run because:

1. The scheduler creates executions in a single synchronous loop.
2. QStash delivers each message exactly once (at-least-once with dedup window).
3. The `executeJob` function is idempotent — it looks up the execution by ID.
