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

Several hosts may truthfully cite one target; do not consolidate them. A clean compiler gate does not prove a tag truthful.

Continue after each finding until the complete active-phase population is inspected. Correct every fake tag, then pass the scope's gates.

## Exclusion Carriers

An exclusion is the one tag that turns a missing artifact into a green build, so its carriers are read as a population of their own. Open every carrier the scope document names, in full, and take each entry one at a time. An entry the compiler accepted is an entry someone still has to justify.

Judge each against three questions, and record a finding on any one of them:

1. **Is it genuine?** The claim must not cover the target, the reason must name what handles it instead, and the reason must name the condition that would make the decision false. A reason that concludes — "not applicable", "internal", "future work", "not implemented" — states nothing that could be checked.
2. **Does this layer in fact owe the target?** If the requirement needs a model, an operation, a test, a screen, or a journey here, the exclusion is standing in for work nobody did. Delete it and build the thing. This is the failure the graph exists to prevent, and a green gate is exactly what it looks like.
3. **Was it written to clear a diagnostic?** Compare the entry with the state the workspace was in when it appeared. An exclusion whose target the compiler had just demanded, written instead of the artifact that would have satisfied it, is fake however well its sentence reads.

Then check the placement in the other direction: an `@evidenceExclude` written on a working model, DTO, controller, test, screen, or journey belongs in that claim's carrier instead. The compiler accepts it there because the host is selected, which is why review has to catch it.

For every remaining `@evidenceExclude`, read the target and reason. Correct every fake exclusion.

## Configuration

Compare every configuration the scope document names with the baseline commit. The one permitted edit is deleting a predeclared `disabled` property with the comment that marks it. A reintroduced `disabled`, a changed claim, a changed selector, a lowered severity, or any other difference is a finding to report and restore, whatever it unblocks.
