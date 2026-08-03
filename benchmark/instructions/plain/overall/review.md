# Overall Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and every detailed procedure under `.agents/skills/review/` in full before reviewing.

Review the entire application and every cross-layer relationship through a literal **review loop until dry**:

Every round reads in full one sorted manifest of `docs/analysis/`, database, API, backend, backend tests, frontend, browser tests, and Backend/Frontend configuration.

1. Read every requirement; propagate it through database, API, backend, frontend, and tests.
2. Read every layer and test; compare adjacent layers both ways and trace each artifact to its requirement.
3. Trace every journey from requirement through persistence/API to live browser proof, then backward. Rebuild the operation manifest: one primary operation per exported test; two distinct scenarios with public business-effect assertions per operation. SDK dependencies/follow-ups earn no primary credit. Forbid automatic malformed-400 tests and invented codes. Compare scenario gates to the committed baseline. Coverage fixes may touch only feature tests and `test/OperationScenarioRegistry.ts`; restore helper, automation, entrypoint, Swagger, script, or generated-Swagger changes.
4. Complete the round, collect findings, fix every consequence, then await clean backend watcher/dev and frontend dev processes.
5. Any edit restarts at the first requirement. Repeat without limit until a full round finds and edits nothing.

A dry loop requires complete reading and unlimited rounds. Never substitute searches, summaries, inventories, gates, samples, partial reviews, or prior rounds; split files, layers, requirements, journeys, or lenses among rounds; claim further review is unnecessary; or rely on Final.

## Review Evidence Report

Report every round's manifest/findings/fixes and final dry round, plus each operation's two primary scenarios and assertions. Counts, searches, manifests, earlier rounds, and gates are not proof; an exposed gap restarts Review.

## Final Checklist

- [ ] Review skill scope, rounds, stopping condition, and procedure followed unchanged.
- [ ] Every instruction read in full.
- [ ] Each round used a new sorted full manifest and read one whole file per command in order.
- [ ] Every scoped edit, including gate fixes, restarted a full round at the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Every operation has two distinct primary backend-test scenarios with business assertions; dependencies/follow-ups got no credit.
- [ ] Fixed scenario gates match the baseline; coverage edits touch only feature tests and the registry.
- [ ] Final full round dry/edit-free and unchanged by clean watcher/development gates.
- [ ] Report proves all rounds, operation dispositions, findings, fixes, and the dry round.

If any item is unchecked or uncertain, restart the full Overall Review at the first requirement.
