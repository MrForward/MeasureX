# MeasureX Codex operating layer

This directory defines the additive operating contract for agent-assisted MeasureX work. It does not replace `AGENTS.md` or `MeasureX_MVP_PRD.md`. `docs/enterprise-agent-harness.md`, if present and applicable, is an optional design reference for agentic product features only; it is never general MeasureX product or engineering authority.

## Install in Codex desktop

1. Open this repository as a trusted local project so Codex loads `.codex/config.toml`, `.codex/agents/*.toml`, and `.agents/skills/*`.
2. Merge or otherwise make the operating-layer commit available, then start a **new chat**. Existing chats do not reliably reload changed agent or skill configuration.
3. Start one Lead task in that chat. Matching repo skills may trigger implicitly from the request; agents do not idle-run merely because their files exist.
4. Choose an isolated **Worktree** for any task that may write. Never point a writer at the dirty Local checkout.
5. Paste the appropriate prompt from `workflows/` or describe the outcome. Product discovery is a separate explicit Lead task. The Lead is the sole orchestrator, adjudicator, and final evidence owner; it invokes or delegates agents according to the matching skill but never replaces an independent mandatory critic.
6. Keep `builder` as the only tracked-file writer in a feature worktree. `verification_runner` has workspace-write only so documented checks can create ignored artifacts; it must never edit tracked files. Every other custom role is read-only.

The Lead and custom roles use the explicit [model policy](MODEL_POLICY.md). The user's one Lead task activates the workflow; model pins and implicit skills do not create background work. Subagent activity remains inspectable in Codex, while all decisions and handoffs flow through the Lead instead of peer chatter.

## Repo skills

- `$measurex-delivery` — non-trivial feature and fix delivery.
- `$measurex-product-discovery` — users, JTBD, pains, alternatives, strategy, hypotheses, and new or revised requirements; not routine work against a lock.
- `$measurex-ui-quality` — every user-facing visual, interaction, responsive, or accessibility change.
- `$measurex-quality-gate` — diagnostic, nightly, verification, and release judgment.

Implicit invocation is enabled. The Lead must still name the skill in status and handoff artifacts, and may explicitly invoke it when trigger ambiguity matters.

## Read first

- [Operating model](OPERATING_MODEL.md)
- [Model policy](MODEL_POLICY.md)
- [Human-only boundaries](HUMAN_BOUNDARIES.md)
- [Environment and dependency setup](ENVIRONMENT_SETUP.md)
- [Product discovery workflow](workflows/product-discovery.md)
- [Workflow prompts](workflows/product-control-bootstrap.md)
- [Templates](templates/execution-plan.md)
- [UI quality rubric](evals/UI_QUALITY_RUBRIC.md)
- [Agent effectiveness scorecard](evals/AGENT_EFFECTIVENESS_SCORECARD.md)

## Hooks are deferred

Do not add project hooks yet. Run one or two real feature cycles first and identify a stable, reviewable run record under `artifacts/agent-runs/<task-id>/` worth enforcing. Hooks are trusted defense-in-depth, not deterministic enforcement supplied by prompt text and not the primary source of scope, identity, approval, or completion policy. Project hooks require explicit trust and are skipped when new or changed until reviewed; premature hooks would encode an unproven artifact contract.

## Later root `AGENTS.md` addition

The root pointer remains deferred because pending guidance may conflict. After that guidance is reconciled, append exactly this small reference to root `AGENTS.md` without deleting or replacing other guidance, review the combined precedence, and start a new chat:

```md
## MeasureX agent operations
When using Codex agents in this repository, follow `docs/agent-operations/README.md`. It defines MeasureX scope locks, orchestration, human gates, and document precedence.
```
