# Evidence benchmark

This benchmark compares Codex `gpt-5.6-luna` building the same application with and without `@samchon/lint-plugin-evidence`. It measures elapsed time, native Codex token usage, generated artifacts, requirement coverage, test coverage, and product quality.

## Layout

```text
benchmark/
  prompts/       common instruction, Goal, and review user turns
  requirements/  subject specifications copied into docs/analysis
  template/      shared scaffold plus evidence and plain overlays
  src/           corpus, template, package, materialization, and setup code
  result/        retained benchmark outputs and latest demo workspaces
```

Store each completed or interrupted attempt under `benchmark/result/<subject>/<arm>/runs/<run-id>/`. Keep the latest retained demo at `benchmark/result/<subject>/<arm>/workspace/`. Temporary setup state belongs under `benchmark/.work/`.

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

Inspect the exact Luna wave without making a model call, then launch it from a clean validated merge:

```bash
pnpm --filter @samchon/evidence-benchmark plan -- todo reddit
pnpm --filter @samchon/evidence-benchmark start -- todo reddit
```

`start` packs and verifies the product once, materializes and installs all selected evidence/plain cells, then starts them concurrently with Codex `gpt-5.6-luna`. Each cell streams raw JSONL and stderr into its retained run directory, writes `run.json` after every turn, and preserves failures and quota interruptions. It sends `instruction.md`, `goal.md`, `review.md`, and the arm-specific `final.md` in order on the same Codex thread.

The runner assigns each subject and arm distinct API, Swagger, Vite development, and Playwright ports. It checks every selected port before packaging or model use, exports the assignments to all agent child processes, and records them in `run.json`.

## Prompt sequence

| Step                       | Evidence            | Plain            |
| -------------------------- | ------------------- | ---------------- |
| Initial user turn          | `instruction.md`    | `instruction.md` |
| Goal activation            | `goal.md`           | `goal.md`        |
| First completion follow-up | `review.md`         | `review.md`      |
| Final verification         | `evidence/final.md` | `plain/final.md` |

Arm-specific method instructions stay inside the corresponding template overlay.

Preserve a failed, interrupted, or quota-limited run with its raw logs and generated workspace. Never silently replace it. A later attempt receives a new run ID.
