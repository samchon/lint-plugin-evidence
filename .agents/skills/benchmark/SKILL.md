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

Before every dashboard refresh, run `pnpm --filter @samchon/evidence-benchmark audit-suspensions` for the reported cohort, then generate the dashboard with `pnpm --filter @samchon/evidence-benchmark dashboard`; do not inspect workspace source to reconstruct its values. The audit may update only a run's `suspensions.json`; it must not modify `state.json` or a measured workspace. Group the dashboard by authorized model, keep one H2 per model, show only the latest launched run for each cell, and omit cells that have not launched. Under each model, render one summary table followed by each cell's retained stage list:

```markdown
## GPT-5.6-Terra

| Cell | Stage | Progress | Cost | Work time |
| --- | --- | --- | ---: | ---: |
| Todo Plain | `backend-review` · running | 27 files · +3.1k/−20 LOC | 7M | 1h 07m |

- **Todo Plain stages**
  - `backend-start`: 3M · 42m · 43% tokens · 63% time
  - `backend-review`: 4M · 25m · 57% tokens · 37% time
```

The table's Stage keeps the exact current or last retained instruction name, such as `backend-start`, and appends only its short status, such as `· running` or `· interrupted`; put anomaly details outside the dashboard. `Progress` is the read-only Git delta from the prepared workspace baseline, including tracked and untracked files, written as `27 files · +3.1k/−20 LOC`; it measures implementation volume, not completion percentage. `Cost`, `Work time`, and every stage report retained token usage rounded to the nearest million as an integer with `M`, and retained work time rounded to whole minutes in hours and minutes, such as `7m` or `1h 07m`. Every stage also reports its unrounded token and work-time shares of that cell, rounded to whole percentages. Derive an active stage only from the retained thread total and process elapsed time after subtracting finalized stages; never reconstruct a missing measurement. Do not display wall-clock elapsed time; retained Work time is the only duration in the dashboard. Setup and operator time stay separate. Do not add run IDs, token-category breakdowns, or quality judgments.

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

One native session receives its arm's base objective sequence:

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

Plain stops after every Backend, Frontend, and Overall Review. A failed decision inserts that scope's `remind.md` with only the verified gaps, then stops for another decision after the supplementation Goal. A passing decision skips the reminder and advances directly to Final. Eight supplementation attempts are permitted; failure after the last one retains `quality-failed` and does not dispatch Final. The attempt a scope stops on is itself a measurement, and a subject with a hundred published operations has further to travel than one with two dozen, so the bound is set where a cell that can converge still has room to. Evidence keeps the fixed eight-step sequence without these pauses.

After `backend-start` reaches that exact boundary, the runner creates a durable checkpoint before dispatching `backend-review`. The checkpoint retains the material workspace, prepared Git baseline, native session and terminal turn, CLI version, token boundary, input digests, and inherited timing. Reinstallable dependencies, caches, and untracked runtime logs are excluded; Git-visible files are always retained. It is a recovery point for a later downstream-instruction correction, not permission to modify an active measured workspace.

The runner gives app-server a bounded shutdown grace after closing its input, then force-stops the owned process tree and records that cleanup if app-server does not exit. A detached owner monitor performs the same cleanup if the runner itself disappears, so a disconnected app-server cannot survive indefinitely.

## Supervise The Run

Observe every active cell at least every 30 seconds. Check `state.json`, benchmark and native process liveness, and `events.jsonl` and `raw.log` recency. Investigate any disagreement immediately and correct the dashboard without waiting for its 5-minute interval.

Do not edit a measured workspace, prompt the measured agent, inject advice, weaken a gate, hard-code a subject answer, or expose Evidence material to Plain. Questions and partial reports do not invite operator input.

The reporting subagent watches two frozen-boundary files in every cell on every cycle and reports a hit as a material change, quoting the diff it just read:

- **`lint.config.ts`.** Diff it against the run's baseline commit, discard lines containing `disabled:` and pure comments, and report whatever remains. Removing a `disabled` property is the Evidence arm's prescribed unlock as each layer completes; every other edit is tampering, including narrowing a reference `files` glob, redirecting it to build output, and deleting it.
- **`packages/api/package.json`.** Report any `main`, `types`, or `exports` value that resolves to build output instead of source. A cell that redirects the SDK package to `lib` breaks the frozen glob that selects the accessor surface, and then has a reason to edit the claim that depends on it.

On a confirmed hit, warn the cell and resume it. Do not restart it. The violation is measured behavior and the run holds the evidence of it; a restart destroys that record, discards the cell's work, and answers a correctable mistake with the most expensive remedy available. Restart only when the cell cannot be recovered at all, and say in the report what made recovery impossible.

A warning states the frozen boundary and the specific edit that crossed it, and nothing about the subject. Reaching a Plain review scope, it travels as verdict `feedback`; the runner offers no equivalent channel to an Evidence cell mid-objective, which is a gap to close rather than a reason to restart.

At `awaiting-review-verdict`, inspect the completed Goal's retained output and actions together with the actual workspace diff and relevant source. Judge substantive review, not report typography. Pass a materially exhaustive review despite minor checklist or formatting slips. Fail a review that substitutes counts, lengths, manifests, searches, or green commands for semantic inspection; materially omits requirements or source; fails to re-read the complete surface after edits; or leaves required behavior and test closure unproven.

Write one strict JSON verdict outside the measured workspace:

```json
{
  "decision": "fail",
  "rationale": "The retained review omitted material source paths and did not repeat its full inspection after editing them.",
  "feedback": "Inspect the omitted source paths, correct every resulting defect, and repeat the complete current-source review after the last edit."
}
```

A verdict carries `decision` and `rationale` and nothing else. It decides; it does not review. Naming the defect it found would hand the cell the product of the work being measured — a review that then corrects what it was told about has shown it can act on a finding, not that it can reach one — and it would make one cell's reminder differ from another's, so their attempt counts stop being comparable. Every failed scope receives the same prescribed `remind.md` with its Review quoted, and the rationale stays in the retained record the cell never sees.

Judge the review, not the product. A verdict answers whether the review performed the loop its instruction prescribes and stopped only where that instruction allows. Where a product defect matters is as evidence that it did not: an obligation the review reported as met while the workspace shows otherwise. Record that evidence in the rationale.

An operator warning is the separate channel, and it carries only what no agent can derive from inside its workspace: an authorization, or a frozen boundary it has crossed. It never carries a finding. Apply it with `pnpm --filter @samchon/evidence-benchmark supervise <subject> <run-id> <verdict.json>`, then resume the same run command. The runner retains the exact submitted verdict digest, workspace digest, Goal index, terminal turn, decision, injected feedback, attempt, transition, and resume history.

Final is a finishing and safety stage after a passed Review, not permission to accept a false Review pass. It may correct a small residual defect it independently notices, but the verdict must be based on the Review boundary itself.

Intervene immediately for an abnormal interruption or explicit cancellation. Diagnose the retained state, process, events, and raw stream first; when the exact recovery conditions below match, resume the same run without waiting for operator prose or the next reporting interval. Never blind-retry before diagnosis, repair a measured workspace, edit retained state, or substitute a session.

## Cell Ports

`EvidenceBenchmarkRuntime.assign` gives each cell a disjoint block of four ports from base 46000, so two cells never contend. What does contend is a cell and its own past: a killed runner leaves its API server, Swagger, Vite, and Playwright children holding that block, and the next launch fails its pre-launch port check. The cell then looks dead when it is only unable to start, and the failure appears on the launcher's output rather than in the run log.

| subject | arm | api | swagger | vite | playwright |
|---|---|---|---|---|---|
| todo | evidence | 46000 | 46001 | 46002 | 46003 |
| todo | plain | 46010 | 46011 | 46012 | 46013 |
| reddit | evidence | 46020 | 46021 | 46022 | 46023 |
| reddit | plain | 46030 | 46031 | 46032 | 46033 |
| shopping | evidence | 46040 | 46041 | 46042 | 46043 |
| shopping | plain | 46050 | 46051 | 46052 | 46053 |
| erp | evidence | 46060 | 46061 | 46062 | 46063 |
| erp | plain | 46070 | 46071 | 46072 | 46073 |

Before resuming a stopped cell, confirm its four ports have no listener, and stop whatever holds one. A listener on a cell's port while no runner of its own is alive means orphans are blocking recovery, which the reporting subagent reports as a distinct condition rather than as a dead cell. Always read the launcher's own output after a resume: a refused launch says so there and nowhere else.

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

This command verifies the retained cell and exact completed `backend-start` boundary, restores that workspace, applies the current arm's Review skill, forks the native thread through the retained terminal turn, and starts the new run at `backend-review` with the current downstream instructions. An explicit operator launch does not reject the checkpoint because repository inputs changed after it was created. Never edit a checkpoint, its source run, or its retained state.

A checkpoint-derived run has a new run ID and records its source lineage. Report inherited and continuation measurements together, and do not describe it as resuming the original run.

Start an eligible resume immediately after diagnosis and any required runner correction. If the resume itself fails, preserve that attempt, diagnose the new failure, and recover again from the last exact checkpoint; never abandon a cell or loop without evidence.

On cancellation, stop the reporting subagent and every liveness watcher, then force-stop every benchmark command, native process, and owned descendant. Verify that no process references an affected run. Preserve every run directory and report each cell as incomplete; never delete or mark it complete.

## Complete The Campaign

Treat a cell as execution-complete only when `state.json` is `completed`, every instruction in its arm's sequence has a native terminal checkpoint, and the final process either exits zero without a signal or records runner-owned forced shutdown after those checkpoints completed.

Review every completed workspace read-only. Accept `docs/analysis/**` as the specification without validating it. Report defects only in the generated application or mismatches between its artifacts and the specification. Requirements are never defect candidates.

Report each run ID, retained status, instruction, session and CLI identity, token categories, cost, instruction and process time, exit code, signal, interruption, and remaining unknown. Never reconstruct missing measurements.

Report recurring template, instruction, or runner defects immediately. Commit and push verified corrections in the same pull request. If a correction changes a file an active cell may still read, stop and preserve the cohort before editing it.

After every correction is committed and pushed, perform the pull-request skill's complete Overall Self-Review before inspecting CI. Never partition a round. Any correction restarts a complete round; stop only after one round finds nothing to improve. Inspect CI afterward and merge only when the cohort is closed and every required check is green.
