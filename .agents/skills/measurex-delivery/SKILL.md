---
name: measurex-delivery
description: Orchestrate non-trivial MeasureX feature and bug-fix delivery with PRD scope control, bounded architecture and design input, one tracked-file writer, two structured critique rounds, deterministic verification, and a collision-aware handoff. Use implicitly for feature implementation, meaningful fixes, cross-file behavior changes, or work that needs independent review; do not fan out for trivial documentation-only edits.
---

# MeasureX delivery

## Execute

1. Read the [operating model](../../../docs/agent-operations/OPERATING_MODEL.md), [environment setup](../../../docs/agent-operations/ENVIRONMENT_SETUP.md), [human boundaries](../../../docs/agent-operations/HUMAN_BOUNDARIES.md), and relevant PRD headings. Start from one user-created Lead task; never idle-run roles merely because they exist.
2. Record task ID, artifact paths, timestamps, initial collision state, scope, requirement-lock ID, acceptance criteria, allowed files, role/model/skill ledger, wave plan, attempts, and timeouts in the [execution plan](../../../docs/agent-operations/templates/execution-plan.md).
3. If requirements are new, revised, unsupported, or ambiguous, invoke `$measurex-product-discovery`. Do not start `builder` until `product_manager` issues `REQUIREMENTS_LOCKED` and the Lead confirms it. Add `architect` only for meaningful interface, data, identity, or failure-mode decisions. For any UI, invoke `$measurex-ui-quality` and require `product_designer` before implementation.
4. Schedule capped waves within Lead plus three children: preflight; discovery/requirements when needed; preparation; builder alone; critique round one; same-builder remediation; verification/round two; synthesis. Wait for required results and release completed slots before the next wave. Never omit a mandatory role because slots are full.
5. Designate `builder` as the only tracked-file writer. It may run focused mocked/local feedback tests after a status check, but those results are provisional. Keep the Lead and critics read-only. `verification_runner` independently reruns selected and final checks, may create only ignored artifacts, and must never edit tracked files.
6. Run round one with independent `reviewer`, read-only `qa`, applicable `security_reviewer`, and both `product_designer` plus reviewer for UI. Return accepted findings to the same builder. Round two verifies dispositions and acceptance evidence.
7. Record agent timeout or failure; retry once with a narrower prompt and the same evidence. Missing mandatory output is never a pass. For one technical root cause, allow at most the initial attempt plus two bounded remediations. A new round-two critical/high finding returns once to the same builder, receives a targeted recheck, then reruns the full gate. Persistent blockers, unsafe state, or mandatory unavailable tools produce `BLOCKED`.
8. Resolve conflicting findings from exact evidence and acceptance impact, using an independent relevant tie-break read rather than majority vote. Escalate persistent material product, risk, or taste conflicts to the correct human gate.
9. Inspect the final diff and return the [collision-aware handoff](../../../docs/agent-operations/templates/handoff.md). Record durable run artifacts, agents/models/skills, attempts/timeouts, conflicts, verification, human gates, and effectiveness evidence.

The Lead orchestrates, adjudicates, and owns final evidence but never substitutes for an independent mandatory critic. Use structured artifacts, never peer persona chatter. Preserve the locked two-engine, rule-based, client-batched, no-queue/no-cron/no-RBAC, $9 MVP. Finish safe independent local work, continue reversible choices, and stop at human-only, collision, unsafe-state, repeated-blocker, or mandatory-tool boundaries.
