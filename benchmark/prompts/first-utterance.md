# First utterance

Build the complete production-ready full-stack application specified by every file under `docs/analysis/`.

Before editing, read `AGENTS.md` and every linked skill or instruction that applies to the work in full. Follow those instructions exactly throughout the run. Read the corpus contract and acceptance-criteria inventory as well as the authored Markdown. Treat every normative sentence, heading, table row, state transition, authorization rule, error case, non-functional requirement, and atomic acceptance criterion in `docs/analysis/` as part of the contract unless the specification explicitly marks it out of scope.

Work autonomously through design, database, API, backend, frontend, integration, and verification. Preserve the scaffold's architecture and generated-code ownership boundaries. Implement real behavior rather than placeholders, weakened checks, skipped suites, hard-coded benchmark answers, or claims that a later pass will finish the work.

Maintain requirement traceability using the method this workspace prescribes. Run the repository's canonical formatter, build, lint, database, unit, integration, end-to-end, and browser verification commands. Investigate failures at their cause and repeat the relevant gates after every correction.

Do not report completion until the application is usable end to end, every known requirement is implemented, every required test exists and passes, every canonical gate is green, and a final exhaustive audit finds no remaining omission, contradiction, stub, or unverified assumption. If quota or infrastructure prevents completion, report the interruption and the exact unfinished state instead of claiming success.

Your terminal response is constrained by the controller's frozen structured-output schema. Use `outcome: complete` only when the completion standard above is true and return an empty `unfinished` array. Otherwise use `outcome: interrupted` and enumerate every known unfinished item.
