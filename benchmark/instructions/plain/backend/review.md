# Backend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/backend.md` in full before reviewing.

Review the complete API and backend, not the frontend. Perform a literal **review loop until dry**:

1. Read every requirement in full and compare each one with the database, API, and backend tests.
2. Read the complete database design and compare every model, field, and relation with the API operations and DTOs.
3. Read every API operation, DTO, backend implementation, and backend test in full. Compare the API with its implementation and tests, and trace every implementation and test backward to its requirement.
4. Finish the full round and collect every finding as the Review skill requires. Fix every finding and consequence, then wait for a clean `pnpm check:watch` rebuild from `packages/backend`.
5. Start the next round from the first requirement. Repeat without a round limit until one full round finds no problem and makes no edit.

Review loop until dry is literal full reading and unlimited repetition, not a figure of speech. Never replace or shorten it with:

- searches, summaries, inventories, builds, tests, samples, or earlier rounds;
- splitting the scope across rounds or assigning different files, layers, requirements, or review lenses to different rounds; every round must cover the entire scope;
- a judgment that the review seems sufficient, efficient, comprehensive, repetitive, expensive, or unlikely to find more; or
- an expectation that the later Final objective will finish or repeat the review.

## Final Checklist

- [ ] Review skill gate complete without split, shortened, or substituted rounds.
- [ ] Required instructions and full backend scope read.
- [ ] Latest correction followed by a new full round from the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Final full round dry and edit-free.
- [ ] Backend watcher rebuilt cleanly.

Any unchecked or uncertain item restarts the full Backend Review from the first requirement.
