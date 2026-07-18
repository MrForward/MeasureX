---
name: measurex-ui-quality
description: Enforce MeasureX-specific interaction, visual, responsive, accessibility, state, and performance quality for any user-facing UI work. Use implicitly for pages, components, styling, data visualization, navigation, copy hierarchy, responsive behavior, accessibility, screenshots, or visual review; require product design before implementation and in both critique rounds.
---

# MeasureX UI quality

## Design and review

1. Read the [design brief](../../../docs/agent-operations/templates/design-brief.md) and [UI quality rubric](../../../docs/agent-operations/evals/UI_QUALITY_RUBRIC.md). Inspect current UI files and screenshots before proposing changes when evidence is available.
2. Require `product_designer` before `builder`. Establish a coherent contract around the thesis “a calibrated evidence instrument, not AI magic,” including measurement, comparison, competitive signal, ranking, annotated proof, and source provenance.
3. Cover every component and loading, empty, error, partial, success, and disabled state at 320x568, 390x844, 768x1024, and 1440x900. Define keyboard, focus, drawer trap/restore, WCAG AA contrast, reduced-motion, screen-reader, and color-independent behavior.
4. Use Browser or Chrome tooling for current screenshots and interaction checks when available and permitted. Otherwise record the unavoidable manual browser/UX gate. Never use image generation as a substitute for interface design.
5. Require `product_designer` in critique round one, builder remediation, and `product_designer` recheck in round two. Run the generic-pattern audit and report every rubric gate as pass, fail, not installed, not run, or human-gated with evidence.
6. Do not claim Playwright, axe, Lighthouse, screenshot baselines, or performance targets passed without actual artifacts. Preserve a screenshot baseline only after human approval.

Reject arbitrary purple/cyan gradients, gradient-square placeholder identity, glow blobs, glass cards, decorative robots/chat/sparkles, repeated card grids, copied competitor palettes, and unexplained generic motifs.
