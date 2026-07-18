# Product-control bootstrap

Use this in a new main Codex chat opened on the repository. It is a read-only control pass; it does not authorize implementation.

```text
Bootstrap MeasureX product control using the project operating layer.

Act as the sole orchestrator. Read AGENTS.md, MeasureX_MVP_PRD.md, and docs/agent-operations/OPERATING_MODEL.md. If docs/enterprise-agent-harness.md is present and applicable to the design of an agentic product feature, read it only as an optional design reference; never treat it as general MeasureX product or engineering authority. Its absence must not block or degrade this bootstrap. Inspect current git status but do not edit any file, do not read .env.local, and do not use the network or live services.

Delegate direct, read-only tasks only:
1. product_manager: produce a PRD scope lock, feature/acceptance matrix, post-MVP exclusions, and stale-document conflicts with heading evidence.
2. architect: map the current implementation at a high level to the locked client-driven scan-batch design; report facts, inference, gaps, deterministic controls, and the simpler baseline. Do not propose new MVP systems.

Critique round 1: have reviewer independently check both outputs for unsupported claims, missed PRD constraints, and stale-source mistakes. Return structured findings only.
Remediation: synthesize corrected control artifacts in chat; do not write them to the repo.
Critique round 2: ask reviewer to verify every round-one disposition against cited repository evidence and state whether actionable gaps remain.

Finish with: authoritative sources by domain; locked MVP invariants; current evidence versus unknowns; human-only gates; recommended next bounded feature; and a collision-aware read-only handoff. Do not simulate persona discussion and do not let subagents spawn agents.
```
