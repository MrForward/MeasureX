# Product-control bootstrap

Use this in a new main Codex chat opened on the repository. It is a read-only control pass; it does not authorize implementation.

```text
Use $measurex-delivery in read-only planning mode to bootstrap MeasureX product control.

Act as the Lead and sole orchestrator. Read AGENTS.md, MeasureX_MVP_PRD.md, docs/agent-operations/OPERATING_MODEL.md, and docs/agent-operations/MODEL_POLICY.md. If docs/enterprise-agent-harness.md is present and applicable to the design of an agentic product feature, read it only as an optional design reference; never treat it as general MeasureX product or engineering authority. Its absence must not block or degrade this bootstrap. Inspect git status but do not edit, read .env.local, or use network/live services.

Delegate direct, read-only tasks only:
1. product_manager: PRD scope lock, feature/acceptance matrix, post-MVP exclusions, and stale-document conflicts.
2. architect: current implementation map to the locked client-driven scan-batch design, including facts, inference, gaps, controls, and simpler baseline.
3. qa: acceptance-evidence inventory and missing automated/manual/external-state gates without running commands.
4. For a proposed next feature with UI scope, invoke $measurex-ui-quality and ask product_designer for the design risks and evidence needed before any later builder task.

Critique round 1: reviewer checks outputs for unsupported claims, missed PRD constraints, unnecessary fan-out, and stale-source mistakes. Return structured findings only.
Remediation: synthesize corrected control artifacts in chat; do not write them.
Critique round 2: reviewer verifies dispositions against cited evidence and states whether actionable gaps remain.

Finish with authoritative sources, locked invariants, current evidence versus unknowns, recommended next bounded feature, human gates, agent/model/skill ledger, single-agent baseline, and a collision-aware read-only handoff. Do not simulate persona discussion and do not let subagents spawn agents.
```
