# Product discovery task

Start this as an explicit new Lead task. It produces a requirements candidate and lock; it does not implement.

```text
Use $measurex-product-discovery to investigate <PRODUCT QUESTION OR REQUIREMENT REVISION>.

Act as the Lead, orchestrator, adjudicator, and final evidence owner. Read the PRD and operating docs, inspect git status, and remain read-only on tracked/project files. Create the task ID, `run.json`, discovery brief, requirements lock, status, handoff, and manifest only as Lead-owned ignored control artifacts under `artifacts/agent-runs/<task-id>/`; this is not implementation authority. Serialize artifact writes and stop collision/BLOCKED if ownership is ambiguous or tracked state changes. Public external research requires separate authorization and an available public read-only research tool. Cite URL, title, publication date when known, access date, and primary/secondary status. Do not use logins, private data, paid sources, live product providers, or repository shell network. The later build workflow remains network-disabled.

Use capped waves within Lead plus three children:
1. product_strategist produces the discovery brief: personas/segments, JTBD, pains, alternatives, evidence, contradictions, confidence, hypotheses, risks, and proposed requirement implications. Missing research tooling creates evidence gaps, not invented facts.
2. product_manager challenges every unsupported implication and iterates an explicit DRAFT requirements contract. Add architect, product_designer, and read-only qa feasibility input only as applicable, in later capped waves.
3. reviewer independently challenges evidence entailment, scope drift, and acceptance ambiguity. Conflicts require exact evidence and an independent relevant tie-break read, never majority vote.
4. product_manager alone issues REQUIREMENTS_LOCKED after applicable evidence and feasibility review; the Lead confirms. The strategist influences PM only through artifacts, never peer chatter.

Do not start builder. Human-gate any change to the locked MVP, target market, pricing, accepted risk, or external commitment. Return discovery brief, requirements lock, evidence gaps, rejected hypotheses, conflicts/dispositions, roles/models/skill, attempts/timeouts, and the safe next $measurex-delivery prompt.
```
