---
name: review
description: Defines the review of @evidence and @evidenceExclude for fake citations and exclusions created solely to evade compiler errors, of configuration edited beyond the one permitted activation, and of the compiler and runtime gates each scope must pass. Read only for a review objective; backend.md, frontend.md, and overall.md carry the per-scope configuration and gates.
---

# Review

The compiler owns target resolution, host eligibility, overlap, and coverage. Review inspects the full acknowledgement population for fake citations and exclusions created solely to evade compiler errors, then proves the gates its scope names.

Read the per-scope document for the current objective before beginning:

- Backend Review: [backend.md](backend.md)
- Frontend Review: [frontend.md](frontend.md)
- Overall Review: [overall.md](overall.md)

## Tag Inspection

Before review, confirm every claim for the current phase is enabled. If an earlier stage left a prescribed `disabled` property, delete it before reviewing.

For every `@evidence`, read the target, reason, and complete current host. A citation is justified only when the artifact actually implements, represents, or proves the target and the reason states that specific relation; mere relevance is not enough. Correct every fake citation.

For every `@evidenceExclude`, read the target and reason. It is genuine only when the claim does not cover the target, the reason names what handles it instead, and the reason names when the decision becomes invalid. Correct every fake exclusion.

Several hosts may truthfully cite one target; do not consolidate them. A clean compiler gate does not prove a tag truthful.

Continue after each finding until the complete active-phase population is inspected. Correct every fake tag, then pass the scope's gates.

## Configuration

Compare every configuration the scope document names with the baseline commit. The one permitted edit is deleting a predeclared `disabled` property with the comment that marks it. A reintroduced `disabled`, a changed claim, a changed selector, a lowered severity, or any other difference is a finding to report and restore, whatever it unblocks.

## Final Checklist

- [ ] Every claim for the current phase is enabled.
- [ ] Inspected every active-phase acknowledgement, its complete host, and its target.
- [ ] Every `@evidence` reason states how the artifact implements, represents, or proves the target; every fake citation corrected.
- [ ] Every `@evidenceExclude` is a genuine exclusion; every fake exclusion corrected.
- [ ] Every scoped `lint.config.ts` matches the baseline except for deleted `disabled` properties.
- [ ] The scope's compiler and runtime gates passed after the last correction.

If any item is unchecked, keep the Goal active and complete the missing review or correction.
