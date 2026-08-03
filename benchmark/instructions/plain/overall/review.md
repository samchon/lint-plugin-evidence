# Overall Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and every detailed procedure under `.agents/skills/review/` in full before reviewing.

Review the entire application and every cross-layer relationship through a literal **review loop until dry**:

Every round must read in full one complete sorted manifest covering `docs/analysis/`, `packages/backend/prisma/schema/`, `packages/api/src/`, `packages/backend/src/controllers/`, `packages/backend/test/`, `packages/frontend/src/`, and `packages/frontend/tests/`, including configuration covered by Backend or Frontend Review.

Every round must also build the operation index that Operation Coverage Propagation defines in `.agents/skills/review/backend.md` and `.agents/skills/review/frontend.md`, and reach every entry in it from both directions.

1. Read every requirement in full; propagate each through the database, API, backend, frontend, and tests.
2. Read the database, API, backend, frontend, and tests in full. Compare adjacent layers both ways and trace every artifact back to its requirement.
3. Trace every required journey from requirement through persistence and API to live screen and browser proof, then backward.
4. Complete the round and collect findings as the Review skill requires. Fix every finding and consequence (including every unimplemented requirement regardless of scale or redesign), then await clean backend `pnpm check:watch`, backend `pnpm dev`, and frontend `pnpm dev` processes.
5. After any edit, restart at the first requirement. Repeat without limit until a full round finds nothing and edits nothing.

A dry loop requires complete reading and unlimited rounds. Never substitute:

- searches, summaries, inventories, builds, tests, samples, partial layer reviews, or prior rounds;
- dividing files, layers, requirements, journeys, or review lenses among rounds; every round covers the entire scope;
- claims that the review is sufficient, comprehensive, efficient, repetitive, expensive, or unlikely to help; or
- relying on Final to finish or repeat the review.

## Review Evidence Report

Before completion, report each round's full manifest, findings and fixes, and the final dry, edit-free round. If that evidence reveals missing work, resume the loop and report again after completing it.

## Final Checklist

- [ ] Review skill gate followed without changing scope, rounds, stopping condition, or procedure.
- [ ] Every required instruction was read in full.
- [ ] Every round used a new complete sorted manifest and read one file per command, in order and in full.
- [ ] Every correction or scoped change, including a gate fix, triggered a new full round from the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Final full round dry and edit-free; the clean current watcher and development gates left it unchanged.
- [ ] Report proves every round, finding, fix, and final dry round.

If any item is unchecked or uncertain, restart the full Overall Review at the first requirement.
