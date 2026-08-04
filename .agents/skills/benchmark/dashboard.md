# Dashboard

The dashboard is the campaign's live public record, and it lives in the draft pull-request body.

## Generate It, Never Reconstruct It

Before every refresh, run both commands against the reported cohort:

```bash
pnpm --filter @samchon/evidence-benchmark audit-suspensions
pnpm --filter @samchon/evidence-benchmark dashboard
```

The audit compares each reported run against Windows Kernel-Power disconnected-standby intervals and records a verified idle interval in that run's `suspensions.json`, which is the only file it may write; it must not modify `state.json` or a measured workspace. The dashboard command then prints the Markdown to stdout. Paste what it printed, and do not inspect workspace source to rebuild a value the generator did not produce.

## Shape

Group by authorized model with one H2 per model. Under each model, render one summary table followed by each cell's retained stage list. Only the latest launched run of a cell appears, and a cell that has not launched appears nowhere.

```markdown
## GPT-5.6-Terra

| Cell | Stage | Progress | Cost | Work time |
| --- | --- | --- | ---: | ---: |
| Todo Plain | `backend-review` · running | 27 files · +3.1k/−20 LOC | 7M | 1h 07m |

- **Todo Plain stages**
  - `backend-start`: 3M · 42m · 43% tokens · 63% time
  - `backend-review`: 4M · 25m · 57% tokens · 37% time
  - review `backend` attempt 0: fail -> retry (a1b2c3d4e5f6)
```

Those five columns, in that order, are the whole table. Do not add a run ID, a token-category breakdown, a wall-clock elapsed time, a quality judgment, or any further column.

## What The Columns Report

- **Stage** — the exact current or last retained instruction name, with its short status appended after `·`. A cell that has retained no goal yet shows the bare status alone. The statuses are `ready`, `running`, `checkpointed`, `awaiting-review-verdict`, `quality-failed`, `awaiting-supervision`, `rejected`, `interrupted`, and `completed`. Anomaly detail belongs in the pull-request prose outside the dashboard, never in this cell.
- **Progress** — the read-only Git delta from the prepared workspace baseline, counting tracked and untracked files. It measures implementation volume, not completion percentage, and a reader who treats it as a percentage will conclude a cell is nearly done because it wrote a lot.
- **Cost** — retained token usage rounded to the nearest million and written as an integer with `M`. A cell under half a million tokens therefore reads `0M`, which is a rounding artifact rather than a missing measurement.
- **Work time** — retained work time rounded to whole minutes and written as `7m` or `1h 07m`, after verified suspensions are subtracted. Setup time and operator time stay separate from it, and it is the only duration the dashboard shows.

Cost and Work time both include what judging the cell's Reviews cost, attributed to the stage each inspection judged. [review-verdicts.md](review-verdicts.md) owns why, and the retained `inspection` totals are what separate the judging share from the building share.

Each stage bullet repeats that stage's own cost and work time, then its unrounded shares of the cell's totals rounded to whole percentages. A Plain cell's list also carries one line per retained review verdict, naming the scope, attempt, decision, resulting transition, and the submitted verdict's digest prefix.

Derive an active stage only from the retained thread total and process elapsed time after subtracting the finalized stages.
