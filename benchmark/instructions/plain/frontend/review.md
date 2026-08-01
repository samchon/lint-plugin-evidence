# Frontend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/frontend.md` in full before reviewing.

Review the complete frontend and its live behavior. Perform a literal **review loop until dry**:

1. Read every requirement in full and compare each one with the API, screens, user journeys, and browser tests.
2. Read every API operation and DTO in full and compare each one with frontend behavior, data flow, errors, and tests.
3. Read every frontend source file and browser test in full. Compare each artifact with its requirement, API contract, live behavior, and journey.
4. Finish the full round and collect every finding as the Review skill requires. Fix every finding and consequence, then wait for clean backend and frontend `pnpm dev` reloads.
5. Start the next round from the first requirement. Repeat without a round limit until one full round finds no problem and makes no edit.

Review loop until dry is literal full reading and unlimited repetition, not a figure of speech. Never replace or shorten it with:

- searches, summaries, inventories, builds, tests, samples, or earlier rounds;
- splitting the scope across rounds or assigning different files, layers, requirements, or review lenses to different rounds; every round must cover the entire scope;
- a judgment that the review seems sufficient, efficient, comprehensive, repetitive, expensive, or unlikely to find more; or
- an expectation that the later Final objective will finish or repeat the review.

## Final Checklist

- [ ] Review skill gate followed exactly, with no discretionary changes to scope, round boundaries, stopping conditions, or procedure.
- [ ] Every required instruction was read in full.
- [ ] Every round began with one new complete sorted manifest; each command read only one in-scope frontend file, and every file was fully covered in order.
- [ ] Every correction or later scoped change, including a gate fix, triggered a new full round from the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Final full round dry and edit-free; the clean current backend and frontend gates left it unchanged.

Any unchecked or uncertain item leaves the Goal Mode completion conditions unmet. Repeat the literal full-reading Frontend Review round from the first requirement.
