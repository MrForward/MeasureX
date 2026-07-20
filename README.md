# MeasureX

**AI Visibility Monitor** — Track your brand's presence across ChatGPT and Perplexity.

MeasureX shows B2B SaaS growth and content marketers where their brands appear in AI-generated responses and how that visibility compares with competitors, backed by the raw prompts, answers, and citations.

## What It Does

- **Tracks visibility** across ChatGPT and Perplexity
- **Detects brand mentions** and citations with rule-based extraction
- **Computes prompt-engine scores** and an overall visibility score (0-100)
- **Compares visibility and prompt gaps** against up to two competitors
- **Shows raw AI answers** with highlighted mentions and citation evidence
- **Runs scans manually** with progress and partial-result handling

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Neon PostgreSQL + Prisma |
| Auth | NextAuth.js |
| Payments | Stripe Checkout + Customer Portal |
| Email | Resend |
| Answer engines | OpenAI (`gpt-4o-mini`) + Perplexity (`sonar`) |
| Scan orchestration | Client-driven batches (no queue or background workers) |
| Prompt suggestions | Anthropic Claude Haiku |
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
├── lib/              # Core logic (engines, extraction, metrics, scan)
├── scripts/          # Seed scripts
└── types/            # TypeScript definitions
```

## Documentation

[`MeasureX_MVP_PRD.md`](MeasureX_MVP_PRD.md) is the authoritative source for current product scope, requirements, and acceptance intent.

The documents under `.kiro/specs/ai-visibility-monitor/` are legacy pre-pivot planning artifacts. They are retained only for historical context and are not authoritative; follow `MeasureX_MVP_PRD.md` whenever they conflict.

## Development Status

🚧 **In active development** — MVP phase

## License

Proprietary — All rights reserved.
