# Current-freeze block-global safety addendum — prediction, not measurement

Formal review: https://github.com/samchon/lint-plugin-evidence/pull/105#pullrequestreview-4801568652.

This append-only addendum extends the token-safety amendment from per-cell guards to the concurrent block. A four-cell Todo/Reddit block cannot rely on four independent thresholds because its aggregate observed usage could approach four times a cell limit before any one guard fires. Every plan therefore freezes both arm-equal per-cell `maximumObservedTotalTokens` and hard-wall duration and one `maximumObservedBlockTotalTokens` and block hard-wall duration.

The outer coordinator durably aggregates each deduplicated response ID once across all four cells. A block threshold or deadline triggers one idempotent shared stop event, quiesces campaigns, and terminates every primary and descendant process tree. Every affected cell seal references that shared event digest and its cell and block observed totals. Neither guard is a hard ceiling: multiple cells and responses can already be in flight, so overshoot may exceed one response per cell and forced termination may leave only a right-censored lower bound.

No paid generation result, transcript, grade, gate result, time observation, token observation, or quality observation informed this amendment. It changes no corpus, wall-time, token-volume, quality, coverage, campaign, or reach prior. Numeric cell and block limits remain null execution pins until the merged plan freezes them, so this addendum is not launch approval.
