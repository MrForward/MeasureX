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

Project configuration fixes the Lead model route, workspace-write as the maximum default sandbox, on-request approvals, automatic approval review where available, disabled outbound network, and four total agent threads. Role files pin the [model policy](MODEL_POLICY.md) and reduce all roles except `builder` and `verification_runner` to read-only. The model never changes identity, credentials, approval rules, human gates, or acceptance criteria. Prompt and role instructions guide behavior; they are not deterministic enforcement. A requirements lock supplies an auditable product contract but cannot override platform or human authority.

Automatic review may decide an eligible sandbox exception under platform policy. It never satisfies a human-only gate. For those gates the orchestrator must stop in natural language, show the exact proposed action and impact, and wait for the human to perform or explicitly authorize the next permitted step.

### Reliability plane

Every plan states timeouts, bounded retries, idempotency, partial-completion behavior, and deterministic checks when relevant. `verification_runner` executes the smallest useful documented check first and the release gate uses all four repository commands. The handoff preserves base/head identity, initial and final git state, decisions, agent/model/skill use, evidence, effectiveness measures, and unresolved gates for replay.

## Orchestration contract

The main Codex chat is the Lead and only orchestrator. There is no orchestrator persona or peer-to-peer discussion. Agents return structured evidence to the Lead; the Lead owns routing, adjudication, synthesis, and final evidence. It is not a substitute independent critic and cannot fill in missing mandatory role evidence. Subagent activity may be inspected in Codex, but inspection does not replace the Lead-mediated artifact.

Maximum concurrency is the Lead plus three direct agents. Use capped waves: preflight; discovery/requirements when needed; preparation; builder alone; critique round one in one or more waves; same-builder remediation; verification and round two in waves; synthesis. Wait for every required result and close completed slots before the next wave. Never omit a mandatory role because all slots are occupied. Parallelize only independent reads or verification.

`builder` is the only tracked-file writer. `verification_runner` may run documented commands that create ignored artifacts but must stop if tracked state changes. Before any write or command group, record the initial `git status --short`, intended files, role, task ID, and artifact path. If a requested path contains unexpected user work, stop rather than overwrite it.

## Discovery and requirements authority

Use `$measurex-product-discovery` in a separate explicit Lead task when target users, JTBD, pains, alternatives, product strategy, hypotheses, or requirements are created or materially revised. `product_strategist` supplies cited evidence and implications; `product_manager` challenges them and owns the requirements contract. Research artifacts mediate their interaction; no peer discussion is needed.

Only `product_manager` may issue `REQUIREMENTS_LOCKED`, after evidence review, applicable architecture/design/QA feasibility input, and Lead confirmation. Builder refuses unlocked or ambiguous work. A behavior-neutral clarification receives a decision ID. Any change to observable behavior or scope pauses builder, creates a change request, and reopens discovery/PM review. The human decides changes to the locked MVP, target market, pricing, accepted risk, or external commitments.

### Structured two-round critique

1. **Preflight and prepare:** create the task ID and ignored artifact paths, confirm collision state and environment, and verify a requirements lock. `$measurex-delivery` controls non-trivial delivery. New or revised requirements first use `$measurex-product-discovery`. `architect` is added only for meaningful interface, data, or failure-mode decisions. Any UI invokes `$measurex-ui-quality` and requires `product_designer` plus a design brief before builder.
2. **Implement:** `builder` works alone as the only tracked-file writer. It covers applicable happy, negative, partial, empty, permission, error, and idempotency behavior. Focused mocked/local tests may provide provisional feedback after a status check, but cannot self-certify. The Lead and critics remain read-only; `verification_runner` is not an implementation writer.
3. **Critique round 1 — discovery:** `reviewer` checks correctness and scope, read-only `qa` checks acceptance and test design, and `security_reviewer` joins when auth, user data, billing, providers, webhooks, side effects, or release judgment are touched. `product_designer` participates for UI work. Each returns findings in its required schema. No free-form rebuttal occurs.
4. **Remediate:** the same designated writer addresses accepted findings and records declined findings with evidence. No second writer is introduced.
5. **Critique round 2 — verification:** `verification_runner` independently reruns selected and final commands; relevant critics inspect the revised diff and verify the acceptance matrix plus dispositions. `product_designer` and independent `reviewer` recheck every UI change. A new critical/high finding returns once to the same builder, receives a targeted recheck, and then the full gate reruns.
6. **Synthesize:** the Lead checks the final diff, verification outputs, UI rubric where applicable, unresolved human gates, collisions, effectiveness scorecard, and handoff. A critic cannot self-certify its own write.

For a trivial documentation-only change, the Lead may be the sole worker, but it still inspects the diff and records verification. Do not manufacture agent chatter when independent review adds no value; record the single-agent baseline as sufficient.

## Bounded failure and conflict handling

- Record timeout and outcome for each delegated task. Retry once with a narrower prompt and the same evidence. The Lead may take over only a non-mandatory bounded analysis; a missing mandatory role yields `BLOCKED`, never an implied pass.
- Limit the same technical blocker or root cause to three attempts: the initial attempt and two bounded remediation attempts. Persistent recurrence, unsafe or corrupt state, an unavailable mandatory tool, or an exhausted execution envelope produces a `BLOCKED` escalation packet.
- Normalize conflicting findings by exact evidence and acceptance impact. Ask an independent relevant critic for a tie-break read; do not vote. Persistent material product, security/privacy/legal risk, or design taste conflict goes to its human owner. Lead Ultra is only a documented next-task model selection, never an in-run authority shortcut.
- Finish safe independent local work before interrupting. Then stop for human-only actions, collision or unsafe state, a repeated blocker, or a mandatory unavailable tool. Do not label a condition merely manual/external when safety requires stopping.

## Skills and effectiveness evidence

Status and handoff artifacts use a task ID and record timestamps, `artifacts/agent-runs/<task-id>/`, any `artifacts/ui/<task-id>/` evidence, requirement-lock ID, each invoked skill, role/model/effort, waves, inputs, outputs, attempts, timeouts, evidence owners, conflicts, dispositions, and observable usage. Score acceptance pass rate, finding precision, missed or escaped defects, unsupported findings, remediation rounds, collisions, interruptions, and usage. Structural schema/scenario validation proves only artifact shape; behavioral scenarios still require tabletop or forward runs.

## Hooks decision

Hooks are deferred until one or two real feature cycles produce a stable run artifact and an enforceable failure contract. Hooks are defense-in-depth and require trust review; they do not replace skills, role sandboxes, human boundaries, or independent verification. Revisit only with evidence that a deterministic hook will catch a repeated failure without creating unsafe or noisy blocks.

## Decision and escalation policy

Reversible local implementation choices stay with the designated writer. Record them using the decision template, choose the smallest PRD-aligned option, and continue without asking. Examples include local names, internal helper boundaries, test fixture shape, and refactors that do not change public behavior or shared state.

Use the escalation template for a human-only boundary, irreconcilable authority conflict, unexpected overlapping work, unsafe/corrupt state, repeated blocker, or mandatory unavailable tool. Show the exact action, target, evidence, attempts, impact, and safe alternatives.

## Completion evidence

A completed feature has:

- acceptance criteria traced to PRD headings or an explicit human instruction;
- a PM-issued requirements lock with Lead confirmation for implementation;
- a final collision check and diff inspection;
- relevant deterministic tests and, at the release gate, `npm test`, `npm run type-check`, `npm run lint`, and `npm run build`;
- two critique rounds for non-trivial implementation or release work;
- `product_designer` before implementation and `product_designer` plus independent `reviewer` after implementation in both critique rounds for UI work;
- a recorded agent/model/skill ledger and effectiveness score;
- no unresolved critical/high findings and no bypassed human gate;
- a collision-aware handoff using the supplied template.
