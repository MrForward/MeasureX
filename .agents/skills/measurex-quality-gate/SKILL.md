---
name: measurex-quality-gate
description: Run evidence-based MeasureX diagnostic and release quality gates with PRD mapping, deterministic command evidence, normalized correctness and security findings, conservative status, and no false PASS. Use implicitly for nightly checks, release readiness, verification requests, regression assessment, or claims that a feature or branch is complete.
---

# MeasureX quality gate

## Select a mode

- **Diagnostic:** collect all available evidence, continue safely after individual failures, and return `PASS` or `ATTENTION`. Never edit tracked files.
- **Release:** require the full release evidence below and return `PASS`, `FAIL`, or `HUMAN-GATED`. Never merge or deploy.

## Gate

1. Read the [PRD gate map](../../../evals/measurex-prd-gates.json), [effectiveness scorecard](../../../docs/agent-operations/evals/AGENT_EFFECTIVENESS_SCORECARD.md), [operating model](../../../docs/agent-operations/OPERATING_MODEL.md), [environment setup](../../../docs/agent-operations/ENVIRONMENT_SETUP.md), and [human boundaries](../../../docs/agent-operations/HUMAN_BOUNDARIES.md). Create a task ID and durable ignored run-artifact path.
2. Have read-only `qa` map acceptance criteria, test design, manual checks, and external-state needs. Have `verification_runner` alone execute documented deterministic commands and capture exact exit evidence without touching tracked files.
3. Have `reviewer` normalize correctness, regression, scope, and test findings. Add `security_reviewer` for auth, billing, tenant data, providers, webhooks, external side effects, or release judgment. Apply `$measurex-ui-quality` when user-facing UI is in scope.
4. Schedule required roles in capped waves within Lead plus three children. Record attempts and timeouts. Retry one failed agent task once with a narrower prompt and the same evidence; missing mandatory output is never a pass. Cross-check findings and command evidence in round two.
5. Require exact evidence and acceptance impact for conflicting findings and obtain an independent relevant tie-break read; never use majority vote. A failed, skipped, unavailable, timed-out, manual, external, not-installed, or tracked-state-mutating check cannot count as passed.
6. For release `PASS`, require installed dependencies, `npm test`, `npm run type-check`, `npm run lint`, and `npm run build` to succeed, no unresolved critical/high finding, no scope drift, no collision, every mandatory role complete, and every manual/external gate explicitly resolved or excluded by acceptance scope.
7. Record the task ID, artifacts, timestamps, wave lifecycle, requirement lock, agent/model/skill ledger, evidence owners, attempts/timeouts, conflicts/dispositions, accepted-finding precision inputs, unsupported or missed findings, remediation rounds, collisions, human interruptions, observable usage, and single-agent baseline.

Never infer a pass from file existence, structural scenario validation, a green subset, reviewer confidence, or unavailable tooling. Persistent blockers, unsafe/corrupt state, exhausted attempts, or mandatory unavailable tooling require a `BLOCKED` escalation packet.
