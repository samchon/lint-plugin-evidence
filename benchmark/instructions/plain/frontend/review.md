# Frontend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/frontend.md` in full before reviewing.

Review the entire frontend and its live behavior through a literal **review loop until dry**:

Every round must read in full one complete sorted manifest covering `docs/analysis/`, `packages/api/src/`, `packages/frontend/src/`, `packages/frontend/tests/`, and `packages/frontend/wiki/`, including frontend configuration affecting compilation, SDK use, Vite, Playwright, or runtime.

Every round must also build the operation index that Operation Coverage Propagation defines in `.agents/skills/review/frontend.md`, and reach every entry in it.

1. Read every requirement in full; compare it with the API, screens, user journeys, and browser tests.
2. Read every API operation and DTO in full; compare each with frontend behavior, data flow, errors, and tests.
3. Read every frontend source and browser test in full; compare each with its requirement, API contract, live behavior, and journey.
4. Complete the round and collect findings as the Review skill requires. Fix every finding and consequence (including every unimplemented requirement regardless of scale or redesign), then await clean backend and frontend `pnpm dev` reloads.
5. After any edit, restart at the first requirement. Repeat without limit until a full round finds nothing and edits nothing.

A dry loop requires complete reading and unlimited rounds. Never substitute:

- searches, summaries, inventories, builds, tests, samples, or prior rounds;
- dividing files, layers, requirements, or review lenses among rounds; every round covers the entire scope;
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
- [ ] Final full round dry and edit-free; the clean current backend and frontend gates left it unchanged.
- [ ] Report proves every round, finding, fix, and final dry round.

If any item is unchecked or uncertain, restart the full Frontend Review at the first requirement.
