# One-feature worktree

Start a **new Codex desktop chat** with **Worktree** selected. Do not run this prompt against the dirty Local checkout.

```text
Use $measurex-delivery to implement exactly one MeasureX feature in this isolated worktree: <FEATURE AND ACCEPTANCE CRITERIA>.

You are the Lead and sole orchestrator. Follow AGENTS.md and docs/agent-operations/README.md. Record worktree path, branch/base/HEAD, git status, pre-existing changes, target files, forbidden systems, PRD headings, matching skills, and the agent/model/effort ledger. Stop if this is the Local checkout, a requested path has unexpected user work, or ownership is ambiguous. Agents start only from this Lead task; do not run roles merely because they exist.

Preserve the locked MVP: ChatGPT gpt-4o-mini and Perplexity sonar only, rule-based extraction, client-driven scan batches, no queue/cron/RBAC, and Stripe $9/month. Do not read .env.local. Network stays disabled. Do not commit, push, open a PR, merge, deploy, or touch live/shared services.

Preparation:
- product_manager traces the feature to PRD acceptance criteria;
- architect participates only for meaningful interface, data flow, identity, or failure behavior;
- qa remains read-only and creates the acceptance/test-design matrix;
- if any user-facing visual, interaction, responsive, content-hierarchy, or accessibility behavior changes, invoke $measurex-ui-quality and require product_designer to complete docs/agent-operations/templates/design-brief.md and an initial UI rubric before builder starts.

Designate builder as the only tracked-file writer. The Lead and every critic remain read-only. verification_runner may run only documented deterministic checks and create ignored artifacts; it must never edit tracked files. Builder implements the smallest plan and records reversible decisions.

Critique round 1 — discovery:
- reviewer: correctness, regressions, scope drift, and missing tests;
- qa: read-only acceptance coverage and test-design gaps;
- security_reviewer: required for auth, tenant data, billing, webhooks, providers, URLs, secrets, or external side effects;
- product_designer: required for every UI task, using current file/screenshot evidence and the UI rubric.
Run independent reads in parallel only when useful. Require severity, file/line evidence, impact, and remediation; no peer or persona chatter.

Remediation: return normalized findings through the Lead to the same builder. Builder alone edits and records every disposition.

Critique round 2 — verification:
- verification_runner executes the focused documented checks and captures exact exits without tracked edits;
- qa maps that evidence to acceptance criteria and never substitutes confidence for command results;
- reviewer verifies the revised diff and every round-one disposition;
- security_reviewer rechecks if it participated in round 1;
- product_designer rechecks every UI change, all states, four viewports, accessibility, generic-pattern audit, and human taste gate.
A failed, skipped, unavailable, timed-out, manual, external, or not-installed check is not a pass.

Finally inspect the complete diff and final git status yourself. Return the collision-aware handoff with exact commands/results, agent/model/skill ledger, UI evidence, remaining risk, human gates, and the agent effectiveness scorecard including the single-agent baseline. Continue reversible local choices without asking; stop before every boundary in docs/agent-operations/HUMAN_BOUNDARIES.md.
```
