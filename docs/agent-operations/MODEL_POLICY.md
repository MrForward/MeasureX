# MeasureX agent model policy

This policy routes Codex operating-layer work; it does not change MeasureX's product answer engines. The locked product still uses ChatGPT `gpt-4o-mini` and Perplexity `sonar` only.

## Routing

| Role | Model | Effort | Reason |
|---|---|---:|---|
| Lead default | `gpt-5.6-sol` | high | Synthesis, delegation, tradeoffs, and completion judgment |
| `product_strategist` | `gpt-5.6-sol` | high | Evidence-first customer/problem research and product hypotheses |
| `product_manager` | `gpt-5.6-terra` | high | Fast, evidence-heavy PRD mapping with strong judgment |
| `architect` | `gpt-5.6-sol` | high | Interface, failure-mode, and systems reasoning |
| `builder` | `gpt-5.6-sol` | high | Bounded implementation and remediation |
| `qa` | `gpt-5.6-terra` | medium | Read-only acceptance analysis and test design |
| `verification_runner` | `gpt-5.6-terra` | medium | Deterministic command execution and evidence capture |
| `reviewer` | `gpt-5.6-sol` | high | Independent correctness and regression judgment |
| `security_reviewer` | `gpt-5.6-sol` | xhigh | High-consequence trust-boundary analysis |
| `product_designer` | `gpt-5.6-sol` | high | Product-specific interaction and visual judgment |

Sol is the quality-first route for design, architecture, implementation, review, security, and Lead synthesis. Terra is the balanced route for bounded evidence mapping and deterministic execution where lower latency and cost do not weaken the judgment owner.

Luna is reserved only for an optional future low-stakes inventory or log-summarization worker with deterministic source preservation. It is not configured today and must never make design, architecture, security, product-scope, release, risk, or completion judgments.

## Adaptive Lead escalation

Lead Sol High is the default. The user may select Lead Sol Ultra only at task start when the task involves one of these high-reversal-cost conditions:

- a whole-product strategy or design reset;
- three or more consequential domains whose decisions materially interact;
- materially conflicting authoritative sources;
- unresolved specialist disagreement after one evidence round;
- a disputed critical/high release finding; or
- another genuinely parallel decision with high reversal cost.

Ultra is not an automatic retry or an in-task promotion. It is unnecessary for routine features, implementation against locked requirements, or nightly checks; it does not waive human gates or replace an independent critic. Persistent conflict during a run is escalated to the correct human, with Ultra recorded only as a possible next-task selection.

## Controls

- Keep `agents.max_threads = 4` and `agents.max_depth = 1`.
- Treat the Lead as orchestrator, adjudicator, and final evidence owner, never as a substitute for a mandatory independent critic.
- Do not silently substitute a cheaper tier for a judgment owner or a stronger tier for every workload.
- Start agents only when one Lead task and a matching repo skill require them; model pins do not cause background or idle execution.
- Record agent, model, reasoning effort, skill, task, evidence, and disposition in status and handoff artifacts.
- Compare multi-agent effectiveness with the simplest viable single-agent baseline using the [scorecard](evals/AGENT_EFFECTIVENESS_SCORECARD.md).
- Re-evaluate routing after representative task evidence; model availability alone is not proof of effectiveness.
