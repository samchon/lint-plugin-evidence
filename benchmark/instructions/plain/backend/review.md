# Backend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/backend.md` in full. Apply their complete backend propagation procedure in a literal **review loop until dry**.

## Acceptance Protocol

1. Before every round, return a new manifest in this section order, sorting paths inside each section: `docs/analysis/`; `packages/backend/prisma/schema/`; API source and generated SDK under `packages/api/src/` plus `packages/api/swagger.json`; `packages/backend/src/` excluding generated Prisma clients; `packages/backend/test/`; affecting API and backend configuration. Never reuse or split a manifest.
2. Read from the first manifest path through the last. One command or tool call must return exactly one manifest file. Never combine paths with semicolons, pipelines, loops, arrays, scripts, or multi-file calls. Large-file ranges must cover one file from first through last line without gaps.
3. Keep the reading phase read-only and retain every finding until the last file. A scoped change invalidates the round.
4. After a complete round with findings, fix every finding and consequence. Run each generator and gate as a separate bounded command; wait for it and its descendants to stop before the next one.
5. Before a round can qualify as dry, temporarily break one material reviewed behavior, prove its relevant test fails, restore the exact bytes, and prove it passes. Then start a new full round.
6. Start a new manifest and full round after every correction, generated-file change, gate change, or calibration. Repeat without a round limit.
7. A round qualifies only after every backend propagation root and manifest file is covered with zero findings and zero scoped edits. Then run a bounded clean `pnpm check:watch` from `packages/backend`, stop it completely, and run `pnpm test` separately. Any failure or change requires correction and another full round.

Reading two manifest files in one command irreversibly fails this run. Keep the Goal active and report the exact command for external rejection; do not restart and self-credit it.

Searches, excerpts, summaries, diffs, builds, tests, earlier reads, and partial passes count as zero. Cost, repetition, context pressure, or Final never permits a shorter round.

## Final Checklist

- [ ] Every instruction and scoped file read in full through one canonical manifest per round and exactly one file per command.
- [ ] Every requirement, schema element, operation, DTO, implementation branch, and test propagated through every branch in `backend.md`.
- [ ] Every finding and consequence fixed only after its full round; every change followed by a new full round.
- [ ] Material behavior passed fail-restore-pass calibration before the qualifying round.
- [ ] Generators and gates were separate, bounded, non-overlapping, and left no descendants.
- [ ] One final full round was dry and edit-free; unchanged clean watcher and test gates followed.

Any unchecked or uncertain item leaves the Goal active. Repeat from the first requirement.
