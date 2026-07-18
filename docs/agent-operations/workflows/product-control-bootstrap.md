# Product-control bootstrap

Use this in a new main Codex chat opened on the repository. It is a read-only control pass; it does not authorize implementation.

```text
Use $measurex-product-discovery in read-only inventory mode to bootstrap MeasureX product control.

Act as the Lead and sole orchestrator. Read AGENTS.md, MeasureX_MVP_PRD.md, docs/agent-operations/OPERATING_MODEL.md, and docs/agent-operations/MODEL_POLICY.md. If docs/enterprise-agent-harness.md is present and applicable to the design of an agentic product feature, read it only as an optional design reference; never treat it as general MeasureX product or engineering authority. Its absence must not block or degrade this bootstrap. Inspect git status but do not edit, read .env.local, or use network/live services. Schedule capped waves within Lead plus three children, await required evidence, and release completed slots.

Delegate direct, read-only tasks only:
1. product_strategist: supplied-source evidence gaps, customer/problem hypotheses, and validation needs only. Run public research later as a separate authorized product-discovery task.
2. product_manager: DRAFT PRD scope contract, feature/acceptance matrix, post-MVP exclusions, and stale-document conflicts. Do not issue a new REQUIREMENTS_LOCKED artifact without Lead confirmation and applicable feasibility evidence.
3. architect: current implementation map to the locked client-driven scan-batch design, including facts, inference, gaps, controls, and simpler baseline.
4. qa: acceptance-evidence inventory and missing automated/manual/external-state gates without running commands.
5. For a proposed next feature with UI scope, invoke $measurex-ui-quality and ask product_designer for the design risks and rendered evidence needed before any later builder task.

Critique round 1: reviewer checks outputs for unsupported claims, missed PRD constraints, unnecessary fan-out, and stale-source mistakes. Return structured findings only.
Remediation: synthesize corrected control artifacts in chat; do not write them.
Critique round 2: reviewer verifies dispositions against cited evidence and states whether actionable gaps remain.

Finish with authoritative sources, locked invariants, current evidence versus unknowns, recommended next bounded feature, human gates, agent/model/skill ledger, single-agent baseline, and a collision-aware read-only handoff. Do not simulate persona discussion and do not let subagents spawn agents.
```
