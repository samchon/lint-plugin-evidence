# Backend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/backend.md` in full. Apply their complete backend propagation procedure in a literal **review loop until dry**.

## Acceptance Protocol

1. Start every round with `review_start_round`. The runner owns the fresh canonical manifest and its hashes.
2. Read every returned path in order only through one `review_read_file` call with that exact path. The tool returns one complete file and advances the external ledger. Shell reads, self-authored manifests, searches, excerpts, summaries, diffs, builds, tests, earlier reads, and partial passes count as zero.
3. Keep the tool-owned reading phase read-only and retain every finding until its last file. The runner invalidates a round whose scoped workspace changes.
4. Finish with `review_finish_round`: use `findings` and every concrete finding; use `clean` and an empty list when no finding exists before calibration; use `dry` and an empty list only for the fresh post-calibration round.
5. After a findings round, fix every finding and consequence. Run every generator and correction gate only through `review_run_backend_command` with `phase=correction`; each call owns its process tree until exit. Then calibrate.
6. After a findings or clean round, call `review_start_calibration`, temporarily break one material behavior, run `command=test, phase=calibration-fail`, restore the exact sealed bytes, run `command=test, phase=calibration-pass`, and start a new full round.
7. Repeat without a round limit. After a dry seal, run `command=check-watch, phase=final`, then `command=test, phase=final`. Failure or change requires correction and a new round.

Never read manifest files through shell, run backend generators or gates through native shell, overlap native commands, forge ledger state, or complete without the runner's dry seal and final gates. Report such an act for rejection. Cost, repetition, compaction, context pressure, or Final never permits a shorter round.

## Final Checklist

- [ ] Every instruction read in full and every scoped file returned in order through the runner-owned manifest and one-file read tool.
- [ ] Every requirement, schema element, operation, DTO, implementation branch, and test propagated through every branch in `backend.md`.
- [ ] Every finding and consequence fixed only after its full round; every change followed by a new full round.
- [ ] Runner tools proved fail-restore-pass against exact sealed bytes before the qualifying round.
- [ ] Runner-owned generators and gates were serial, bounded, and left no descendants.
- [ ] One final full round was dry and edit-free; unchanged runner-owned watcher and test followed.

Any unchecked or uncertain item leaves the Goal active. Repeat from the first requirement.
