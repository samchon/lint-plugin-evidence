# Plain Review Verdicts

Only the Plain arm pauses for a verdict. It stops after every Backend, Frontend, and Overall Review, and again after each supplementation Goal, with retained status `awaiting-review-verdict`, and it cannot continue until a verdict is applied.

## Judge One Question

Judge whether the cell performed the review loop its instruction prescribes and stopped only where that instruction allows it to stop. Nothing else is the verdict's business. Inspect the completed Goal's retained output and actions against the actual workspace.

- **Pass** a review that read its full scope every round and ended on a round that read everything and changed nothing, despite checklist or formatting slips.
- **Fail** one that substituted counts, summaries, searches, or green commands for reading; divided its scope across rounds; skipped the re-read after its last edit; or reported a dry round it did not perform.

A product defect matters here only as evidence that the loop did not run: an obligation the review reported as met while the workspace shows otherwise. Record that evidence in the rationale.

What the cell built is otherwise not the verdict's business. A suite that names one test for a hundred operations, or asserts nothing, violates the instructions and the Backend skill, and the arms are measured partly by how often that survives their own review — so it is an observation to record, never a reason to fail. Judging it would also mean reviewing on the cell's behalf. Prevent it in the instructions and the template skills where that is possible, and record it as a result where it is not.

Final is a finishing and safety stage after a passed Review, not permission to accept a false Review pass. It may correct a small residual defect it independently notices, but the verdict must be based on the Review boundary itself.

## Write And Apply One Verdict

Write strict JSON outside the measured workspace:

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

**A verdict decides; it injects no text.** It carries `decision` and `rationale` only, and the runner refuses one that carries anything else — a `feedback` property is rejected outright. Naming a defect the operator had to read code to find would hand the cell the product of the work being measured: a review that then corrects what it was told about has shown it can act on a finding, not that it can reach one. It would also make one cell's reminder differ from another's, so their attempt counts would stop comparing. The reasoning stays in the retained `rationale`, which the cell never sees.

An operator warning is a different channel with its own command and its own contents, and SKILL.md's supervision section owns it. Do not reach for a verdict to deliver one.

The runner retains the exact submitted verdict bytes and their digest, the workspace digest, the Goal index, the terminal turn, the decision, the attempt, the transition, and the resume history. It refuses a decision whose earlier retained verdict files no longer match their digests.

## What Each Decision Does

- **Pass** skips the reminder and advances directly to that scope's Final.
- **Fail** inserts that scope's `plain/<scope>/remind.md` — which quotes the scope's own Review instruction in full and carries nothing cell-specific, so every failed scope receives the identical reminder — then stops for another decision after the supplementation Goal.

Eight supplementation attempts are permitted. A failure after the last one retains `quality-failed`, does not dispatch Final, and cannot be resumed. The attempt a scope stops on is itself a measurement, and a subject with a hundred published operations has further to travel than one with two dozen, so the bound is set where a cell that can converge still has room to.
