# Enterprise Agent Harness Guidance

Use the reference in `docs/enterprise-agent-harness.md` when designing, reviewing, or implementing agentic and enterprise AI systems in this repository.

## Operating model

Treat the agent harness as three separate layers:

1. **Adaptive inner harness**
   - The model may decompose tasks, choose search strategies, sequence tools, parallelize work, create subagents, select relevant context, invoke critics or verifiers, and replan after failure.
   - Use dynamic workflows only when they measurably improve correctness, coverage, or completion rate. Do not add multi-agent complexity by default.

2. **Deterministic outer envelope**
   - The model must never determine its own identity, permissions, credentials, approval rules, sandbox/network boundaries, audit requirements, or acceptance criteria.
   - Enforce least privilege, permission-aware retrieval, typed tools for consequential actions, human approval where required, bounded runtime/token/tool budgets, and immutable audit events.

3. **Traditional reliability plane**
   - Apply standard distributed-systems controls independently of model reasoning: timeouts, bounded retries, idempotency, rate limits, durable checkpoints, rollback or compensation, dead-letter handling, versioning, canaries, regression tests, SLOs, incident response, and kill switches.

## Design rules

- Separate planning, execution, verification, and synthesis when context contamination or self-evaluation is likely to cause errors.
- Keep large intermediate outputs out of the model context. Store them externally and expose previews, handles, or selected slices.
- Use progressive tool discovery rather than loading every tool schema upfront.
- Preserve source permissions during retrieval. Never rely on post-retrieval filtering as the primary security boundary.
- Inject credentials outside model-visible context. Scope them to the user, agent, operation, and duration.
- Treat citations as evidence pointers, not proof of answer correctness. Verify entailment, freshness, authority, and permission.
- Put deterministic checks around irreversible, security-sensitive, user-facing, or externally observable actions.
- Record complete execution traces with model, prompt, tool, policy, context, and artifact versions.
- Evaluate both task quality and system behavior. Include permission leakage, unsafe writes, unsupported claims, recovery behavior, latency, and cost.
- Prefer a single capable agent loop for simple tasks. Escalate to dynamic or multi-agent workflows only when the task structure justifies coordination overhead.

## Review checklist

When reviewing an agent feature, explicitly answer:

- What may the model decide dynamically?
- What is enforced outside the model?
- Under whose identity does each read and write execute?
- How are permissions preserved through retrieval and synthesis?
- Which actions require approval?
- What happens after timeout, duplicate delivery, partial completion, or tool failure?
- How is completion verified independently of the worker?
- What context is persisted, isolated, summarized, or discarded?
- What artifacts and traces are available for audit and replay?
- Which offline and online evaluations gate release?
- What is the simpler non-agent or single-agent baseline?

Do not present vendor-reported performance claims as independently validated. Separate documented facts, engineering inference, and general design principles.
