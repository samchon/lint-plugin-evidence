# Overall Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and every detailed procedure under `.agents/skills/review/` in full before reviewing.

Review the entire application and every cross-layer relationship through a literal **review loop until dry**:

Every round reads in full one sorted manifest of `docs/analysis/`, database, API, backend, backend tests, frontend, browser tests, and Backend/Frontend configuration.

1. Read every requirement; propagate it through database, API, backend, frontend, and tests.
2. Read every layer and test; compare adjacent layers both ways and trace each artifact to its requirement.
3. Trace every journey from requirement through persistence/API to live browser proof, then backward. Rebuild the operation manifest and prove two distinct sole-primary business scenarios per operation. Compare fixed scenario gates with the committed baseline. Coverage fixes may edit only feature tests and `test/OperationScenarioRegistry.ts`; restore changes to helpers, automation, entrypoints, Swagger generation, backend scripts, or generated Swagger.
4. Complete the round, collect findings, fix every consequence, then await clean backend watcher/dev and frontend dev processes.
5. Any edit restarts at the first requirement. Repeat without limit until a full round finds and edits nothing.

A dry loop requires complete reading and unlimited rounds. Never substitute searches, summaries, inventories, gates, samples, partial reviews, or prior rounds; split files, layers, requirements, journeys, or lenses among rounds; claim further review is unnecessary; or rely on Final.

## Review Evidence Report

Report each round's manifests, findings, fixes, and final dry round, plus every operation's two primary scenarios and assertions. Counts, searches, manifests, earlier rounds, and gates are not proof; a report-exposed gap restarts Review.

## Final Checklist

- [ ] Review skill gate followed without changing scope, rounds, stopping condition, or procedure.
- [ ] Every required instruction was read in full.
- [ ] Every round used a new complete sorted manifest and read one file per command, in order and in full.
- [ ] Every correction or scoped change, including a gate fix, triggered a new full round from the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Every product operation has two distinct primary backend-test scenarios with concrete business assertions; dependencies and follow-ups were not credited.
- [ ] Fixed scenario gates match the baseline; coverage edits touch only feature tests and the registry.
- [ ] Final full round dry and edit-free; the clean current watcher and development gates left it unchanged.
- [ ] Report proves every round, operation disposition, finding, fix, and final dry round.

If any item is unchecked or uncertain, restart the full Overall Review at the first requirement.
