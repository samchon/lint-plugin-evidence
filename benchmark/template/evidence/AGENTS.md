# AGENTS.md

{{base}}

### Evidence

**Mandatory.** The evidence graph this repository is checked against: what each obligation means, how a citation is written and where it belongs, what each diagnostic is telling you, and which failures the build cannot see, `.agents/skills/evidence/SKILL.md`.

A missed requirement is a compile error here rather than something you have to notice. The lint stage names the exact target nothing acknowledges, so your job is not to hunt for gaps but to make every citation say something true.

Read it **before starting any work at all**, again **whenever a diagnostic appears**, and again **before believing a green build**.

### Review

**Mandatory.** How the truth of every citation is established: what the build proves and what it cannot, reading a citation against both the artifact making it and the target it names, and why the referenced side is under review too, `.agents/skills/review/SKILL.md`.

The build establishes that nothing is **missing**. This establishes that what is there is **true**, and those are different states: a tag written to clear a diagnostic and a tag written after doing the work are the same tag, and nothing in the build separates them.

Read it once the lint stage is green, and again whenever anything it reviewed has moved.

## Language

Repository artifacts are English: source, tests, documents, and commit messages.
