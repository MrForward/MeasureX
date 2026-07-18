# One-feature worktree

Start a **new Codex desktop chat** with **Worktree** selected. Do not run this prompt against the dirty Local checkout.

```text
Implement exactly one MeasureX feature in this isolated worktree: <FEATURE AND ACCEPTANCE CRITERIA>.

You are the sole orchestrator. Follow AGENTS.md and docs/agent-operations/README.md. First record worktree path, branch/base/HEAD, git status, pre-existing changes, target files, forbidden systems, and PRD headings in the execution-plan format. Stop if this is the Local checkout, if the requested path has unexpected user work, or if ownership is ambiguous.

Preserve the locked MVP: ChatGPT gpt-4o-mini and Perplexity sonar only, rule-based extraction, client-driven scan batches, no queue/cron/RBAC, and Stripe $9/month. Do not read .env.local. Network stays disabled. Do not commit, push, open a PR, merge, deploy, or touch live/shared services.

Preparation:
- delegate product_manager to trace the feature to PRD acceptance criteria;
- delegate architect only if the feature changes an interface, data flow, identity boundary, or failure behavior.

Designate builder as the only writer in this worktree. The orchestrator and every other agent remain read-only. Builder must make the smallest bounded change, record reversible decisions, and run focused mocked/local tests. QA must not edit in this builder worktree.

Critique round 1 — discovery:
- reviewer: correctness, regressions, scope drift, and missing tests;
- qa: read-only acceptance matrix and focused verification assessment;
- security_reviewer: include only if auth, tenant data, billing, webhooks, provider calls, URLs, secrets, or side effects are touched.
Run independent critiques in parallel only when their reads do not conflict. Require severity, file/line evidence, impact, and remediation; no persona chatter.

Remediation: give the structured findings to the same builder. Builder is the only agent allowed to edit and must record each disposition.

Critique round 2 — verification:
- reviewer verifies the revised diff and every round-one disposition;
- qa runs or validates the relevant deterministic checks without editing tracked files;
- security_reviewer rechecks only if it participated in round 1.
Critics must distinguish new evidence from repeated resolved findings and state explicitly when no actionable finding remains.

Finally inspect the complete diff and final git status yourself. Return the collision-aware handoff template with exact commands/results, remaining risk, and any human-only gate. Reversible local choices are recorded and continued without asking. Stop before every human-only boundary in docs/agent-operations/HUMAN_BOUNDARIES.md.
```
