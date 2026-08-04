# Aggregate

`benchmark/aggregate` is what a campaign publishes and keeps. Like the dashboard it is generated from the retained record, so run the command and commit what it wrote.

## Publish

```bash
pnpm --filter @samchon/evidence-benchmark audit-suspensions
pnpm --filter @samchon/evidence-benchmark report
```

`report` writes three artifacts:

- `benchmark/aggregate/summary.json`.
- Stable per-cell JSON under `benchmark/aggregate/cells/<model>/<subject>/<arm>.json`.
- The `tokens.svg` and `time.svg` comparison charts.

Raw run records and measured workspaces stay under the ignored `benchmark/output/`. Only the aggregate is tracked.

USD cost is reconstructed from each native request's token categories and context tier, and published only when those requests exactly match the retained total.

Pass repeated `--run-id <run-id>` arguments to both commands to publish an explicit historical cohort.

## Close A Cohort

A cell is execution-complete only when all three hold:

1. `state.json` is `completed`.
2. Every instruction in its arm's sequence has a native terminal checkpoint.
3. The final process exits zero without a signal, or records a runner-owned forced shutdown after those checkpoints completed.

Engine completion is recorded execution behavior, never a quality verdict.

Review every completed workspace read-only. Accept `docs/analysis/**` as the specification without validating it, and report defects only in the generated application or in mismatches between its artifacts and the specification. Requirements are never defect candidates.

Report each run ID, retained status, instruction, session and CLI identity, token categories, cost, instruction and process time, exit code, signal, interruption, and remaining unknown. A measurement the runner did not retain is reported as unknown, never reconstructed.

Run directories are the record. Nothing in them is deleted at the end of a campaign.

## Close The Pull Request

1. Commit and push every correction, including the regenerated aggregate.
2. Perform the pull-request skill's complete Overall Self-Review. Never partition a round, and restart a complete round after any correction. Stop only when one round finds nothing to improve.
3. Inspect CI.
4. Merge when the cohort is closed and every required check is green.

A recurring template, instruction, or runner defect is corrected under [intervention/boundary.md](../intervention/boundary.md), not here.
