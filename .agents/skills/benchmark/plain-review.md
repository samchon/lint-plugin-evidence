# Plain Review

Only the Plain arm stops for a verdict.

It stops after every Backend, Frontend, and Overall Review, and again after each supplementation Goal. The retained status is `awaiting-review-verdict`, and the cell cannot continue until a verdict is applied.

## The Runner-Owned Backend Review Ledger

`--review-ledger` makes the backend review loop a runner-owned mechanism instead of a self-reported one.

It is Plain-only and requires a detached `backend-start` checkpoint thread, so it attaches to an existing run ID or a `--from-backend-start` derivation, never to a fresh cell:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <subject> plain <model> <effort> --review-ledger --from-backend-start <source-run-id>
```

During `backend-review` the runner runs the cell's sandbox read-only and injects six tools as the only mechanisms that receive review credit:

`review_start_round` · `review_read_file` · `review_finish_round` · `review_start_calibration` · `review_edit_file` · `review_run_backend_command`

The runner builds the canonical manifest, hands back exactly the next file, and records every round, edit, command, and calibration.

The objective cannot complete on a claim. `backend-review` and `backend-final` fail unless a runner-owned round ended `dry` and the workspace manifest still hashes to what that round read. A shell inventory, a self-authored manifest, or a summary earns nothing.

A ledger run needs a fresh native thread, so a derived one starts a thread rather than forking the retained turn, and its thread token total restarts at zero. Report it as a distinct measurement, never as a continuation of the source cell's totals.

## Who Produces The Verdict

The runner produces it. At the boundary it spawns a fresh Codex thread on the cell's own model and effort, which reads the attempt's stage log and the measured workspace and returns a decision. The cell then continues in the same command.

An operator writes a verdict by hand only when that inspection could not produce one.

The inspecting thread's tokens and elapsed time join the cell's `Cost` and `Work time`, because judging is work the arm requires and a comparison that hid it would credit whichever arm needs the most judging.

Every attempt stays separable on `supervisionPauses[].inspections`, and each retains its own prompt, schema, event stream, standard error, and final message under `inspection/<NN>-<stage>-<attempt>.*`.

## Keep The Inspector Outside The Cell

The measured agent must not learn that it is being judged or by what criteria. A cell that knows the criteria can satisfy the criteria instead of meeting them, and every later attempt of every later cell would then measure something else.

- **A separate thread.** The inspection never runs inside the measured thread and never speaks to it.
- **Read-only.** It reads the attempt's stage log, which lives in the run root outside the workspace, and the workspace. It writes nothing into either.
- **No text reaches the cell.** A decision carries `decision` and `rationale` only, and the runner refuses one that carries anything else. Every failing scope receives the identical prescribed reminder, so attempt counts stay comparable between cells.

## What A Verdict Judges

Two questions, whose exact wording the inspection prompt in `EvidenceBenchmarkInspection.ts` owns:

1. **Did the prescribed review loop run to dryness?** Pass an attempt that read its full scope every round and ended on a round that read everything and changed nothing, despite checklist or formatting slips. Fail one that substituted counts, summaries, searches, or green commands for reading; divided its scope across rounds; skipped the re-read after its last edit; or reported a dry round the stage log shows it never performed.
2. **Are the tests properly written?** Judge them against the workspace's own testing instructions. A suite that names one test for a hundred published operations, that asserts nothing, that asserts only that a call did not throw, or that pins the implementation's current output instead of the behavior it owes, is not properly written however green it runs.

Nothing else is a verdict's business. Design taste, formatting, checklist bookkeeping, and commit hygiene are observations for the rationale, never grounds.

Final is a finishing and safety stage after a passed Review, not permission to accept a false Review pass.

## What Each Decision Does

- **Pass** skips the reminder and advances directly to that scope's Final.
- **Fail** inserts that scope's `plain/<scope>/remind.md`, which quotes the scope's own Review instruction in full and carries nothing cell-specific, then stops for another decision after the supplementation Goal.

Eight supplementation attempts are permitted. A failure after the last one retains `quality-failed`, does not dispatch Final, and cannot be resumed.

The attempt a scope stops on is itself a measurement, and a subject with a hundred published operations has further to travel than one with two dozen.

The runner retains the exact decision bytes and their digest, the workspace digest, the Goal index, the terminal turn, the decision, the attempt, the transition, and the resume history. It refuses a decision whose earlier retained verdict files no longer match their digests.

## When The Inspection Cannot Decide

A spawn failure, a failed turn, an unreadable decision, an unaccountable token report, or the inspection timeout leaves the pause undecided. The reason lands on that attempt's `failure`, naming what did not match with the raw text excerpted.

**Resuming the run retries the inspection.** The common failures are transient and an operator adds nothing to them.

Three attempts are permitted at one boundary, because each is a full model run on the cell's own model and a permanently broken inspector must stop rather than spend the account one resume at a time.

After the third failure the run stays at `awaiting-review-verdict` and a resume refuses outright. Only an operator can move the boundary from there, so write the verdict by hand:

```json
{
  "decision": "fail",
  "rationale": "The retained review omitted material source paths and did not repeat its full inspection after editing them."
}
```

```bash
pnpm --filter @samchon/evidence-benchmark supervise <subject> <run-id> <verdict.json>
```

Then resume the same run command.

A hand-written verdict answers the same two questions and obeys the same rules: no `feedback` property, and the reasoning stays in the retained `rationale`, which the cell never sees.

An operator warning is a different channel with its own command and contents, and [intervention/warning.md](intervention/warning.md) owns it. Do not reach for a verdict to deliver one.
