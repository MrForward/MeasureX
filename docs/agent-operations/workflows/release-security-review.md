# Release and security review

Run in a clean, isolated release-candidate worktree. This workflow reviews; it never merges or deploys.

```text
Perform the MeasureX release and security gate for <BASE>...<HEAD> in this isolated worktree.

Act as the sole orchestrator. Follow docs/agent-operations/OPERATING_MODEL.md. Record base/head SHAs, git status, diff paths, pre-existing changes, and release acceptance criteria. Do not edit application source, read .env.local, use network access, call live providers, mutate Stripe/Resend/database state, commit, push, merge, or deploy.

Designate qa as the only workspace-write-capable worker for this review solely because verification commands may create ignored local artifacts; qa must not modify tracked files. Delegate in parallel where safe:
- qa: run npm test, npm run type-check, npm run lint, and npm run build; return exit codes, concise failure evidence, and acceptance coverage;
- reviewer: read-only diff review for correctness, data integrity, client-driven batching regressions, locked-MVP drift, and test gaps;
- security_reviewer: read-only threat-boundary review, including identity, permissions, tenant isolation, webhook/idempotency, secrets, injection, side effects, failure recovery, and audit evidence.

Critique round 1: normalize all findings by severity and deduplicate them by root cause. Every finding needs file/line evidence, impact, remediation, and verification. Separate confirmed defects, defense-in-depth items, manual validation, and environment failures.

There is no remediation write in this review worktree. Produce a bounded remediation plan for a separate feature worktree. Any proposed security/legal/privacy risk acceptance is a human-only gate.

Critique round 2: ask reviewer and security_reviewer to cross-check the normalized findings against the diff and qa evidence. They must identify unsupported or missing findings, verify locked-MVP invariants, and state release blockers. Ask qa to confirm command evidence and whether failures are reproducible without network or secrets.

Return a release recommendation of PASS, FAIL, or HUMAN-GATED with evidence. PASS requires all four commands successful, no unresolved critical/high issue, both critique rounds complete, no scope drift, and manual validation explicitly listed rather than guessed. Do not merge or deploy.
```
