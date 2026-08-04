# Reporting

The dashboard is the campaign's live public record, and it lives in the draft pull-request body.

Every number below comes from the retained record. Never reconstruct a value the generator did not produce, and never read workspace source to rebuild one.

## Refresh The Dashboard

Run both commands against the reported cohort, then paste what the second printed:

```bash
pnpm --filter @samchon/evidence-benchmark audit-suspensions
pnpm --filter @samchon/evidence-benchmark dashboard
```

`audit-suspensions` compares each reported run against Windows Kernel-Power disconnected-standby intervals and records a verified idle interval in that run's `suspensions.json`. That file is the only one it may write; it must not modify `state.json` or a measured workspace.

Pass repeated `--run-id <run-id>` arguments to both commands to report an explicit historical cohort instead of the latest launched cell of each subject and arm.

## Dashboard Shape

Group by authorized model with one H2 per model. Under each model, render one summary table followed by each cell's retained stage list.

Only the latest launched run of a cell appears, and a cell that has not launched appears nowhere.

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

Anomaly detail belongs in the pull-request prose outside the dashboard.

Two columns are misread on sight:

- **Progress** is the Git delta from the prepared baseline. It measures implementation volume, not a completion percentage.
- **Cost** is rounded to whole millions, so a cell under half a million tokens reads `0M` — a rounding artifact, not a missing measurement.

`Cost` and `Work time` both include what judging the cell's Reviews cost, attributed to the stage each inspection judged, and [plain-review.md](plain-review.md) owns why.

Work time excludes verified suspensions, setup time, and operator time.

## Publish The Aggregate

```bash
pnpm --filter @samchon/evidence-benchmark audit-suspensions
pnpm --filter @samchon/evidence-benchmark report
```

`report` writes three artifacts from that same retained record:

- `benchmark/aggregate/summary.json`.
- Stable per-cell JSON under `benchmark/aggregate/cells/<model>/<subject>/<arm>.json`.
- The `tokens.svg` and `time.svg` comparison charts.

Raw run records and measured workspaces stay under the ignored `benchmark/output/`.

USD cost is reconstructed from each native request's token categories and context tier, and published only when those requests exactly match the retained total.

## Close A Cohort

A cell is execution-complete only when all three hold:

1. `state.json` is `completed`.
2. Every instruction in its arm's sequence has a native terminal checkpoint.
3. The final process exits zero without a signal, or records a runner-owned forced shutdown after those checkpoints completed.

Engine completion is recorded execution behavior, never a quality verdict.

Review every completed workspace read-only. Accept `docs/analysis/**` as the specification without validating it, and report defects only in the generated application or in mismatches between its artifacts and the specification. Requirements are never defect candidates.

Report each run ID, retained status, instruction, session and CLI identity, token categories, cost, instruction and process time, exit code, signal, interruption, and remaining unknown.

Run directories are the record. Nothing in them is deleted at the end of a campaign.

A recurring template, instruction, or runner defect is corrected under [intervention/boundary.md](intervention/boundary.md), not here.

## Close The Pull Request

1. Commit and push every correction.
2. Perform the pull-request skill's complete Overall Self-Review. Never partition a round, and restart a complete round after any correction. Stop only when one round finds nothing to improve.
3. Inspect CI.
4. Merge when the cohort is closed and every required check is green.
