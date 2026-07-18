---
name: measurex-delivery
description: Orchestrate non-trivial MeasureX feature and bug-fix delivery with PRD scope control, bounded architecture and design input, one tracked-file writer, two structured critique rounds, deterministic verification, and a collision-aware handoff. Use implicitly for feature implementation, meaningful fixes, cross-file behavior changes, or work that needs independent review; do not fan out for trivial documentation-only edits.
---

# MeasureX delivery

## Execute

1. Read the [operating model](../../../docs/agent-operations/OPERATING_MODEL.md), [human boundaries](../../../docs/agent-operations/HUMAN_BOUNDARIES.md), and relevant PRD headings. Start from one user-created Lead task; never idle-run roles merely because they exist.
2. Record the initial worktree, collision state, scope, acceptance criteria, allowed files, and role/model/skill ledger with the [execution plan](../../../docs/agent-operations/templates/execution-plan.md).
3. Have `product_manager` control scope. Add `architect` only for meaningful interface, data, identity, or failure-mode decisions. For any user-facing UI, invoke `$measurex-ui-quality` and require `product_designer` before implementation.
4. Designate `builder` as the only tracked-file writer. Keep the Lead and all critics read-only. `verification_runner` may create only ignored command artifacts and must never edit tracked files.
5. Run critique round one with `reviewer`, read-only `qa`, and `security_reviewer` when auth, billing, tenant data, providers, webhooks, or side effects are touched. Include `product_designer` for UI work.
6. Return accepted findings to the same builder. Then run round two to verify dispositions and acceptance evidence; use `verification_runner` for documented commands.
7. Inspect the final diff and return the [collision-aware handoff](../../../docs/agent-operations/templates/handoff.md). Record agents, models, skills, findings, verification, human gates, and effectiveness evidence.

Use Lead-mediated structured artifacts, never peer persona chatter. Preserve the locked two-engine, rule-based, client-batched, no-queue/no-cron/no-RBAC, $9 MVP. Continue reversible local choices without interruption and stop at human-only boundaries.
