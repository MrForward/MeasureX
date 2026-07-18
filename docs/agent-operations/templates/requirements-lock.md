# MeasureX requirements lock

- Lock ID / version / issued timestamp and timezone:
- Status: DRAFT | REQUIREMENTS_LOCKED | CHANGE_REQUESTED | SUPERSEDED
- PM owner / Lead confirmation and timestamp:
- Discovery brief / PRD / decision sources:
- Changes from prior draft or lock:

## Contract

- Problem / primary user / JTBD / evidence confidence:
- Goals / non-goals:
- Use cases:
- Functional requirements:
- Nonfunctional requirements:
- Data / identity / security / privacy constraints:
- Design implications:
- Analytics / success measures, evidence basis, and owner:
- Dependencies / assumptions / open decisions:

## Observable behavior and states

| Requirement | Positive | Negative | Partial | Empty | Permission | Error / recovery | Idempotency | Evidence owner |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |

## Acceptance traceability

| Acceptance ID | Requirement / PRD source | Deterministic check | Manual / external evidence | Owner | Exit condition |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## Change control

- Behavior-neutral clarification: decision ID; lock version remains traceable.
- Observable behavior or scope change: pause builder, set `CHANGE_REQUESTED`, reopen discovery/PM, issue a new version after review.
- Human approval required: locked MVP, target market, pricing, accepted risk, or external commitment.
- No agent may silently reinterpret or override this lock.
