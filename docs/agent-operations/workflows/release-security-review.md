# Release and security review

Run in a clean, isolated release-candidate worktree. This workflow reviews; it never merges or deploys.

```text
Use $measurex-quality-gate in release mode for <BASE>...<HEAD> in this isolated worktree.

Act as the Lead and sole orchestrator. Follow docs/agent-operations/OPERATING_MODEL.md. Record base/head SHAs, git status, diff paths, pre-existing changes, release criteria, skills, and the agent/model/effort ledger. Do not edit application source, read .env.local, use network access, call live providers, mutate Stripe/Resend/database state, commit, push, merge, or deploy.

Create a task ID, ignored run/UI artifact paths, and non-overlapping ownership map. The tracked-read-only Lead owns control records, verification_runner only its verification evidence, and one named owner UI/browser evidence; serialize writes and stop if ownership is ambiguous or tracked state changes. Verify dependency state under ENVIRONMENT_SETUP.md; verification_runner never installs. Schedule required roles in capped waves, wait for every result, and release completed slots. Record attempts and timeouts; one narrower retry uses the same evidence, and a missing mandatory role is BLOCKED.

Delegate in parallel where safe:
- qa: read-only PRD and acceptance mapping, test design, and manual/external-state gaps; qa never runs checks;
- verification_runner: run npm test, npm run type-check, npm run lint, and npm run build; capture exact exit codes and concise evidence; never modify tracked files;
- reviewer: read-only correctness, integrity, client-batch, locked-MVP, and test-gap review;
- security_reviewer: required read-only trust-boundary review, including identity, tenant isolation, webhooks, idempotency, secrets, injection, side effects, recovery, and audit evidence;
- if the diff contains UI, invoke $measurex-ui-quality; require product_designer and independent reviewer critique, rendered Browser/Chrome evidence or NOT RUN, and a separate human taste gate.

Critique round 1: normalize and deduplicate findings by root cause. Every finding needs file/line evidence, impact, remediation, and verification. Separate confirmed defects, defense-in-depth items, manual validation, external state, environment failures, and NOT YET INSTALLED tools.

There is no remediation write in this review worktree. Produce a bounded remediation plan for a separate feature worktree. Security/legal/privacy risk acceptance and unavoidable manual UI validation are human-only gates.

Critique round 2: reviewer and security_reviewer cross-check normalized findings against the diff, qa mapping, and verification_runner evidence. product_designer rechecks every UI finding and the human taste gate. qa confirms acceptance coverage without reinterpreting command output.

Resolve conflicts by exact evidence, acceptance impact, and an independent relevant tie-break read, not a vote. A disputed critical/high finding never passes by Lead assertion. Missing dependencies, state-changing commands, mandatory unavailable tooling, or exhausted bounds cannot pass.

Return PASS, FAIL, HUMAN-GATED, or BLOCKED with evidence. PASS requires installed dependencies, all four commands successful, every mandatory role complete, no unresolved critical/high issue, both rounds complete, no scope drift or collision, UI rubric resolved when applicable, and manual/external gates explicitly resolved or out of acceptance scope. Include the agent effectiveness scorecard and single-agent baseline. Do not merge or deploy.
```
