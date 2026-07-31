---
name: benchmark
description: Runs an @samchon/lint-plugin-evidence benchmark campaign from issue creation through launch, supervision, recovery, retained reporting, completed-workspace review, and pull-request completion. Use whenever operating or reporting a benchmark run.
---

# Running A Benchmark Campaign

## Start The Campaign

Before measurement:

1. Open the campaign issue.
2. Use the campaign branch in the repository's single worktree.
3. Push an empty campaign commit and open a draft pull request.
4. Record the authorized matrix, benchmark revision, engines, models, efforts, CLI versions, Evidence archive digest, and live dashboard in the pull-request body.
5. Assign one read-only reporting subagent to update that body every 10 minutes and immediately after a state change or anomaly.

Keep exactly these dashboard sections and columns:

```markdown
## Codex

| Project | Mode | Run ID | Progress | Quality | Native usage | Cost | Time |
| ------- | ---- | ------ | -------- | ------- | ------------ | ---- | ---- |

## Claude Code

| Project | Mode | Run ID | Progress | Quality | Native usage | Cost | Time |
| ------- | ---- | ------ | -------- | ------- | ------------ | ---- | ---- |
```

`Progress` reports the retained instruction and status. `Quality` remains `—` until completed-workspace review. Report only retained usage and cost. `Time` is completed instruction elapsed time plus the active process-relative `elapsedMs` from the latest retained event, rounded to whole seconds; setup and operator time stay separate.

## Prepare And Launch

Freeze the authorized subject, arm, engine, model, effort, requirements, template, instructions, package archive, CLI version, and benchmark revision before launch. Do not launch an unauthorized cell or rerun.

Treat `benchmark/requirements/**` as opaque, authoritative bytes. Never edit, rename, add, delete, normalize, summarize, validate, or challenge it. The runner only copies the selected directory into `docs/analysis/`.

Start a cell with every identity field explicit:

```bash
pnpm --filter @samchon/evidence-benchmark start <codex|claude-code> <subject> <evidence|plain> <model> <effort>
```

Before native work, the runner copies the base template, applies only the selected arm overlay, copies the selected requirements byte-for-byte, installs dependencies, and commits the workspace baseline. Evidence additionally installs one immutable locally packed archive shared by parallel Evidence cells. Plain never reads or installs it.

Run at most one command for a run ID. A preparation failure before native work does not consume the authorized cell when its identity and frozen inputs remain unchanged.

## Run The Objectives

One native session receives exactly nine objectives:

| Step | Objective | Evidence | Plain |
| --: | --- | --- | --- |
| 1 | Skills contract | `instructions/skills-contract.md` | same |
| 2 | Backend start | `instructions/backend/start.md` | same |
| 3 | Backend review | `instructions/backend/review.md` | same |
| 4 | Backend final | `instructions/backend/evidence-final.md` | `instructions/backend/plain-final.md` |
| 5 | Frontend start | `instructions/frontend/start.md` | same |
| 6 | Frontend review | `instructions/frontend/review.md` | same |
| 7 | Frontend final | `instructions/frontend/evidence-final.md` | `instructions/frontend/plain-final.md` |
| 8 | Overall review | `instructions/overall/review.md` | same |
| 9 | Overall final | `instructions/overall/evidence-final.md` | `instructions/overall/plain-final.md` |

At each step, the runner joins that file with `instructions/continue.md` once and records the exact objective. Do not add operator prose.

Codex advances after the retained Goal completes, its terminal turn completes, and the thread becomes idle. Claude Code advances after one successful noninteractive terminal result in the retained session.

## Supervise The Run

Observe every active cell at least every 30 seconds. Check `state.json`, benchmark and native process liveness, and `events.jsonl` and `raw.log` recency. Investigate any disagreement immediately and correct the dashboard without waiting for its 10-minute interval.

Do not edit a measured workspace, prompt the measured agent, inject advice, weaken a gate, hard-code a subject answer, or expose Evidence material to Plain. Questions and partial reports do not invite operator input.

Intervene only for an abnormal interruption or explicit cancellation. Never repair a measured workspace, edit retained state, substitute a session, or retry automatically.

## Recover Or Cancel

On interruption, preserve the run and identify the exact instruction, process result, native session, and failure from `state.json`, `events.jsonl`, and `raw.log`.

Resume only when the cell identity, frozen inputs, workspace, CLI version, objective, and native checkpoint still match:

```bash
pnpm --filter @samchon/evidence-benchmark start <engine> <subject> <arm> <model> <effort> <run-id>
```

Codex may resume an exact retained Goal checkpoint. Claude Code may resume only at a successful instruction boundary or before an undispatched instruction; a dispatched instruction without a successful terminal result is not resumable.

On cancellation, stop the reporting subagent and every liveness watcher, then force-stop every benchmark command, native process, and owned descendant. Verify that no process references an affected run. Preserve every run directory and report each cell as incomplete; never delete or mark it complete.

## Complete The Campaign

Treat a cell as execution-complete only when `state.json` is `completed`, all nine instructions have native terminal checkpoints, and the final process exits zero without a signal.

Review every completed workspace read-only. Accept `docs/analysis/**` as the specification without validating it. Report defects only in the generated application or mismatches between its artifacts and the specification. Requirements are never defect candidates.

Report each run ID, retained status, instruction, session and CLI identity, token categories, cost, instruction and process time, exit code, signal, interruption, and remaining unknown. Never reconstruct missing measurements.

Report recurring template, instruction, or runner defects immediately. Commit and push verified corrections in the same pull request. If a correction changes a file an active cell may still read, stop and preserve the cohort before editing it.

After every correction is committed and pushed, perform the pull-request skill's complete Overall Self-Review before inspecting CI. Never partition a round. Any correction restarts a complete round; stop only after one round finds nothing to improve. Inspect CI afterward and merge only when the cohort is closed and every required check is green.
