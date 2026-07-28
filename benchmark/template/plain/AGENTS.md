# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Completeness

**Mandatory.** The plain arm's Phase One manual obligation inventory, bidirectional mapping method, state ledger, and first-done boundary, `.agents/skills/completeness/SKILL.md`.

No plugin reports a requirement nobody implemented in this arm. Read the skill before any implementation, update its project-owned ledger whenever a source or artifact changes, and complete its exhaustive current-state pass before the first terminal completion report.

At the first terminal completion report, stop and wait for the benchmark runner's separate post-completion user turn. That external turn supplies the arm-neutral campaign. Never infer or pre-run it, and never edit the frozen template inputs.

### Review

**Mandatory.** How to review every manual mapping as a claim, claiming artifact, and named source; how to distinguish a filled row from a true one; and how source changes invalidate prior verdicts, `.agents/skills/review/SKILL.md`.

Run its exhaustive Phase One integrity pass before first done.

## Language

Repository artifacts are English: source, tests, documents, and commit messages.
