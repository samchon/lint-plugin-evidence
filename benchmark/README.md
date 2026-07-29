# Evidence benchmark

This benchmark compares Codex `gpt-5.6-luna` building the same application with and without `@samchon/lint-plugin-evidence`. It measures elapsed time, native Codex token usage, generated artifacts, requirement coverage, test coverage, and product quality.

## Layout

```text
benchmark/
  prompts/       retained baseline-wave user turns
  instructions/ backend-first gated user turns
  requirements/  subject specifications copied into docs/analysis
  template/      shared scaffold plus evidence and plain overlays
  src/           corpus, template, package, materialization, and setup code
  result/        successful benchmark outputs and latest demo workspaces
```

Store each successful attempt under `benchmark/result/<subject>/<arm>/runs/<run-id>/`. Keep the latest successful demo at `benchmark/result/<subject>/<arm>/workspace/`. Temporary setup state belongs under `benchmark/.work/`.

## Template proof

Install the workspace and run the consumer-shaped template test:

```bash
pnpm install --frozen-lockfile
pnpm --filter test-benchmark test:build
```

The test composes both overlays, copies the complete Todo requirements into a plain-arm workspace outside this repository, generates a lockfile, performs a frozen install, and runs the scaffold's full build. `.github/workflows/benchmark.yml` runs the same proof on every relevant pull-request change.

The evidence overlay additionally installs the locally packed product during benchmark materialization. Plain records the same package identity without receiving the package.

## Repository checks

```bash
pnpm --filter @samchon/evidence-benchmark check
pnpm --filter @samchon/evidence-benchmark test:unit
pnpm --filter @samchon/evidence-benchmark test:package
```

`test:unit` checks composition, corpus ingestion, materialization, and setup without a model call. `test:package` packs the real product and verifies a clean consumer installation.

## Experiment order

Run Todo and Reddit first, with evidence and plain arms concurrent within each subject wave. Run Shopping and ERP only after the cheaper subjects complete successfully.

Inspect the exact Luna wave without making a model call, then launch it from a clean validated pushed commit:

```bash
pnpm --filter @samchon/evidence-benchmark plan -- todo reddit
pnpm --filter @samchon/evidence-benchmark start -- todo reddit
```

Use `--port-base` to move the complete disjoint port allocation when the default range is occupied:

```bash
pnpm --filter @samchon/evidence-benchmark start -- --port-base 50000 todo reddit
```

`start` packs and verifies the product once, materializes and installs all selected evidence/plain cells, then starts them concurrently with Codex `gpt-5.6-luna`. Each cell streams raw JSONL and stderr into its run directory and writes total elapsed time to `run.json` after every turn. Failed and interrupted cell directories are removed.

The runner assigns each subject and arm distinct API, Swagger, Vite development, and Playwright ports. It checks every selected port before packaging or model use, exports the assignments to agent child processes, persists them in package-local `.env` files, and records them in `run.json`. Pnpm, ttsc, Go, and Playwright caches are cell-local.

## Prompt sequence

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

At wave launch, the runner reads every instruction once, copies the exact bytes into each cell's `inputs/instructions/`, and records their aggregate hash in `run.json`. Later source edits cannot change an active cell's remaining turns.

`benchmark/prompts/` retains the four-turn baseline protocol used by earlier frozen revisions. The current runner does not read it.

Every later attempt receives a new opaque run ID. The latest successful subject-arm result and demo workspace remain preserved.
