# Plain Review Verdicts

Only the Plain arm stops for a verdict. It stops after every Backend, Frontend, and Overall Review, and again after each supplementation Goal, with retained status `awaiting-review-verdict`, and it cannot continue until a verdict is applied.

The runner produces that verdict itself. At the boundary it spawns a fresh Codex thread on the cell's own model and effort, which reads the attempt's stage log and the measured workspace and returns a decision. The cell then continues in the same command. An operator writes a verdict by hand only when that inspection could not produce one.

## Inspection Is Part Of What The Arm Costs

The inspecting thread's tokens and elapsed time are added to the cell's `Cost` and `Work time`. Judging is work the arm requires, and a comparison that hid it would credit whichever arm needs the most judging.

They stay separable. Every attempt is retained on `supervisionPauses[].inspections` — the one that decided and each that failed before it, since tokens spent on a failed attempt are still spent — and the report adds them into the totals as `inspection`, rather than folding them into the measured thread's own counters, so a reader can always ask how much of a total was building and how much was judging. `apiCost` deliberately excludes them: that number is the measured thread's per-request price, reconciled request by request against its own counters, and an inspecting thread reports one aggregate for its whole turn.

The inspection runs only after the cell's app-server has exited. A process record counts wall time from spawn to exit, so an inspection performed while that process was still alive would already be inside the cell's total, and adding it again would count it twice.

## Keep The Inspector Outside The Cell

The measured agent must not learn that it is being judged or by what criteria. A cell that knows the criteria can satisfy the criteria instead of meeting them, and every later attempt of every later cell would then measure something else.

- **A separate thread.** The inspection never runs inside the measured thread and never speaks to it.
- **Read-only.** It reads the stage log for the attempt under review — which lives in the run root, outside the workspace the cell may touch — and the workspace. It writes nothing into the workspace.
- **No text reaches the cell.** A decision carries `decision` and `rationale` only, and the runner refuses one that carries anything else. A failing scope receives the identical prescribed reminder every other failing scope receives, so attempt counts stay comparable between cells.

## Judge Two Questions

**Did the prescribed review loop run to dryness?** The scope's own Review instruction requires rounds that continue until one round produces no finding and no edit. Pass an attempt that read its full scope every round and ended on a round that read everything and changed nothing, despite checklist or formatting slips. Fail one that substituted counts, summaries, searches, or green commands for reading; divided its scope across rounds; skipped the re-read after its last edit; or reported a dry round the stage log shows it never performed.

**Are the tests properly written?** Judge them against the workspace's own testing instructions. A suite that names one test for a hundred published operations, that asserts nothing, that asserts only that a call did not throw, or that pins the implementation's current output instead of the behavior it owes, is not properly written however green it runs.

Nothing else is a verdict's business. Design taste, formatting, checklist bookkeeping, and commit hygiene are observations for the rationale, never grounds.

The second question **reverses a decision this document previously recorded**. It used to say that what the cell built was an observation and never grounds, on the reasoning that judging the tests would mean reviewing on the cell's behalf and that the instructions and template skills should prevent a hollow suite instead. They did not prevent it, and a review loop that runs to dryness over a suite asserting nothing is a loop that terminated without doing the work its instruction exists to cause — so the loop criterion alone was passing attempts that had not reviewed anything. The inspecting thread also removes the original objection: it reaches the finding on its own rather than borrowing an operator's, and the cell never receives it.

Final is a finishing and safety stage after a passed Review, not permission to accept a false Review pass. It may correct a small residual defect it independently notices, but the decision is about the Review boundary itself.

## What Each Decision Does

- **Pass** skips the reminder and advances directly to that scope's Final.
- **Fail** inserts that scope's `plain/<scope>/remind.md` — which quotes the scope's own Review instruction in full and carries nothing cell-specific — then stops for another decision after the supplementation Goal.

Eight supplementation attempts are permitted. A failure after the last one retains `quality-failed`, does not dispatch Final, and cannot be resumed. The attempt a scope stops on is itself a measurement, and a subject with a hundred published operations has further to travel than one with two dozen, so the bound is set where a cell that can converge still has room to.

The runner retains the exact decision bytes and their digest, the workspace digest, the Goal index, the terminal turn, the decision, the attempt, the transition, and the resume history. It refuses a decision whose earlier retained verdict files no longer match their digests. Every inspection attempt also retains its own prompt, response schema, event stream, standard error, and final message under `inspection/<NN>-<stage>-<attempt>.*`, so a retry cannot overwrite the evidence of the attempt that failed before it.

## When The Inspection Cannot Decide

A spawn failure, a failed turn, an unreadable decision, an unaccountable token report, or the inspection timeout leaves the pause undecided and records the reason on that attempt's `failure`.

**Resuming the run retries the inspection.** The common failures are transient and an operator adds nothing to them, so a resume attempts the judgement again rather than requiring a hand-written verdict. Three attempts are permitted at one boundary, because each is a full model run on the cell's own model and a permanently broken inspector must stop rather than spend the account one resume at a time.

A failure message names what did not match: which event types the stream carried when `turn.completed` never arrived, which token counter was missing and which keys the report did carry, or what the final message said where a decision belonged — each with the raw text, excerpted. The complete stream stays beside it on disk. The event and field names the runner expects were read off the Codex binary rather than observed against a live run, so the first real inspection is also the test of them, and a rename must be diagnosable from the retained record instead of from a second run.

After the third failure the run stays at `awaiting-review-verdict` and a resume refuses outright, because only an operator can move the boundary from there. That is the boundary an operator has always been able to decide by hand:

```json
{
  "decision": "fail",
  "rationale": "The retained review omitted material source paths and did not repeat its full inspection after editing them."
}
```

```bash
pnpm --filter @samchon/evidence-benchmark supervise <subject> <run-id> <verdict.json>
```

Then resume the same run command. A hand-written verdict answers the same two questions and obeys the same rules: no `feedback` property, and the reasoning stays in the retained `rationale`, which the cell never sees.

An operator warning is a different channel with its own command and its own contents, and SKILL.md's supervision section owns it. Do not reach for a verdict to deliver one.
