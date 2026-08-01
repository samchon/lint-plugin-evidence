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
5. Assign one read-only reporting subagent to update that body every 5 minutes and immediately after a state change or anomaly.

Generate the dashboard with `pnpm --filter @samchon/evidence-benchmark dashboard`; do not inspect workspace source to reconstruct its values. Group it by authorized model, keep one H2 per model, show only the latest launched run for each cell, and omit cells that have not launched. Under each model, render one summary table followed by each cell's retained stage list:

```markdown
## GPT-5.6-Terra

| Cell | Stage | Progress | Elapsed | Cost | Work time |
| --- | --- | --- | ---: | ---: | ---: |
| Todo Plain | `backend-review` · running | 27 files · +3.1k/−20 LOC | 1h 12m | 7M | 1h 07m |

- **Todo Plain stages**
  - `backend-start`: 3M · 42m · 43% tokens · 63% time
  - `backend-review`: 4M · 25m · 57% tokens · 37% time
```

The table's Stage keeps the exact current or last retained instruction name, such as `backend-start`, and appends only its short status, such as `· running` or `· interrupted`; put anomaly details outside the dashboard. `Progress` is the read-only Git delta from the prepared workspace baseline, including tracked and untracked files, written as `27 files · +3.1k/−20 LOC`; it measures implementation volume, not completion percentage. `Cost`, `Work time`, and every stage report retained token usage rounded to the nearest million as an integer with `M`, and retained work time rounded to whole minutes in hours and minutes, such as `7m` or `1h 07m`. Every stage also reports its unrounded token and work-time shares of that cell, rounded to whole percentages. Derive an active stage only from the retained thread total and process elapsed time after subtracting finalized stages; never reconstruct a missing measurement. `Elapsed` is wall-clock time so a silent stall remains visible. Setup and operator time stay separate. Do not add run IDs, token-category breakdowns, or quality judgments.

## Prepare And Launch

Freeze the authorized subject, arm, engine, model, effort, requirements, template, instructions, package archive, CLI version, and benchmark revision before launch. Do not launch an unauthorized cell or rerun.

Treat `benchmark/requirements/**` as opaque, authoritative bytes. Never edit, rename, add, delete, normalize, summarize, validate, or challenge it. The runner only copies the selected directory into `docs/analysis/`.

Start a cell with every identity field explicit:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <subject> <evidence|plain> <model> <effort>
```

Before native work, the runner copies the base template, applies only the selected arm overlay, copies the selected requirements byte-for-byte, installs dependencies, and commits the workspace baseline. Evidence additionally installs one immutable locally packed archive shared by parallel Evidence cells. Plain never reads or installs it.

Run at most one command for a run ID. A preparation failure before native work does not consume the authorized cell when its identity and frozen inputs remain unchanged.

## Run The Objectives

One native session receives exactly eight objectives:

| Step | Objective | Evidence | Plain |
| --: | --- | --- | --- |
| 1 | Backend start | `instructions/evidence/backend/start.md` | `instructions/plain/backend/start.md` |
| 2 | Backend review | `instructions/evidence/backend/review.md` | `instructions/plain/backend/review.md` |
| 3 | Backend final | `instructions/evidence/backend/final.md` | `instructions/plain/backend/final.md` |
| 4 | Frontend start | `instructions/evidence/frontend/start.md` | `instructions/plain/frontend/start.md` |
| 5 | Frontend review | `instructions/evidence/frontend/review.md` | `instructions/plain/frontend/review.md` |
| 6 | Frontend final | `instructions/evidence/frontend/final.md` | `instructions/plain/frontend/final.md` |
| 7 | Overall review | `instructions/evidence/overall/review.md` | `instructions/plain/overall/review.md` |
| 8 | Overall final | `instructions/evidence/overall/final.md` | `instructions/plain/overall/final.md` |

At each step, the runner joins that file with the same arm's `instructions/<arm>/continue.md` once and records the exact objective. The arms share no runtime instruction bytes. Do not add operator prose.

Codex advances after the retained Goal completes, its terminal turn completes, and the thread becomes idle.

After `backend-start` reaches that exact boundary, the runner creates a durable checkpoint before dispatching `backend-review`. The checkpoint retains the material workspace, prepared Git baseline, native session and terminal turn, CLI version, token boundary, input digests, and inherited timing. Reinstallable dependencies, caches, and untracked runtime logs are excluded; Git-visible files are always retained. It is a recovery point for a later downstream-instruction correction, not permission to modify an active measured workspace.

The runner gives app-server a bounded shutdown grace after closing its input, then force-stops the owned process tree and records that cleanup if app-server does not exit. A detached owner monitor performs the same cleanup if the runner itself disappears, so a disconnected app-server cannot survive indefinitely.

## Supervise The Run

Observe every active cell at least every 30 seconds. Check `state.json`, benchmark and native process liveness, and `events.jsonl` and `raw.log` recency. Investigate any disagreement immediately and correct the dashboard without waiting for its 5-minute interval.

Do not edit a measured workspace, prompt the measured agent, inject advice, weaken a gate, hard-code a subject answer, or expose Evidence material to Plain. Questions and partial reports do not invite operator input.

Intervene immediately for an abnormal interruption or explicit cancellation. Diagnose the retained state, process, events, and raw stream first; when the exact recovery conditions below match, resume the same run without waiting for operator prose or the next reporting interval. Never blind-retry before diagnosis, repair a measured workspace, edit retained state, or substitute a session.

## Recover Or Cancel

On interruption, preserve the run and identify the exact instruction, process result, native session, and failure from `state.json`, `events.jsonl`, and `raw.log`.

Resume only when the cell identity, frozen inputs, workspace, CLI version, objective, and native checkpoint still match:

```bash
pnpm --filter @samchon/evidence-benchmark start <engine> <subject> <arm> <model> <effort> <run-id>
```

Keep the cell's original `benchmarkRevision` frozen. When recovery requires a committed runner correction, resume only from a clean descendant revision; retain that correction as the new process's `runnerRevision` while the runner revalidates the stored cell, instruction bytes, workspace, artifact digest, CLI, session, Goal, and token boundary.

Codex may resume an exact retained Goal checkpoint.

When a defect is confined to an instruction after `backend-start`, preserve the source run and create a new checkpoint-derived run:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <subject> <arm> <model> <effort> --from-backend-start <source-run-id>
```

This command restores the retained workspace, forks the native thread through the completed `backend-start` terminal turn, and starts the new run at `backend-review`. It permits committed changes to that arm's seven downstream instruction files only. The selected base and arm template, every embedded skill and AGENTS.md, requirements, Evidence archive when applicable, model, effort, CLI, `backend-start`, and continuation instruction must still match; otherwise start the cell again from the beginning. Never edit a checkpoint, its source run, or its retained state to force eligibility.

A checkpoint-derived run has a new run ID and records its source lineage. Report inherited and continuation measurements together, and do not describe it as resuming the original run.

Start an eligible resume immediately after diagnosis and any required runner correction. If the resume itself fails, preserve that attempt, diagnose the new failure, and recover again from the last exact checkpoint; never abandon a cell or loop without evidence.

On cancellation, stop the reporting subagent and every liveness watcher, then force-stop every benchmark command, native process, and owned descendant. Verify that no process references an affected run. Preserve every run directory and report each cell as incomplete; never delete or mark it complete.

## Complete The Campaign

Treat a cell as execution-complete only when `state.json` is `completed`, all eight instructions have native terminal checkpoints, and the final process either exits zero without a signal or records runner-owned forced shutdown after those checkpoints completed.

Review every completed workspace read-only. Accept `docs/analysis/**` as the specification without validating it. Report defects only in the generated application or mismatches between its artifacts and the specification. Requirements are never defect candidates.

Report each run ID, retained status, instruction, session and CLI identity, token categories, cost, instruction and process time, exit code, signal, interruption, and remaining unknown. Never reconstruct missing measurements.

Report recurring template, instruction, or runner defects immediately. Commit and push verified corrections in the same pull request. If a correction changes a file an active cell may still read, stop and preserve the cohort before editing it.

After every correction is committed and pushed, perform the pull-request skill's complete Overall Self-Review before inspecting CI. Never partition a round. Any correction restarts a complete round; stop only after one round finds nothing to improve. Inspect CI afterward and merge only when the cohort is closed and every required check is green.
