# Evidence benchmark

This benchmark compares Codex `gpt-5.6-luna` building the same application with and without `@samchon/lint-plugin-evidence`. It retains the complete generated project and measures elapsed time, native Codex token usage, API-equivalent cost, requirement and test coverage, implementation scale, gate behavior, completion honesty, and product quality.

## Active supervision is required

The coding agent is the measured instrument. Starting the runner and waiting for its process to end is insufficient: an operator agent must inspect each live stream and workspace, resume recoverable interruptions, reject premature completion, run the prescribed follow-up turns, and audit the final gates and semantics.

Codex writes one JSON event per line to `logs/*.stdout.jsonl`. These JSONL files are execution logs, not requirements; they retain thread IDs, commands, file changes, token usage, completion claims, and provider errors.

`Selected model is at capacity` is a transient model-server availability failure, not the coding agent giving up or the project failing. The runner retains that cell so the operator can resume the same thread, workspace, frozen inputs, logs, elapsed time, and token ledger. Repeated capacity failures may be handled by a run-scoped watcher that retries only after the latest failure proves the same provider error.

## Layout

```text
benchmark/
  prompts/       retained baseline-wave user turns
  instructions/ backend-first gated user turns
  requirements/  subject specifications copied into docs/analysis
  template/      shared scaffold plus evidence and plain overlays
  src/           materialization, runner, recovery, repair, and publication code
  result/        retained runs and latest successful demo workspaces
  .work/         ignored package, controller, repair, and reporting state
```

Each attempt lives under `benchmark/result/<subject>/<arm>/runs/<run-id>/`. A cell that reached a Codex turn remains there when interrupted so it can resume. The latest successful demo is promoted to `benchmark/result/<subject>/<arm>/workspace/`; setup failures that never entered measured work may be removed.

## Verify before model use

Install the repository and run the deterministic benchmark checks:

```bash
pnpm install --frozen-lockfile
pnpm --filter @samchon/evidence-benchmark check
pnpm --filter @samchon/evidence-benchmark test:unit
pnpm --filter @samchon/evidence-benchmark test:package
pnpm --filter test-benchmark test:build
```

The consumer-shaped template proof composes both overlays, copies the complete Todo requirements into an isolated plain workspace, generates a lockfile, performs a frozen install, and builds the full scaffold. `.github/workflows/benchmark.yml` runs the same proof for relevant pull-request changes.

The evidence overlay additionally installs the locally packed product during benchmark materialization. Plain records the same package identity without receiving the package.

## Plan and start

Run Todo and Reddit first, with evidence and plain arms concurrent within each subject wave. Run Shopping and ERP only after the cheaper subjects complete successfully.

Inspect the exact wave without a model call, then launch it from the same clean, validated, pushed commit:

```bash
pnpm --filter @samchon/evidence-benchmark plan -- todo reddit
pnpm --filter @samchon/evidence-benchmark start -- todo reddit
```

Use `--port-base` to move the complete disjoint port allocation when the default range is occupied:

```bash
pnpm --filter @samchon/evidence-benchmark start -- --port-base 50000 todo reddit
```

`start` packs and verifies the product once, materializes and installs every selected evidence/plain cell, then starts them concurrently. It freezes the instruction bytes before the first turn and updates `run.json` after each attempt.

The runner assigns each subject and arm distinct API, Swagger, Vite development, and Playwright ports. It checks every selected port before packaging or model use, exports the assignments to agent child processes, persists them in package-local `.env` files, and records them in `run.json`. Pnpm, ttsc, Go, and Playwright caches are cell-local.

## Observe and resume

Inspect every active cell at least once every 30 seconds: read its `run.json`, controller liveness, newest stdout JSONL and stderr, current workspace, and active gate. Revive a recoverable interruption immediately. Separately, update the campaign pull-request body every 15 minutes with only Project, Mode, Progress, Quality, Cost, and Time; report interruptions, recoveries, defects, interventions, and completed phases as formal `COMMENT` reviews.

Resume a recoverably interrupted cell with its exact identity:

```bash
pnpm --filter @samchon/evidence-benchmark resume -- todo evidence <run-id>
```

Recovery is proven only when the controller is alive, `run.json` is `running`, and a new attempt JSONL contains activity. A successful launch command alone is not proof.

The complete operator procedure, including stalled streams, questions, premature completion, repeated provider capacity, repairs, acceptance, reporting, and publication, is in [the benchmark running skill](../.agents/skills/benchmark/running.md).

## Instruction sequence

The backend-first workflow uses eight user turns on one Codex thread.

| Step            | Evidence                     | Plain                     |
| --------------- | ---------------------------- | ------------------------- |
| Backend start   | `backend/start.md`           | `backend/start.md`        |
| Backend review  | `backend/review.md`          | `backend/review.md`       |
| Backend final   | `backend/evidence-final.md`  | `backend/plain-final.md`  |
| Frontend start  | `frontend/start.md`          | `frontend/start.md`       |
| Frontend review | `frontend/review.md`         | `frontend/review.md`      |
| Frontend final  | `frontend/evidence-final.md` | `frontend/plain-final.md` |
| Overall review  | `overall/review.md`          | `overall/review.md`       |
| Overall final   | `overall/evidence-final.md`  | `overall/plain-final.md`  |

Arm-specific method instructions stay inside the corresponding template overlay.

Each turn explicitly enables Goal mode and treats its complete instruction as that stage's bounded objective and completion criteria. At wave launch, the runner reads every instruction once, copies the exact bytes into each cell's `inputs/instructions/`, and records their aggregate hash in `run.json`. Later source edits cannot change an active or resumed cell's remaining turns.

`benchmark/prompts/` retains the four-turn baseline protocol used by earlier frozen revisions. The current runner does not read it.

## Apply a common template repair

Prefer a corrected new run. If an expensive active wave must be salvaged after a small common template defect, first stop the affected model processes, disable any capacity watcher, and verify every selected evidence and plain cell is `interrupted`. Correct and validate the source template, then create one workspace-relative unified text patch below `benchmark/.work/repairs/`.

```bash
pnpm --filter @samchon/evidence-benchmark repair -- --patch benchmark/.work/repairs/<fix>.patch <run-id> todo reddit
```

The command dry-runs every selected cell before changing any, applies the same text patch to both arms, records its bytes and SHA-256 under each run's `interventions/`, excludes repair time from agent time, and rolls back on partial failure. It rejects changes to requirements, local package archives, Git metadata, dependency directories, binary files, deletions, renames, and symbolic links.

A repair applied after measured work is an operator intervention, even when both arms receive identical bytes. Report it as a comparison qualification. Requirement changes, arm-specific help, or unequal patches require a new run.

## Accept a result

`status: completed` is provisional. Before accepting a cell, verify all eight prescribed turns, build, lint, database preparation, backend tests, frontend tests, runtime behavior, requirement coverage, test coverage, enabled evidence claims, residual placeholders, and semantic quality. Failed capacity attempts remain in cumulative cost and time; setup and repair overhead remain separate.

Do not record absolute start or completion timestamps. Preserve total elapsed duration, native token categories, standard API-equivalent cost, commands and gates, first completion claims, implementation scale, coverage, quality findings, frozen-input identities, raw streams, and the final workspace.

## Publish a completed demo

Completed and operator-accepted applications may be published as standalone public repositories:

```text
evidence-benchmark-<subject>
evidence-benchmark-<subject>-plain
```

Publication is explicit and has no default GitHub owner:

```bash
pnpm --filter @samchon/evidence-benchmark publish:result -- --owner <github-login> --public todo evidence <run-id>
```

The command requires the authenticated `gh` login to equal `--owner`, refuses an existing target, verifies the completed turn set and frozen input identities, exports the application workspace, excludes local environment files and nested Git state, and replaces the exported workflow set with the repository-owned generated CI. It then creates and pushes the new repository, verifies its remote `main` commit, and rolls back only the repository created by that failed invocation.

Evidence demos retain `.benchmark-deps/*.tgz` because their frozen lockfile installs the exact locally packed product measured by the run. Logs and benchmark scoring remain in this repository rather than the demo.

## Generated-project CI

Every generated workspace includes `.github/workflows/ci.yml`. On pushes and pull requests it performs a frozen pnpm install, full build, lint, SQLite preparation, backend tests, Chromium installation, and frontend Playwright tests. The workflow uses local CI-only environment values and requires no repository secrets.
