# MeasureX agent operating model

## Mission and fixed product boundary

The operating layer helps deliver the locked MeasureX MVP without redefining it. `MeasureX_MVP_PRD.md` remains the product source of truth. Until a human records an explicit product change, all work must preserve:

- exactly two answer engines: ChatGPT `gpt-4o-mini` and Perplexity `sonar`;
- rule-based extraction, with no LLM extraction;
- client-driven scan batches, with no queue or cron;
- no RBAC in the MVP;
- one Stripe plan at USD $9/month.

Prompt generation described in the PRD is not a third answer engine. Post-MVP roadmap items are not authorization to implement them.

## Stale-document warning and precedence

Plans, status reports, decisions, escalations, and handoffs are snapshots and can become stale. Never treat an older generated document as proof of current repository state or permission to act. Re-read the relevant source and inspect the current worktree before every task.

Apply authority by domain:

1. The current human instruction controls the task, but cannot silently weaken platform or organization policy.
2. Applicable `AGENTS.md` files control repository working rules. This additive layer does not replace the current root guidance. `docs/enterprise-agent-harness.md`, if present and applicable, is an optional design reference for agentic product features only; it is not general MeasureX product or engineering authority.
3. `MeasureX_MVP_PRD.md` controls product scope and acceptance intent.
4. Human-approved decision records control only their stated scope and only when they do not conflict with items 1-3.
5. Current code, tests, and git state are implementation evidence, not authority to expand product scope.
6. This operating guide and its templates control agent procedure.
7. Older plans, statuses, escalations, and handoffs are context only.

When sources conflict, cite both. Use the narrower, reversible interpretation if it preserves the locked MVP and acceptance criteria. Escalate when the conflict would change product behavior, a human-only boundary, or the definition of done; never silently choose a broader scope.

## Three layers

### Adaptive inner harness

The user starts one Lead task. A matching repo skill may then trigger implicitly and the Lead may decompose work, choose relevant context, select bounded custom agents, sequence checks, and replan after evidence. Agent files never cause idle or background execution. Delegation is used only for context isolation or independent verification. Direct children never spawn more agents (`max_depth = 1`).

### Deterministic outer envelope

Project configuration fixes the Lead model route, workspace-write as the maximum default sandbox, on-request approvals, automatic approval review where available, disabled outbound network, and four total agent threads. Role files pin the [model policy](MODEL_POLICY.md) and reduce all roles except `builder` and `verification_runner` to read-only. The model never changes identity, credentials, approval rules, scope locks, human gates, or acceptance criteria.

Automatic review may decide an eligible sandbox exception under platform policy. It never satisfies a human-only gate. For those gates the orchestrator must stop in natural language, show the exact proposed action and impact, and wait for the human to perform or explicitly authorize the next permitted step.

### Reliability plane

Every plan states timeouts, bounded retries, idempotency, partial-completion behavior, and deterministic checks when relevant. `verification_runner` executes the smallest useful documented check first and the release gate uses all four repository commands. The handoff preserves base/head identity, initial and final git state, decisions, agent/model/skill use, evidence, effectiveness measures, and unresolved gates for replay.

## Orchestration contract

The main Codex chat is the Lead and only orchestrator. There is no orchestrator persona or peer-to-peer discussion. Agents return structured evidence to the Lead; the Lead owns routing, synthesis, and the final decision. Subagent activity may be inspected in Codex, but inspection does not replace the Lead-mediated artifact.

Maximum concurrency is the Lead plus three direct agents. Parallelize only independent read or verification tasks. `builder` is the only tracked-file writer. `verification_runner` may run documented commands that create ignored artifacts but must stop if tracked state changes. Before any write or command group, record the initial `git status --short`, intended files, and role. If a requested path contains unexpected user work, stop rather than overwrite it.

### Structured two-round critique

1. **Prepare:** `$measurex-delivery` controls non-trivial delivery. `product_manager` maps PRD scope and acceptance criteria; `architect` is added only for meaningful interface, data, or failure-mode decisions. Any user-facing UI also invokes `$measurex-ui-quality` and requires `product_designer` plus a design brief before builder starts.
2. **Implement:** `builder` is the only tracked-file writer. The Lead and every critic remain read-only. `verification_runner` is not an implementation writer.
3. **Critique round 1 — discovery:** `reviewer` checks correctness and scope, read-only `qa` checks acceptance and test design, and `security_reviewer` joins when auth, user data, billing, providers, webhooks, side effects, or release judgment are touched. `product_designer` participates for UI work. Each returns findings in its required schema. No free-form rebuttal occurs.
4. **Remediate:** the same designated writer addresses accepted findings and records declined findings with evidence. No second writer is introduced.
5. **Critique round 2 — verification:** `verification_runner` supplies command evidence; the relevant critics inspect the revised diff and verify the acceptance matrix plus round-one dispositions. `product_designer` rechecks every UI change. Critics must identify new findings as new evidence and state explicitly when no actionable finding remains.
6. **Synthesize:** the Lead checks the final diff, verification outputs, UI rubric where applicable, unresolved human gates, collisions, effectiveness scorecard, and handoff. A critic cannot self-certify its own write.

For a trivial documentation-only change, the Lead may be the sole worker, but it still inspects the diff and records verification. Do not manufacture agent chatter when independent review adds no value; record the single-agent baseline as sufficient.

## Skills and effectiveness evidence

Status and handoff artifacts record each invoked skill and each agent's role, model, effort, inputs, outputs, and finding disposition. Score acceptance pass rate, finding precision, missed or escaped defects, unsupported findings, remediation rounds, collisions, human interruptions, and time or usage when observable. Compare against the simplest single-agent baseline rather than assuming fan-out is beneficial.

## Hooks decision

Hooks are deferred until one or two real feature cycles produce a stable run artifact and an enforceable failure contract. Hooks are defense-in-depth and require trust review; they do not replace skills, role sandboxes, human boundaries, or independent verification. Revisit only with evidence that a deterministic hook will catch a repeated failure without creating unsafe or noisy blocks.

## Decision and escalation policy

Reversible local implementation choices stay with the designated writer. Record them using the decision template, choose the smallest PRD-aligned option, and continue without asking. Examples include local names, internal helper boundaries, test fixture shape, and refactors that do not change public behavior or shared state.

Use the escalation template only for a human-only boundary, an irreconcilable authoritative-source conflict, unexpected overlapping user work, or a blocker that materially changes scope or acceptance. An escalation must show the exact action, target, evidence, impact of waiting, and safe alternatives.

## Completion evidence

A completed feature has:

- acceptance criteria traced to PRD headings or an explicit human instruction;
- a final collision check and diff inspection;
- relevant deterministic tests and, at the release gate, `npm test`, `npm run type-check`, `npm run lint`, and `npm run build`;
- two critique rounds for non-trivial implementation or release work;
- `product_designer` before implementation and in both critique rounds for UI work;
- a recorded agent/model/skill ledger and effectiveness score;
- no unresolved critical/high findings and no bypassed human gate;
- a collision-aware handoff using the supplied template.
