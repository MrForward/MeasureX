# MeasureX UI quality rubric

Use evidence statuses `PASS`, `FAIL`, `NOT RUN`, `NOT YET INSTALLED`, or `HUMAN-GATED`. Never convert an unavailable tool or subjective confidence into `PASS`.

## Product and hierarchy gates

- **Product specificity:** `product_designer` proposes whether the surface expresses MeasureX measurement, comparison, competitive signal, ranking, annotated proof, and source provenance. `reviewer` independently challenges the proposal; the Lead resolves from cited rendered evidence.
- **First-glance comprehension:** define surface-specific first-glance questions. Do not mark target-user comprehension `PASS` without a five-second or observed user test; otherwise use `NOT RUN` or `HUMAN-GATED`. Expert hierarchy review is evidence only of a heuristic judgment.
- **Dominance:** each screen has one dominant action or state; secondary actions and decoration do not compete with it.
- **Generic-pattern audit:** zero copied competitor palettes and zero unexplained generic motifs. Reject arbitrary purple/cyan gradients, gradient-square placeholder identity, glow blobs, glass cards, decorative robots/chat/sparkles, and repeated card grids without a MeasureX-specific reason.

## Responsive gates

Evaluate the normal path at 320x568, 390x844, 768x1024, and 1440x900. Sample each high-risk state at 320x568 and 1440x900; expand all states to all viewports only for release-critical surfaces or evidence-driven risk.

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

Browser/Chrome evidence owns viewport and interaction observations and records route, state, viewport, timestamp, artifact, and evidence owner. Accessibility automation is owned by `verification_runner` only after documented commands exist. Source inspection alone cannot pass visual, responsive, interaction, contrast, or hierarchy gates.

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
- Rendered-state fixtures: **NOT YET INSTALLED** as a configured project evidence source.
- These are not passed gates. A transitive package-lock entry is not a configured check or evidence artifact.
- Browser or Chrome screenshots and interaction inspection should be used when available and permitted. Tool unavailability is **NOT RUN**, not a human approval. Separately record unavoidable manual browser/UX and premium/taste approval as **HUMAN-GATED**.
- Playwright, axe, Lighthouse, and stable rendered fixtures are the next bounded tooling implementation recommendation; this document does not authorize dependency changes.
- Establish screenshot baselines only after human visual approval; record the approved viewport, state, date, and artifact location.
- Never claim comprehension, usability, delight, conversion improvement, or user preference without observed user evidence.

## Rubric result

| Gate | Status | Evidence | Owner | Follow-up |
|---|---|---|---|---|
| Product specificity |  |  | designer proposes; reviewer challenges; Lead resolves |  |
| First-glance comprehension |  |  | observed users / human gate |  |
| Dominant action/state |  |  | `product_designer` |  |
| Viewports / interactions |  |  | Browser evidence owner |  |
| 44px targets |  |  | `product_designer` |  |
| Keyboard / focus / drawer |  |  | `product_designer` |  |
| WCAG AA / color-independent meaning |  |  | `verification_runner` when installed; otherwise heuristic/manual |  |
| Screen reader / reduced motion |  |  | `product_designer` |  |
| State coverage |  |  | `qa` |  |
| Performance targets |  |  | `verification_runner` or human |  |
| Generic-pattern audit |  |  | designer / reviewer / Lead |  |
| Human taste gate / screenshot baseline |  |  | human |  |
