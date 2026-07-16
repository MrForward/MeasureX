# Enterprise Agent Harness Reference

## Purpose

This document provides a practical model for building reliable enterprise AI agents. It combines the dynamic, task-specific orchestration pattern described by Anthropic with the persistent security, retrieval, governance, and operations layers used by enterprise systems such as Glean.

## 1. Definition

An agent harness is the software system around a language model that governs:

- the execution loop
- tools and tool discovery
- context construction and compression
- state and memory
- planning and replanning
- subagent orchestration
- permissions and identity
- verification and evidence
- approvals and policy enforcement
- observability, evaluation, and recovery

A prompt is one component of a harness, not the harness itself.

## 2. Anthropic-style dynamic harness

Anthropic's dynamic workflow approach lets an agent create a task-specific execution program. The workflow can spawn subagents, isolate their contexts, allocate different models, coordinate artifacts, run critics or verifiers, and resume interrupted work.

Common structures include:

- classify and act
- fan out and synthesize
- adversarial verification
- generate and filter
- tournament selection
- loop until an externally checkable completion condition is satisfied

### Why it helps

Structural separation can reduce:

- premature completion
- context contamination
- goal drift
- self-preferential evaluation
- poor coverage on parallel research or implementation tasks

### Where it fails

Dynamic multi-agent execution introduces:

- higher token and latency cost
- coordination failures
- inconsistent assumptions between agents
- duplicated work
- synthesis bottlenecks
- harder debugging and replay
- unbounded recursion or fan-out without budgets

Use it only when the task has real parallelism, independent verification needs, or context-isolation benefits that outweigh the overhead.

## 3. Enterprise platform harness

A production enterprise harness must solve more than task decomposition. It needs a persistent control plane around every model invocation and tool action.

### Permission-aware retrieval

- Retrieve only content the acting identity is allowed to access.
- Enforce permissions before or during retrieval, not only after documents enter the pipeline.
- Carry source, owner, timestamp, permission, and lineage metadata into the evidence bundle.
- Recheck authorization when cached results, memories, or generated artifacts are reused.

### Enterprise context construction

- Combine lexical, semantic, graph, metadata, and recency signals where appropriate.
- Prefer progressive disclosure: first expose search/tool summaries, then fetch full content only when needed.
- Store large results and intermediate datasets outside the model context. Pass handles, previews, schemas, and selected slices.
- Track context provenance so every important claim can be mapped back to evidence.

### Tool orchestration and sandboxing

- Expose tools through typed, versioned contracts.
- Use progressive tool discovery when the tool catalog is large.
- Run generated code in a restricted sandbox with bounded filesystem, network, CPU, memory, and runtime.
- Separate read tools from write tools. Apply stricter checks to externally observable actions.

### Identity and credentials

- Execute under a defined user, delegated, or service identity.
- Apply least privilege per tool and operation.
- Inject credentials outside the model-visible context.
- Use short-lived and narrowly scoped credentials where possible.
- Never let the model create or expand its own permissions.

### Write governance

- Classify actions by reversibility, financial impact, data sensitivity, audience, and blast radius.
- Require human approval for consequential actions where policy demands it.
- Show the approver the exact proposed action, target, parameters, and evidence, not a vague summary.
- Revalidate policy and permissions immediately before execution.

### Verification and evidence

Verification should be independent of the worker when practical.

Check:

- factual support and entailment
- source authority and freshness
- permission compliance
- completeness against explicit acceptance criteria
- tool-result consistency
- output schema and business-rule validity
- side-effect confirmation after writes

Citations are evidence pointers. They do not by themselves prove that a claim is supported.

### Model routing and fallbacks

- Route by task difficulty, latency need, context size, tool-use reliability, risk, and cost.
- Keep model choice within policy-defined options.
- Use fallbacks for model unavailability or repeated tool-call failure.
- Do not silently downgrade high-risk verification to a weaker model without recording it.

### Memory and trace learning

Separate:

- durable factual memory
- user preferences
- task state
- reusable procedures or skills
- execution traces

Do not promote a successful trace into a reusable strategy without evaluation. Sanitize permissions and sensitive data before reuse.

## 4. Three-layer reference architecture

### Layer A: Adaptive inner harness

The model may control:

- decomposition
- search strategy
- sequencing
- parallelization
- subagent creation
- context selection
- critic/verifier invocation
- replanning
- model selection within an allowed set

### Layer B: Deterministic outer envelope

The platform controls:

- identity and authorization
- credential handling
- sandbox and network boundaries
- available tools and operations
- approval requirements
- token, runtime, recursion, and spend limits
- policy enforcement
- audit generation
- externally defined acceptance gates

### Layer C: Reliability plane

The distributed system controls:

- timeouts
- bounded retries with backoff
- idempotency keys
- concurrency and rate limits
- durable checkpoints
- compensation and rollback
- dead-letter queues
- model/tool fallbacks
- versioning and reproducibility
- canaries and regression suites
- SLOs, alerts, incident response, and kill switches

The inner harness may propose. The outer envelope authorizes. The reliability plane ensures safe execution and recovery.

## 5. Failure-mode taxonomy

### Reasoning failures

- wrong decomposition
- missed constraints
- unsupported conclusions
- premature completion
- evaluator bias
- context loss or contamination

Controls: independent verification, acceptance tests, context isolation, evidence checks, baseline comparison.

### Retrieval failures

- poor recall
- stale evidence
- permission leakage
- ranking irrelevant but persuasive content
- source ambiguity

Controls: permission-aware retrieval, provenance metadata, freshness checks, hybrid retrieval, citation entailment evaluation.

### Tool failures

- invalid parameters
- partial execution
- nondeterministic tool output
- incompatible versions
- duplicate writes

Controls: typed schemas, validation, timeouts, bounded retries, idempotency, postcondition checks, version pinning.

### Security and governance failures

- privilege escalation
- credential exposure
- prompt injection from retrieved content
- unauthorized action
- approval bypass

Controls: immutable policy plane, scoped credentials, content trust labels, tool allowlists, approval gates, sandboxing.

### Coordination failures

- duplicated work
- inconsistent assumptions
- cyclic delegation
- unbounded fan-out
- synthesis omits critical findings

Controls: budgets, explicit roles, shared artifact contracts, dependency graphs, merge checks, coordinator limits.

### Operational failures

- provider outage
- latency spikes
- cost explosion
- lost state
- unrecoverable partial workflow

Controls: fallbacks, checkpoints, circuit breakers, quotas, compensation, replay, SLO monitoring.

## 6. Evaluation framework

### Offline task quality

- task completion
- factual correctness
- evidence support
- completeness
- instruction adherence
- structured-output validity

### Enterprise safety

- permission leakage rate
- unsafe or unauthorized write attempts
- approval-policy adherence
- prompt-injection resistance
- sensitive-data exposure

### Reliability

- recovery after tool failure
- duplicate-action rate
- partial-workflow recovery
- retry success rate
- checkpoint fidelity

### Efficiency

- end-to-end latency
- model and tool cost
- token usage
- unnecessary tool calls
- unnecessary agent fan-out

### Production monitoring

- success rate by task and workflow version
- human override and correction rate
- escalation rate
- policy-block rate
- source freshness and retrieval quality
- cost and latency percentiles
- repeated failure clusters

Every release should compare against the simplest viable baseline, often a deterministic workflow or a single-agent loop.

## 7. Implementation sequence

1. Define task, acceptance criteria, and non-agent baseline.
2. Establish identity, permissions, and data boundaries.
3. Build typed read-only tools and permission-aware retrieval.
4. Add trace capture, offline evaluations, and replay.
5. Introduce write tools with idempotency and postcondition checks.
6. Add approval and policy gates for consequential actions.
7. Add dynamic planning or subagents only where evaluations show a material gain.
8. Add checkpoints, fallbacks, compensation, and production SLOs.
9. Version models, prompts, tools, policies, skills, and evaluation sets together.

## 8. Core conclusion

Anthropic's dynamic harness primarily addresses how an agent organizes difficult work. An enterprise system must additionally guarantee that the work uses authorized evidence, executes permitted actions, survives operational failure, and remains auditable.

Dynamic orchestration belongs inside the enterprise control envelope. The agent may invent its work plan. It may not invent its identity, permissions, approval policy, safety limits, or definition of acceptable completion.

## Source boundary

This reference synthesizes public first-party descriptions from Anthropic and Glean with general distributed-systems and security principles. Glean's published metrics are vendor-reported unless independently validated. Exact internal SLOs, retry semantics, transaction behavior, and incident mechanisms are not assumed where they are not public.
