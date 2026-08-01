# Evidence benchmark

This benchmark compares the same coding engine building the same application with and without `@samchon/lint-plugin-evidence`. Both arms receive the same requirements, shared template, engine, model, and effort. Only the Evidence arm receives the package, Evidence overlay, and Evidence-specific guidance. Plain adds the product-wide Overall Review pair; Evidence ends after its backend and frontend tag reviews and final gates.

The runner prepares an isolated workspace, drives the prescribed instructions, and retains the native execution record. It does not judge requirements or repair a measured workspace. A supervised Plain checkpoint experiment may use a detached review thread and a runner-owned file ledger as an explicitly recorded treatment.

## Workspace preparation

Each cell uses a new ignored workspace.

1. Copy the shared base template into the workspace.
2. Apply the Evidence overlay only for the Evidence arm. Plain receives no Evidence package, tag, rule, carrier, or guidance.
3. Copy the selected `benchmark/requirements/<project>/` directory exactly into `docs/analysis/`. Treat its paths and bytes as opaque input.
4. Add the locally packed Evidence `.tgz` only for the Evidence arm.
5. Run `pnpm install`.
6. Initialize the workspace as a Git repository and commit the prepared baseline.

Instructions remain in the benchmark repository. The runner reads each Markdown file when starting its objective and records the exact text it sends; it does not copy instructions into the generated workspace.

## Run

Start a new cell from the repository root:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <project> <evidence|plain> <model> <effort> [run-id]
```

Omit `run-id` to create a cell under `benchmark/output/<project>/<engine>/<arm>/runs/<run-id>/`. Pass an existing run ID only to resume that exact engine, project, arm, model, effort, workspace, and session.

To create a recovery source without dispatching `backend-review`, stop cleanly after the durable boundary:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <project> <evidence|plain> <model> <effort> [run-id] --stop-after-backend-start
```

The retained state is `checkpointed`, not `completed`. Derive a new run from it rather than resuming the checkpoint-only run.

After `backend-start` completes, the runner stores a workspace and native-turn checkpoint before starting `backend-review`. If a later instruction proves defective, create a new run from that point:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <project> <evidence|plain> <model> <effort> --from-backend-start <source-run-id>
```

The derived run verifies the retained cell and exact completed `backend-start` boundary, restores that workspace, applies the current arm's Review skill, and reads the current downstream instructions. An explicit operator launch does not reject the checkpoint because repository inputs changed after it was created.

For a supervised Plain experiment whose independent variable is an external review ledger, launch the restored checkpoint in a new review thread:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <project> plain <model> <effort> --from-backend-start <source-run-id> --supervise-backend --review-ledger
```

Codex cannot add dynamic tools to an existing fork or resumed thread. This mode therefore restores the exact backend-start workspace and inherited measurements but starts a new native thread at `backend-review`. The runner registers `review_start_round`, `review_read_file`, `review_finish_round`, `review_start_calibration`, and `review_run_backend_command`; owns the canonical manifest, order, hashes, one-file returns, fail-restore-pass boundary, serialized backend process trees, and final gates; rejects Goal completion without a current dry seal and unchanged runner-owned watcher and test; and pauses after Backend Review and Backend Final for external verification. The cell and retained state identify this treatment explicitly.

Resume an approved ledger run with its run ID, `--supervise-backend`, and `--review-ledger`; the latter must remain part of the retained cell identity.

When launching Evidence cells concurrently, follow the Benchmark skill's shared-archive procedure. Every Evidence cell copies that archive and records its SHA-256. Without `EVIDENCE_BENCHMARK_ARCHIVE`, a standalone Evidence cell packs its own archive.

## Publishable reports

Raw run records and measured workspaces stay under the ignored `benchmark/output/` directory. Generate the tracked latest-run aggregate and comparison charts with:

```bash
pnpm --filter @samchon/evidence-benchmark report
```

The command writes `benchmark/aggregate/summary.json`, stable per-cell JSON under `benchmark/aggregate/cells/<model>/<project>/<arm>.json`, and SVG charts for tokens, work time, and wall time. Every artifact renders or copies values from the same retained aggregate without recalculating them.

The report reconstructs OpenRouter API-equivalent USD cost from each native request's token categories and context tier, then publishes it only when those requests exactly match the retained total. The live dashboard does not scan raw logs.

Pass repeated `--run-id <run-id>` arguments to publish an explicit historical cohort instead of the latest launched cell for each project and arm.

## Instruction sequence

Plain receives eight instructions. Evidence receives the first six and has no Overall Review pair:

| Step | Evidence | Plain |
| --- | --- | --- |
| Backend start | `instructions/evidence/backend/start.md` | `instructions/plain/backend/start.md` |
| Backend review | `instructions/evidence/backend/review.md` | `instructions/plain/backend/review.md` |
| Backend final | `instructions/evidence/backend/final.md` | `instructions/plain/backend/final.md` |
| Frontend start | `instructions/evidence/frontend/start.md` | `instructions/plain/frontend/start.md` |
| Frontend review | `instructions/evidence/frontend/review.md` | `instructions/plain/frontend/review.md` |
| Frontend final | `instructions/evidence/frontend/final.md` | `instructions/plain/frontend/final.md` |
| Overall review | — | `instructions/plain/overall/review.md` |
| Overall final | — | `instructions/plain/overall/final.md` |

For each Plain Final step, the runner appends the matching Review instruction as a Markdown blockquote at the bottom of the prescribed instruction. Evidence Final owns only its current gate. The runner combines the prescribed instruction and that arm's `instructions/<arm>/continue.md` once as the objective. No runtime instruction bytes are shared across arms.

Codex normally receives each objective as a native Goal in one app-server thread. A `--review-ledger` checkpoint treatment begins a new thread at Backend Review as described above. The runner advances after Goal completion, terminal-turn completion, and an idle thread.

Engine completion is recorded execution behavior, not a quality verdict.

## Retained record

The runner retains facts in delivery order:

- the exact prescribed, continuation, and combined user text;
- complete native stdin, stdout, and stderr in `events.jsonl` and `raw.log`, with observation and process-relative times;
- project, engine, arm, benchmark Git revision, Evidence artifact SHA-256 when applicable, requested model, effort, CLI version, session, instruction, and process identity;
- the current instruction cursor and engine-specific terminal checkpoints;
- native token categories, process elapsed time, exit code, and signal.
- the durable `backend-start` workspace and native-turn checkpoint, plus source lineage and inherited timing for a derived run.
- runner-owned review manifests, file hashes, credited tool reads, calibration boundaries, serialized command results, findings or dry state, and invalidation evidence when `--review-ledger` is active.

Setup time remains separate from model-process time. The retained record does not add build, lint, requirement, graph, quality, publication, or completion verdicts.

## Interruption and review

The operator does not add prose or implementation advice during a cell. The shared continuation text already instructs the measured agent to finish autonomously.

After an abnormal interruption, preserve the run and inspect its retained state. Codex may continue an exact retained Goal.

Review every completed workspace without changing it. Record application defects separately from evidence that a template, instruction, or runner misdirected the agent. Do not change frozen inputs while any cell in the same comparison cohort is active.
