# MeasureX

**AI Visibility Monitor** — Track your brand's presence across ChatGPT and Perplexity.

MeasureX shows marketers, agencies, and growth teams where their brands appear in AI-generated responses, how they compare against competitors, and what to do about it — backed by a transparent evidence layer of raw prompts, answers, and citations.

## What It Does

- **Tracks visibility** across ChatGPT and Perplexity
- **Detects brand mentions** and citations using exact + fuzzy matching
- **Computes a visibility score** (0-100) per prompt and overall
- **Compares against competitors** with share-of-voice metrics
- **Generates recommendations** backed by evidence from raw responses
- **Refreshes weekly** with optional manual runs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Neon PostgreSQL + Prisma |
| Queue | Upstash Redis + QStash |
| Storage | Cloudflare R2 |
| Auth | NextAuth.js |
| Email | Resend |
| Hosting | Vercel |

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env.local
# Fill in .env.local with your credentials

# Set up database
npm run db:push
npm run db:seed

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/              # Next.js App Router pages
├── components/       # React components (ui, dashboard, shared)
├── lib/              # Core logic (engines, extraction, metrics, config, queue)
├── scripts/          # Seed scripts
└── types/            # TypeScript definitions
```

## Documentation

Full specs are in `.kiro/specs/ai-visibility-monitor/`:
- `requirements.md` — Feature requirements with acceptance criteria
- `design.md` — Architecture, data models, and integration details
- `tasks.md` — Implementation plan

## Development Status

🚧 **In active development** — MVP phase

## License

Proprietary — All rights reserved.
