---
name: measurex-ui-quality
description: Enforce MeasureX-specific interaction, visual, responsive, accessibility, state, and performance quality for any user-facing UI work. Use implicitly for pages, components, styling, data visualization, navigation, copy hierarchy, responsive behavior, accessibility, screenshots, or visual review; require product design before implementation and in both critique rounds.
---

# MeasureX UI quality

## Design and review

1. Read the [design brief](../../../docs/agent-operations/templates/design-brief.md) and [UI quality rubric](../../../docs/agent-operations/evals/UI_QUALITY_RUBRIC.md). Inspect current UI files and available screenshots before proposing changes. Source inspection can support a proposal but cannot pass visual, responsive, interaction, contrast, hierarchy, or target-user comprehension gates.
2. Require `product_designer` before `builder`. Establish a coherent contract around the thesis “a calibrated evidence instrument, not AI magic,” including measurement, comparison, competitive signal, ranking, annotated proof, and source provenance.
3. Define every component and applicable loading, empty, error, partial, success, and disabled state. Cover the normal path at 320x568, 390x844, 768x1024, and 1440x900 and high-risk states at the smallest/largest viewports. Define keyboard, focus, drawer trap/restore, WCAG AA contrast, reduced-motion, screen-reader, and color-independent behavior.
4. The Lead arranges a local app and records exactly one owner for each UI/browser evidence path. That owner serially writes current and revised screenshots under the task-scoped ignored UI directory with route, state, viewport, timestamp, and evidence owner. Stop on ambiguous ownership or tracked-state mutation. Browser unavailable is `NOT RUN`, distinct from the human taste gate. Never use image generation as a substitute for interface design.
5. Every UI implementation requires `product_designer` before builder and independent `product_designer` plus `reviewer` critique after implementation in both structured critique rounds. Designer proposes product specificity and the generic audit; reviewer challenges independently; Lead resolves from evidence.
6. Sample the normal path at all four viewports and each high-risk state at the smallest and largest viewports; expand for release-critical surfaces. Report every gate as `PASS`, `FAIL`, `NOT YET INSTALLED`, `NOT RUN`, or `HUMAN-GATED`.
7. Do not claim comprehension, usability, delight, conversion improvement, or user preference without observed target-user evidence; label expert heuristic judgment. Five-second comprehension and premium/taste approval remain human-gated when not actually tested.
8. Do not claim Playwright, axe, Lighthouse, fixtures, screenshot baselines, or performance targets passed without actual artifacts. Accessibility automation belongs to `verification_runner` only after documented commands exist. Preserve a screenshot baseline only after human approval.

Reject arbitrary purple/cyan gradients, gradient-square placeholder identity, glow blobs, glass cards, decorative robots/chat/sparkles, repeated card grids, copied competitor palettes, and unexplained generic motifs.
