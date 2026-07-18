---
name: measurex-quality-gate
description: Run evidence-based MeasureX diagnostic and release quality gates with PRD mapping, deterministic command evidence, normalized correctness and security findings, conservative status, and no false PASS. Use implicitly for nightly checks, release readiness, verification requests, regression assessment, or claims that a feature or branch is complete.
---

# MeasureX quality gate

## Select a mode

- **Diagnostic:** collect all available evidence, continue safely after individual failures, and return `PASS` or `ATTENTION`. Never edit tracked files.
- **Release:** require the full release evidence below and return `PASS`, `FAIL`, or `HUMAN-GATED`. Never merge or deploy.

## Gate

1. Read the [PRD gate map](../../../evals/measurex-prd-gates.json), [effectiveness scorecard](../../../docs/agent-operations/evals/AGENT_EFFECTIVENESS_SCORECARD.md), [operating model](../../../docs/agent-operations/OPERATING_MODEL.md), and [human boundaries](../../../docs/agent-operations/HUMAN_BOUNDARIES.md).
2. Have read-only `qa` map acceptance criteria, test design, manual checks, and external-state needs. Have `verification_runner` alone execute documented deterministic commands and capture exact exit evidence without touching tracked files.
3. Have `reviewer` normalize correctness, regression, scope, and test findings. Add `security_reviewer` for auth, billing, tenant data, providers, webhooks, external side effects, or release judgment. Apply `$measurex-ui-quality` when user-facing UI is in scope.
4. Cross-check findings and command evidence in round two. A failed, skipped, unavailable, timed-out, manual, external, or not-installed check cannot count as passed.
5. For release `PASS`, require `npm test`, `npm run type-check`, `npm run lint`, and `npm run build` to succeed, no unresolved critical/high finding, no scope drift, no collision, and every manual/external gate explicitly resolved or excluded by acceptance scope.
6. Record the agent/model/skill ledger, accepted-finding precision inputs, unsupported or missed findings, remediation rounds, collisions, human interruptions, and single-agent baseline comparison in the handoff.

Never infer a pass from file existence, a green subset, reviewer confidence, or unavailable tooling.
