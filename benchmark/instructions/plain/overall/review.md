# Overall Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and every detailed procedure under `.agents/skills/review/` in full before reviewing.

Review the complete application and every cross-layer relationship. Perform a literal **review loop until dry**:

1. Read every requirement in full and propagate each one through the database, API, backend, frontend, and tests.
2. Read the database, API, backend, frontend, and tests in full. Compare every adjacent layer in both directions and trace every artifact backward to its requirement.
3. Trace every required user journey from requirement through persistence and API behavior to the live screen and browser proof, then trace it backward.
4. Finish the full round and collect every finding as the Review skill requires. Fix every finding and consequence, then wait for clean backend `pnpm check:watch`, backend `pnpm dev`, and frontend `pnpm dev` processes.
5. Start the next round from the first requirement. Repeat without a round limit until one full round finds no problem and makes no edit.

Review loop until dry is literal full reading and unlimited repetition, not a figure of speech. Never replace or shorten it with:

- searches, summaries, inventories, builds, tests, samples, partial layer reviews, or earlier rounds;
- splitting the scope across rounds or assigning different files, layers, requirements, journeys, or review lenses to different rounds; every round must cover the entire scope;
- a judgment that the review seems sufficient, efficient, comprehensive, repetitive, expensive, or unlikely to find more; or
- an expectation that the later Final objective will finish or repeat the review.

## Final Checklist

- [ ] Review skill gate followed exactly, with no discretionary changes to scope, round boundaries, stopping conditions, or procedure.
- [ ] Literal full reading covered every required instruction and in-scope application artifact.
- [ ] Latest correction followed by a new full round from the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Final full round dry and edit-free.
- [ ] Watcher and dev servers running and clean.

Any unchecked or uncertain item leaves the Goal Mode completion conditions unmet. Repeat the literal full-reading Overall Review round from the first requirement.
