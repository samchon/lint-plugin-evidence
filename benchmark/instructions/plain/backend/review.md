# Backend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/backend.md` in full before reviewing.

Review the entire API and backend, excluding the frontend, through a literal **review loop until dry**:

Every round reads in full one sorted manifest of `docs/analysis/`, `packages/backend/prisma/schema/`, `packages/api/src/structures/`, `packages/backend/src/`, `packages/backend/test/`, and relevant API/backend configuration.

1. Read every requirement; compare it with database, API, and backend tests.
2. Read the database; compare every model, field, and relation with operations and DTOs.
3. Build the operation manifest. Read every operation, DTO, implementation, and calling test. Require two distinct sole-primary business scenarios per operation; dependencies/follow-ups earn no credit. Compare fixed scenario gates with the committed baseline. Coverage fixes may edit only feature tests and `test/OperationScenarioRegistry.ts`; restore changes to helpers, automation, entrypoints, Swagger generation, backend scripts, or generated Swagger.
4. Complete the round, collect findings, fix every consequence, then await a clean `packages/backend` `pnpm check:watch` rebuild.
5. Any edit restarts at the first requirement. Repeat without limit until a full round finds and edits nothing.

A dry loop requires complete reading and unlimited rounds. Never substitute searches, summaries, inventories, gates, samples, or prior rounds; split files, layers, requirements, or lenses among rounds; claim further review is unnecessary; or rely on Final.

## Review Evidence Report

Report each round's manifests, findings, fixes, and final dry round, plus every operation's two primary scenarios and business assertions. Counts, searches, manifests, and gates are not proof; a report-exposed gap restarts Review.

## Final Checklist

- [ ] Review skill gate followed without changing scope, rounds, stopping condition, or procedure.
- [ ] Every required instruction was read in full.
- [ ] Every round used a new complete sorted manifest and read one file per command, in order and in full.
- [ ] Every correction or scoped change, including a gate fix, triggered a new full round from the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Every product operation has two distinct primary test scenarios with concrete business assertions; dependencies and follow-ups were not credited.
- [ ] Fixed scenario gates match the baseline; coverage edits touch only feature tests and the registry.
- [ ] Final full round dry and edit-free; the clean current backend gate left it unchanged.
- [ ] Report proves every round, operation disposition, finding, fix, and final dry round.

If any item is unchecked or uncertain, restart the full Backend Review at the first requirement.
