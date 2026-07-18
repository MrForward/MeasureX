---
name: measurex-product-discovery
description: Conduct evidence-first MeasureX product discovery for target users or personas, jobs-to-be-done, pains, alternatives, market or product strategy, feature discovery, requirement creation or revision, and product-hypothesis validation. Use for discovery or material requirement changes; do not trigger for routine implementation against already locked requirements.
---

# MeasureX product discovery

## Produce a requirements candidate

1. Start from one explicit Lead task. Read the [operating model](../../../docs/agent-operations/OPERATING_MODEL.md), [human boundaries](../../../docs/agent-operations/HUMAN_BOUNDARIES.md), PRD, and supplied evidence. Do not begin discovery merely because the skill exists.
2. Record a [discovery brief](../../../docs/agent-operations/templates/discovery-brief.md). Use `product_strategist` for cited customer, problem, alternatives, and hypothesis evidence. Public research requires separate Lead authorization and an available read-only research tool; the repository shell and build workflow stay network-disabled.
3. Have `product_manager` challenge unsupported implications and iterate `DRAFT` requirements. Add read-only architecture, design, and QA feasibility evidence only when applicable. Strategist recommendations are inputs, never product authority.
4. Require the PM's [requirements lock](../../../docs/agent-operations/templates/requirements-lock.md) and Lead confirmation before any builder starts. Only the PM may issue `REQUIREMENTS_LOCKED`.
5. After lock, record behavior-neutral clarification with a decision ID. Any observable behavior or scope change pauses the builder, creates a change request, and reopens discovery and PM review. Human approval is required for changes to the locked MVP, target market, pricing, risk, or external commitments.

Never invent users, interviews, demand, market size, conversion, competitor facts, or success evidence. Label evidence gaps, contradictions, confidence, rejected hypotheses, and proposed implications. Use Lead-mediated artifacts rather than peer chatter.
