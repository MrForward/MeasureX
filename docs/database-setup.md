# Database Setup — Neon PostgreSQL (Free Tier)

This guide walks you through provisioning a free Neon PostgreSQL database and connecting it to MeasureX.

---

## Prerequisites

- Node.js 18+ installed
- MeasureX repository cloned and `npm install` completed
- A free account at [neon.tech](https://neon.tech)

---

## Step 1 — Sign up at Neon

1. Go to [https://neon.tech](https://neon.tech) and click **Sign Up**.
2. Sign in with GitHub, Google, or email.
3. You will land on the Neon Console dashboard.

---

## Step 2 — Create a project named "measurex"

1. Click **New Project** in the Neon Console.
2. Set the **Project name** to `measurex`.
3. Choose the **Region** closest to your users (e.g., `US East (N. Virginia)` for US-based traffic).
4. Leave the **PostgreSQL version** at the default (16 recommended).
5. Click **Create Project**.

Neon will provision a database and show you the connection details.

---

## Step 3 — Copy the connection string to `.env.local`

1. In the Neon Console, open your `measurex` project.
2. Click **Connection Details** (or the **Connect** button on the dashboard).
3. Select **Connection string** and copy the full URL. It looks like:

   ```
   postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

4. In the root of the MeasureX repository, create a file named `.env.local` (copy from `.env.example` if it doesn't exist):

   ```bash
   cp .env.example .env.local
   ```

5. Open `.env.local` and set `DATABASE_URL` to the connection string you copied:

   ```env
   DATABASE_URL="postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
   ```

   > **Important:** Keep `.env.local` out of version control. It is already listed in `.gitignore`.

---

## Step 4 — Push the schema to create tables

Run the following command to create all tables in your Neon database:

```bash
npm run db:push
```

This runs `prisma db push` under the hood, which:
- Reads `prisma/schema.prisma`
- Introspects the current database state
- Creates all missing tables and indexes without generating a migration file

You should see output like:

```
🚀  Your database is now in sync with your Prisma schema.
```

> **Note:** `db:push` is recommended for early development. Once the schema stabilises, switch to `npm run db:migrate` to generate versioned migration files.

---

## Step 5 — Seed the database with test data

Populate the database with development seed data (HubSpot brand, competitors, sample prompts):

```bash
npm run db:seed
```

This runs `src/scripts/seed-dev-data.ts` via `tsx` and creates:

| Entity | Details |
|---|---|
| Admin user | `aibrain.play@gmail.com` |
| Workspace | `HubSpot Demo` |
| Brand profile | HubSpot — `hubspot.com` |
| Competitors | Salesforce, Zoho CRM, Pipedrive, Monday.com, ActiveCampaign |
| Sample prompts | 5 prompts targeting CRM-related AI queries |

---

## Useful commands

| Command | Description |
|---|---|
| `npm run db:push` | Sync schema to database (no migration files) |
| `npm run db:migrate` | Create a versioned migration and apply it |
| `npm run db:generate` | Regenerate the Prisma client after schema changes |
| `npm run db:seed` | Populate database with development test data |
| `npm run db:studio` | Open Prisma Studio (visual database browser) |

---

## Schema overview

The MeasureX schema contains the following tables:

| Table | Purpose |
|---|---|
| `users` | User accounts (NextAuth compatible) |
| `accounts` | OAuth provider accounts (NextAuth) |
| `sessions` | Active user sessions (NextAuth) |
| `verification_tokens` | Email magic-link tokens (NextAuth) |
| `workspaces` | Multi-tenant workspaces with soft-delete |
| `workspace_members` | Workspace membership with owner/viewer roles |
| `brand_profiles` | Versioned brand configurations |
| `competitors` | Competitor tracking per workspace |
| `prompts` | AI prompts with engine assignments and versioning |
| `runs` | Weekly execution runs with status tracking |
| `executions` | Individual prompt × engine execution records |
| `extractions` | Parsed entity extraction results |
| `metrics` | Computed visibility scores and aggregates |
| `recommendations` | AI-generated improvement recommendations |
| `audit_log` | Immutable event log for auth and data changes |
| `api_usage` | Per-engine API call counts and cost tracking |
| `notifications` | In-app notification records |
| `platform_config` | Runtime-tunable platform settings |

---

## Troubleshooting

**`Error: P1001 — Can't reach database server`**
- Verify `DATABASE_URL` in `.env.local` is correct and includes `?sslmode=require`.
- Check that your Neon project is active (free tier projects pause after inactivity — click **Resume** in the console).

**`Error: P3014 — Prisma Migrate could not create the shadow database`**
- Use `npm run db:push` instead of `npm run db:migrate` for Neon free tier (shadow databases require a paid plan).

**`Error: Environment variable not found: DATABASE_URL`**
- Make sure you created `.env.local` (not `.env`) — Next.js loads `.env.local` automatically.
- Restart your terminal session after editing the file.

**Neon project is paused**
- Free tier projects auto-pause after 5 minutes of inactivity. Open the Neon Console and click **Resume** on your project, or simply run any database command — Neon will auto-resume on the first connection attempt.
