# Backend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/backend.md` in full. Apply their complete backend propagation procedure in a literal **review loop until dry**.

## Acceptance Protocol

1. Start every round with `review_start_round`. The runner, not you, owns the fresh canonical manifest and its hashes.
2. Read every returned path in order only through one `review_read_file` call with that exact path. The tool returns one complete file and advances the external ledger. Shell reads, self-authored manifests, searches, excerpts, summaries, diffs, builds, tests, earlier reads, and partial passes count as zero.
3. Keep the tool-owned reading phase read-only and retain every finding until its last file. The runner invalidates a round whose scoped workspace changes.
4. Finish the round with `review_finish_round`, reporting `findings` and every concrete finding, or `dry` and an empty list. Never claim a round outside this tool.
5. After a findings round, fix every finding and consequence. Run each generator and gate as a separate bounded command, waiting for it and descendants to stop before the next one. Then call `review_start_round` again.
6. Before reporting `dry`, temporarily break one material reviewed behavior, prove its relevant test fails, restore the exact bytes, prove it passes, and start a new full tool-owned round.
7. Repeat without a round limit. After the runner seals a dry round, run a bounded clean `pnpm check:watch` from `packages/backend`, stop it completely, and run `pnpm test` separately. Any failure or scoped change requires correction and a new round.

Never read manifest files through shell or another tool during a tool-owned round, combine their paths, hide output, forge ledger state, or complete the Goal without the runner's dry seal. Report such an act for external rejection. Cost, repetition, compaction, context pressure, or Final never permits a shorter round.

## Final Checklist

- [ ] Every instruction read in full and every scoped file returned in order through the runner-owned manifest and one-file read tool.
- [ ] Every requirement, schema element, operation, DTO, implementation branch, and test propagated through every branch in `backend.md`.
- [ ] Every finding and consequence fixed only after its full round; every change followed by a new full round.
- [ ] Material behavior passed fail-restore-pass calibration before the qualifying round.
- [ ] Generators and gates were separate, bounded, non-overlapping, and left no descendants.
- [ ] One final full round was dry and edit-free; unchanged clean watcher and test gates followed.

Any unchecked or uncertain item leaves the Goal active. Repeat from the first requirement.
