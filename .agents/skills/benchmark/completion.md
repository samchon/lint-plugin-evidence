# Campaign Completion

## When A Cell Is Execution-Complete

Treat a cell as execution-complete only when `state.json` is `completed`, every instruction in its arm's sequence has a native terminal checkpoint, and the final process either exits zero without a signal or records a runner-owned forced shutdown after those checkpoints completed.

Engine completion is recorded execution behavior, never a quality verdict.

## Review Every Completed Workspace

Review read-only. Accept `docs/analysis/**` as the specification without validating it, and report defects only in the generated application or in mismatches between its artifacts and the specification. Requirements are never defect candidates.

## Report The Cohort

Report each run ID, retained status, instruction, session and CLI identity, token categories, cost, instruction and process time, exit code, signal, interruption, and remaining unknown.

Run directories are retained as the record. Nothing in them is deleted at the end of a campaign.

## Fix Recurring Defects

Report a recurring template, instruction, or runner defect immediately, and commit and push the verified correction in the same pull request. If the correction changes a file an active cell may still read, stop and preserve the cohort before editing it.

## Close The Pull Request

After every correction is committed and pushed, perform the pull-request skill's complete Overall Self-Review before inspecting CI. Never partition a round. Any correction restarts a complete round, and you stop only after one round finds nothing to improve. Inspect CI afterward, and merge only when the cohort is closed and every required check is green.
