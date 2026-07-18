# MeasureX UI quality rubric

Use evidence statuses `PASS`, `FAIL`, `NOT RUN`, `NOT YET INSTALLED`, or `HUMAN-GATED`. Never convert an unavailable tool or subjective confidence into `PASS`.

## Product and hierarchy gates

- **Product specificity:** the interface expresses MeasureX measurement, comparison, competitive signal, ranking, annotated proof, and source provenance rather than generic AI/SaaS styling.
- **First-glance comprehension:** within the initial viewport a target user can answer: What is my visibility? Where am I losing? What raw answer or source proves it?
- **Dominance:** each screen has one dominant action or state; secondary actions and decoration do not compete with it.
- **Generic-pattern audit:** zero copied competitor palettes and zero unexplained generic motifs. Reject arbitrary purple/cyan gradients, gradient-square placeholder identity, glow blobs, glass cards, decorative robots/chat/sparkles, and repeated card grids without a MeasureX-specific reason.

## Responsive gates

Evaluate 320x568, 390x844, 768x1024, and 1440x900.

- No critical horizontal page overflow at any required viewport.
- Tables, comparisons, evidence, filters, drawers, and primary actions remain usable without hiding required meaning.
- Interactive pointer targets are at least 44x44 CSS pixels unless an equivalent accessible target is demonstrably provided.
- Content priority and dominant action remain stable across breakpoints.

## Accessibility gates

- Complete keyboard access with logical order and visible focus.
- Modal/drawer focus is trapped while open, Escape dismisses when safe, and focus returns to the trigger.
- Text and meaningful UI components meet WCAG AA contrast.
- Color is never the sole carrier of status, score direction, recommendation, or error meaning.
- Reduced-motion preference removes non-essential motion without removing state feedback.
- Screen-reader names, roles, headings, relationships, table semantics, errors, and status announcements are meaningful.
- Once axe tooling exists, there are zero serious or critical axe findings.

## State and performance gates

- Loading, empty, error, partial, success, disabled, unauthorized/inactive, and long-content states are designed where applicable.
- Landing page retains the PRD goal of &lt;2 seconds on 3G throttle.
- Largest Contentful Paint is ≤2.5 seconds under the documented test profile.
- Cumulative Layout Shift is ≤0.1.
- Performance evidence names the environment, route, viewport, throttle, and run date.

## Evidence state today

- Playwright: **NOT YET INSTALLED** as a configured project test runner.
- axe: **NOT YET INSTALLED** as a configured project accessibility check.
- Lighthouse: **NOT YET INSTALLED** as a configured project performance check.
- These are not passed gates. A transitive package-lock entry is not a configured check or evidence artifact.
- Browser or Chrome screenshots and interaction inspection should be used when available and permitted. Otherwise record an unavoidable manual browser/UX gate.
- Establish screenshot baselines only after human visual approval; record the approved viewport, state, date, and artifact location.

## Rubric result

| Gate | Status | Evidence | Owner | Follow-up |
|---|---|---|---|---|
| Product specificity |  |  | `product_designer` |  |
| First-glance comprehension |  |  | `product_designer` |  |
| Dominant action/state |  |  | `product_designer` |  |
| Four viewports / overflow |  |  | `product_designer` |  |
| 44px targets |  |  | `product_designer` |  |
| Keyboard / focus / drawer |  |  | `product_designer` |  |
| WCAG AA / color-independent meaning |  |  | `product_designer` |  |
| Screen reader / reduced motion |  |  | `product_designer` |  |
| State coverage |  |  | `qa` |  |
| Performance targets |  |  | `verification_runner` or human |  |
| Generic-pattern audit |  |  | `product_designer` |  |
| Human taste gate / screenshot baseline |  |  | human |  |
