# MeasureX Codex operating layer

This directory defines the additive operating contract for agent-assisted MeasureX work. It does not replace `AGENTS.md` or `MeasureX_MVP_PRD.md`. `docs/enterprise-agent-harness.md`, if present and applicable, is an optional design reference for agentic product features only; it is never general MeasureX product or engineering authority.

## Install in Codex desktop

1. Open this repository as a trusted local project so Codex loads `.codex/config.toml` and `.codex/agents/*.toml`.
2. After any agent or project-config change, start a **new chat**. Existing chats do not reliably reload changed agent configuration.
3. Choose an isolated **Worktree** for any task that may write. Never point a writer at the dirty Local checkout.
4. Paste the appropriate prompt from `workflows/` into the main chat. The main chat is the sole orchestrator; it delegates bounded work to the project agents.
5. Keep one writer per worktree. A worktree may designate `builder` or `qa` as its writer, never both; all other agents and the orchestrator stay read-only there.

The agents inherit the user's selected/default model because their TOML files intentionally omit `model`. Analysis and review agents use read-only sandboxes. Only `builder` and `qa` have workspace-write capability, which does not override the one-writer rule or the human gates.

## Read first

- [Operating model](OPERATING_MODEL.md)
- [Human-only boundaries](HUMAN_BOUNDARIES.md)
- [Workflow prompts](workflows/product-control-bootstrap.md)
- [Templates](templates/execution-plan.md)

## Later root `AGENTS.md` addition

After the pending guidance is reconciled, add exactly this small reference; do not replace either existing guidance document:

```md
## MeasureX agent operations
When using Codex agents in this repository, follow `docs/agent-operations/README.md`. It defines MeasureX scope locks, orchestration, human gates, and document precedence.
```
