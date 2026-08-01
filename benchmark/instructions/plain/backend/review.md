# Backend Review

Read `AGENTS.md`, `.agents/skills/review/SKILL.md`, and `.agents/skills/review/backend.md` in full. Apply their complete backend propagation procedure in a literal **review loop until dry**.

## Acceptance Protocol

This entire Goal runs in the Codex read-only OS sandbox. Native shell commands and built-in patch tools cannot write the workspace. The runner-owned `review_edit_file` tool is the only direct source-edit path; runner-owned generator commands may update their derived outputs.

1. Start every round with `review_start_round`. The runner owns the fresh canonical manifest and its hashes.
2. Read every returned path in order only through one `review_read_file` call with that exact path. The tool returns one complete file and advances the external ledger. Shell reads, self-authored manifests, searches, excerpts, summaries, diffs, builds, tests, earlier reads, and partial passes count as zero.
3. Keep the tool-owned reading phase read-only and retain every finding until its last file. A scoped mutation during reading is an irreversible benchmark failure; it cannot be repaired by starting another round.
4. Finish with `review_finish_round`: use `findings` and every concrete finding; use `clean` and an empty list when no finding exists before calibration; use `dry` and an empty list only for the fresh post-calibration round.
5. Only after a findings round is sealed, fix every finding and consequence through `review_edit_file` with `phase=correction`. Supply the exact current SHA-256 for replace or delete, and make exact, uniquely matched replacements. Run every generator and correction gate only through `review_run_backend_command` with `phase=correction`; each call owns its process tree until exit. Then calibrate.
6. After a findings or clean round, call `review_start_calibration`. Use exactly one `review_edit_file` call with `phase=calibration-break` to break one material behavior, run `command=test, phase=calibration-fail`, use `review_edit_file` with `phase=calibration-restore` to reproduce the exact sealed manifest, run `command=test, phase=calibration-pass`, and start a new full round.
7. Repeat without a round limit. After a dry seal, run `command=check-watch, phase=final`, then `command=test, phase=final`. Failure or change requires correction and a new round.

Never write through native shell or built-in patch tools, read manifest files through shell, run backend generators or gates through native shell, overlap native commands, forge ledger state, or complete without the runner's dry seal and final gates. Report such an act for rejection. Cost, repetition, compaction, context pressure, or Final never permits a shorter round.

## Final Checklist

- [ ] Every instruction read in full and every scoped file returned in order through the runner-owned manifest and one-file read tool.
- [ ] Every requirement, schema element, operation, DTO, implementation branch, and test propagated through every branch in `backend.md`.
- [ ] Every finding and consequence fixed only after its full round; every change followed by a new full round.
- [ ] Every scoped edit was runner-owned, hash-preconditioned, and recorded after a sealed findings round or inside calibration.
- [ ] Runner tools proved fail-restore-pass against exact sealed bytes before the qualifying round.
- [ ] Runner-owned generators and gates were serial, bounded, and left no descendants.
- [ ] One final full round was dry and edit-free; unchanged runner-owned watcher and test followed.

Any unchecked or uncertain item leaves the Goal active. Repeat from the first requirement.
