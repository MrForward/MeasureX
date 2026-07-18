# Nightly quality task

Use this text as the prompt for a Codex desktop scheduled task. Each run is diagnostic and must start in an isolated worktree or other clean checkout, never the dirty Local checkout.

```text
Use $measurex-quality-gate in diagnostic mode for the unattended nightly MeasureX quality check. Act as the Lead and sole orchestrator.

Read AGENTS.md and docs/agent-operations/README.md. Confirm this is not the dirty Local checkout. Record branch, HEAD, git status, timestamp, matching skill, and agent/model/effort ledger. If tracked changes are already present, report a collision and stop without modifying them.

Keep network disabled. Never read .env.local, use credentials, call live or paid providers, mutate Stripe/Resend/shared databases, perform manual browser steps, edit tracked files, commit, push, merge, deploy, delete, or accept risk. A scheduled run cannot satisfy a human-only gate.

Delegate:
- qa remains read-only and maps the PRD gates and test design;
- verification_runner alone runs npm test, npm run type-check, npm run lint, and npm run build, captures exact exit status/duration/evidence, and may create only ignored command artifacts;
- reviewer classifies failures and inspects source read-only for regressions, flaky evidence, stale expectations, scope drift, and missing tests.
Continue after an individual command failure when safe so all four checks are reported. Stop if a command changes tracked state.

Critique round 1: require evidence-based findings with file/line support; do not infer root cause from logs alone. No remediation writes are allowed.
Critique round 2: reviewer verifies the finding list against verification_runner evidence, removes unsupported claims, groups duplicates, and marks reproducible defect, likely defect, environment issue, NOT YET INSTALLED, or human/manual gate. qa confirms only acceptance mapping.

Return PASS or ATTENTION with branch/HEAD, initial/final status, command matrix, findings, agent/model/skill ledger, human gates, collision state, effectiveness measures where observable, and the safest next $measurex-delivery worktree prompt. PASS requires all four commands successful and tracked state unchanged.
```
