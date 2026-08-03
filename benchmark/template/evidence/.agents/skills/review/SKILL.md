---
name: review
description: Detects fake Evidence citations and exclusions created solely to evade compiler errors while compilation owns structural checks. Read only for a review objective.
---

# Review

The compiler owns target resolution, host eligibility, overlap, and coverage. Review inspects the full acknowledgement population for fake citations and exclusions created solely to evade compiler errors.

Before review, confirm every claim for the current phase is enabled.

For every `@evidence`, read the target, reason, and complete current host. A citation is justified only when the artifact actually implements, represents, or proves the target and the reason states that specific relation. Mere relevance is not enough. Correct every fake citation created solely to evade compiler errors.

For every `@evidenceExclude`, read the target and reason. Decide whether it records a genuine exclusion: this claim does not cover the target, the reason says what handles it instead, and the reason says when that decision becomes invalid. Correct every fake exclusion created solely to evade compiler errors.

Several hosts may truthfully cite one target. Do not consolidate them. A clean compiler gate proves structure, not truth.

Continue after each finding until the complete active-phase population is inspected. Correct every fake tag, then require a clean current compiler gate.

Compare every `lint.config.ts` with the baseline commit. Deleting a predeclared `disabled` property is the one permitted edit; a reintroduced `disabled`, a changed claim, a changed selector, a lowered severity, or any other difference is a finding to report and restore, whatever it unblocks.

## Final Checklist

- [ ] Every claim for the current phase is enabled.
- [ ] Inspected every active-phase acknowledgement, its complete host, and its target.
- [ ] Every `@evidence` reason states how the artifact implements, represents, or proves the target; every fake citation created solely to evade compiler errors corrected.
- [ ] Every `@evidenceExclude` is a genuine exclusion; every fake exclusion created solely to evade compiler errors corrected.
- [ ] Every `lint.config.ts` matches the baseline except for deleted `disabled` properties.
- [ ] Current graph build ran clean with the canonical graph active.

If any item is unchecked, keep the Goal active and complete the missing review or correction.
