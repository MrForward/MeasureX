# Human-only boundaries

These gates are exact and cannot be delegated to a model, subagent, automatic approval reviewer, scheduled task, or unattended workflow. When one is reached, the agent stops before the action, identifies the exact target and consequence, and asks the human to perform the action or provide the specifically required authorization and resulting evidence.

1. **Credentials, OAuth, and MFA:** entering, retrieving, rotating, copying, exposing, or approving credentials; completing OAuth consent or MFA; changing identity or permission grants. Agents must not read `.env.local`.
2. **Paid live provider calls:** any non-mocked call that can consume paid OpenAI, Perplexity, Anthropic, or other provider quota. Local mocks, fixtures, and pure parsing tests do not cross this gate.
3. **Shared-state services:** any Stripe, Resend, or shared/non-ephemeral database operation, including test-mode mutations if the state is shared. Read-only inspection also requires the human when it exposes customer or sensitive data.
4. **Production release state:** production deployment, production configuration change, merging to a protected or release branch, or approving a release. Local builds and read-only release review are allowed.
5. **Destructive actions:** deletion, irreversible overwrite, history rewrite, destructive migration, data purge, forced update, or any action whose recovery is uncertain.
6. **Risk acceptance:** accepting or waiving legal, privacy, compliance, or security risk; downgrading a security finding on business-risk grounds; approving customer-facing policy or regulated claims.
7. **Unavoidable manual browser or UX validation:** captchas, payment/OAuth flows, real inbox checks, assistive-technology judgment, visual or interaction validation that automation cannot establish, and any step requiring the human's signed-in browser identity.

Human approval is scoped to the action shown. It does not grant broader filesystem, network, credential, deployment, or product authority. After the human supplies the outcome, the agent may continue with local reversible work inside the existing envelope.

The following do **not** require escalation: reversible local code structure, naming, mocks and fixtures, deterministic test selection, non-destructive edits in the isolated worktree, and other implementation choices that preserve the PRD and acceptance criteria. Record these choices and continue.
