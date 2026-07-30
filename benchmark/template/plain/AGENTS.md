# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Campaign

**Mandatory.** How completeness is established here: the obligation graph every artifact owes, the campaign that discharges each edge, and how a finding anywhere re-opens the work downstream of it, `.agents/skills/campaign/SKILL.md`.

Nothing in this repository reports a missing requirement. The compiler checks the code that exists and cannot check the code that should exist, so completeness is established by walking every obligation yourself in indivisible rounds until one complete current-state round finds zero actionable improvement.

Read it **before starting any work at all**, again **whenever any artifact changes**, and again **whenever you believe the work is finished**. Every other skill teaches how to build one thing well; this one is the only thing that tells you whether the specification is actually realized.

### Review

**Mandatory.** The questions a completeness pass does not ask: whether each claimed realization is true, whether each authored upstream artifact agrees with the immutable requirement, and which claims prove anything at all, `.agents/skills/review/SKILL.md`.

It runs **inside** every campaign round rather than after it, because presence here is established by reading and a reader who is not asking whether the thing is true is not really reading it.

## Language

Repository artifacts are English: source, tests, documents, and commit messages.
