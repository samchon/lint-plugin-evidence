---
name: review
description: Detects fake Evidence citations and exclusions created solely to evade compiler errors while compilation owns structural checks. Read only for a review objective.
---

# Review

The compiler owns target resolution, host eligibility, overlap, and coverage. Review inspects the full acknowledgement population for fake citations and exclusions created solely to evade compiler errors.

Before review, confirm every claim for the current phase is enabled.

For every `@evidence`, read the target, reason, and complete current host. A citation is justified only when the artifact actually implements, represents, or proves the target and the reason states that specific relation. Mere relevance is not enough. Correct every fake citation created solely to evade compiler errors.

When backend tests are in the current review scope, review their product-operation reference by operation rather than by tag count. Read every scenario host for that operation and verify at least two hosts prove semantically distinct business behavior. Each host must designate and invoke that operation as its one primary target; dependency calls may only establish public preconditions, and follow-up calls may only observe public effects. Neither receives operation evidence from that host. A generic route loop, availability check, or duplicated happy path is not operation proof.

For every `@evidenceExclude`, read the target and reason. Decide whether it records a genuine exclusion: this claim does not cover the target, the reason says what handles it instead, and the reason says when that decision becomes invalid. Correct every fake exclusion created solely to evade compiler errors.

Several hosts may truthfully cite one target. Do not consolidate them. A clean compiler gate proves structure, not truth.

Continue after each finding until the complete active-phase population is inspected. Correct every fake tag, then require a clean current compiler gate.

## Final Checklist

- [ ] Every claim for the current phase is enabled.
- [ ] Inspected every active-phase acknowledgement, its complete host, and its target.
- [ ] Every `@evidence` reason states how the artifact implements, represents, or proves the target; every fake citation created solely to evade compiler errors corrected.
- [ ] When backend tests were in scope, every product operation had at least two semantically distinct scenario hosts, and each host gave operation evidence only to its one primary target.
- [ ] Every `@evidenceExclude` is a genuine exclusion; every fake exclusion created solely to evade compiler errors corrected.
- [ ] Current graph build ran clean with the canonical graph active.

If any item is unchecked, keep the Goal active and complete the missing review or correction.
