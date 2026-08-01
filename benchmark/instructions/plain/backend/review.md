# Backend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/backend.md` in full before reviewing.

## Acceptance Protocol

This protocol is the measurement boundary. Follow it literally before relying on any earlier review work.

1. Before every round, return one new manifest in this canonical section order, sorting paths within each section: `docs/analysis/`; `packages/backend/prisma/schema/`; contract and generated SDK files under `packages/api/src/` plus `packages/api/swagger.json`; `packages/backend/src/` excluding generated Prisma clients; `packages/backend/test/`; then affecting API and backend configuration files. Do not reuse or repartition a manifest.
2. Read the manifest from its first path through its last path. One command or tool call must return content from exactly one manifest file. Never combine manifest paths with semicolons, pipelines, loops, arrays, scripts, or multi-file tool calls. Consecutive ranges are allowed only for one large file and must cover it without a gap.
3. Keep the reading phase read-only and retain findings until the final manifest file is covered. Any scoped change invalidates the round.
4. After a complete round with findings, fix every finding and consequence. Run each required generator and gate in a separate bounded command, wait for it and its descendants to stop, and do not overlap generators, watchers, compilers, or tests.
5. Before a round may qualify as dry, calibrate one material reviewed behavior: temporarily break it, prove its relevant test fails, restore the exact bytes, and prove the test passes. The temporary change invalidates prior reading, so begin a new full round afterward.
6. Start a new manifest and full round after every correction, generated-file change, gate-driven change, or calibration. Repeat without a round limit.
7. A round qualifies only when it reaches the final manifest file, finds no problem, and makes no scoped edit. Then run a bounded clean `pnpm check:watch` from `packages/backend`, stop it completely, and run `pnpm test` separately. A failure or change requires correction and another new full round.

Reading two manifest files in one command is an irreversible protocol violation for this run. Do not restart and self-credit it, do not mark the Goal complete, and report the exact command so the external supervisor can reject the run.

Review the complete API and backend, not the frontend. Perform a literal **review loop until dry**:

In every round, read every product-scope file in the complete canonical manifest above.

1. Read every requirement in full and compare each one with the database, API, and backend tests.
2. Read the complete database design and compare every model, field, and relation with the API operations and DTOs.
3. Read every API operation, DTO, backend implementation, and backend test in full. Compare the API with its implementation and tests, and trace every implementation and test backward to its requirement.
4. Finish the full round and collect every finding as the Review skill requires. Fix every finding and consequence, then complete the separate generator, calibration, watcher, and test gates in the Acceptance Protocol.
5. Start the next round from the first requirement. Repeat without a round limit until one full round finds no problem and makes no edit.

Review loop until dry is literal full reading and unlimited repetition, not a figure of speech. Never replace or shorten it with:

- searches, summaries, inventories, builds, tests, samples, or earlier rounds;
- splitting the scope across rounds or assigning different files, layers, requirements, or review lenses to different rounds; every round must cover the entire scope;
- a judgment that the review seems sufficient, efficient, comprehensive, repetitive, expensive, or unlikely to find more; or
- an expectation that the later Final objective will finish or repeat the review.

## Final Checklist

- [ ] Review skill gate followed exactly, with no discretionary changes to scope, round boundaries, stopping conditions, or procedure.
- [ ] Every required instruction was read in full.
- [ ] Every round began with one new complete canonical manifest; each command read exactly one manifest file, and every file was fully covered in order.
- [ ] Every correction or later scoped change, including a gate fix, triggered a new full round from the first requirement.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] One material behavior passed fail-restore-pass mutation calibration before the qualifying round.
- [ ] Generators, watchers, compilers, and tests ran as separate bounded processes without overlap or leaked descendants.
- [ ] Final full round dry and edit-free; the clean current backend gate left it unchanged.

Any unchecked or uncertain item leaves the Goal Mode completion conditions unmet. Repeat the literal full-reading Backend Review round from the first requirement.
