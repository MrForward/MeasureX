# Agent effectiveness scorecard

Score from durable task artifacts; use `not observable` instead of invented numbers. Compare the multi-agent run with a single capable Lead baseline on a task of similar shape whenever practical.

## Task identity

- Task ID / feature / timestamps:
- Base / head / worktree:
- Run artifact path / UI artifact path:
- Requirements-lock ID / version:
- Skills invoked:
- Agents, models, effort, waves, attempts, timeouts, and assignments:
- Evidence owners / conflicts / dispositions:
- Single-agent baseline task or reason unavailable:

## Measures

| Measure | Definition | Multi-agent result | Single-agent baseline | Evidence |
|---|---|---|---|---|
| Acceptance pass rate | Passed acceptance criteria / criteria with executable or resolved manual evidence |  |  |  |
| Accepted-finding precision | Accepted actionable findings / all critic findings |  |  |  |
| Missed / escaped defects | Defects found after the declared gate that were in gate scope |  |  |  |
| Unsupported findings | Findings withdrawn for lack of code, PRD, test, or threat evidence |  |  |  |
| Remediation rounds | Writer revision cycles before exit |  |  |  |
| Collisions | Unexpected overlapping or tracked-file changes |  |  |  |
| Valid human interruptions | Human-only gates correctly raised |  |  |  |
| Unnecessary human interruptions | Reversible local choices escalated without need |  |  |  |
| Completion integrity | False PASS, premature completion, or omitted gate count |  |  |  |
| Time | End-to-end and active time where observable |  |  |  |
| Usage | Tokens, model calls, and tool calls where observable |  |  |  |
| Timeout recovery | Narrow retries, mandatory-role failures, and correct blocked outcomes |  |  |  |
| Wave integrity | Required roles scheduled, awaited, and slots released without omission |  |  |  |
| Requirements integrity | Lock observed; clarifications and behavior changes routed correctly |  |  |  |

## Outcome

- Quality or coverage gained over the single-agent baseline:
- Coordination overhead introduced:
- Was each delegated role necessary?
- Was the model route appropriate?
- Skill or workflow change proposed from evidence:
- Keep, simplify, or retire the multi-agent treatment:

Do not treat more agents, findings, tokens, or elapsed time as success. The operating layer is effective only when it improves acceptance evidence, defect detection, safe completion, or useful context isolation enough to justify its overhead.

The schemas and `evals/agent-ops/validate.mjs` validate artifact structure only. Adversarial scenarios require actual tabletop or forward runs before their behavioral invariants can be scored; structural success is not behavioral proof.
