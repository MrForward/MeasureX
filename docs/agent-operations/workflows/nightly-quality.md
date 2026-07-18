# Nightly quality task

Use this text as the prompt for a Codex desktop scheduled task. Each run is diagnostic and must start in an isolated worktree or other clean checkout, never the dirty Local checkout.

```text
Run the unattended nightly MeasureX quality check as the sole orchestrator.

Read AGENTS.md and docs/agent-operations/README.md. Confirm this is not the dirty Local checkout. Record branch, HEAD, git status, pre-existing changes, and timestamp. If tracked changes are already present, report a collision and stop without modifying them.

Keep network disabled. Never read .env.local, use credentials, call live or paid providers, mutate Stripe/Resend/shared databases, perform manual browser steps, edit tracked files, commit, push, merge, deploy, delete, or accept risk. A scheduled run cannot satisfy a human-only gate.

Designate qa as the only workspace-write-capable worker, limited to ignored artifacts produced by commands. Have qa run in order:
1. npm test
2. npm run type-check
3. npm run lint
4. npm run build
Capture command, exit status, duration when available, and the smallest useful failure excerpt. Continue after a failure when safe so the report covers all four checks.

Critique round 1: delegate reviewer to classify failures and inspect current source read-only for likely regressions, flaky evidence, stale expectations, scope drift, and missing tests. Findings require file/line evidence; do not invent a root cause from logs alone.

No remediation writes are allowed in this nightly task. Critique round 2: have reviewer verify the finding list against qa's raw command outcomes, remove unsupported claims, group duplicates by root cause, and mark each item as reproducible defect, likely defect, environment issue, or needs human/manual validation.

Return a concise nightly report: PASS or ATTENTION; branch/HEAD; initial and final status; command matrix; new evidence; human gates; collision state; and the safest next feature-worktree prompt. PASS only if all four commands succeed and tracked git state is unchanged.
```
