# Evidence benchmark

This benchmark compares the same coding engine building the same application with and without `@samchon/lint-plugin-evidence`. Both arms receive the same requirements, shared template, instruction order, engine, model, and effort. Only the Evidence arm receives the package, Evidence overlay, and Evidence-specific guidance.

The runner prepares an isolated workspace, drives the prescribed instructions in one native session, and retains the native execution record. It does not validate requirements, judge the generated application, or repair a measured workspace.

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

When launching Evidence cells concurrently, follow the Benchmark skill's shared-archive procedure. Every Evidence cell copies that archive and records its SHA-256. Without `EVIDENCE_BENCHMARK_ARCHIVE`, a standalone Evidence cell packs its own archive.

## Publishable reports

Raw run records and measured workspaces stay under the ignored `benchmark/output/` directory. Generate the tracked latest-run aggregate and comparison charts with:

```bash
pnpm --filter @samchon/evidence-benchmark report
```

The command writes `benchmark/aggregate/summary.json` plus `tokens.svg`, `work-time.svg`, and `wall-time.svg`. The JSON preserves raw aggregate values and per-stage shares; the SVG files render the same cells without recalculating them.

## Instruction sequence

One native session receives these eight instructions in order:

| Step | Evidence | Plain |
| --- | --- | --- |
| Backend start | `instructions/evidence/backend/start.md` | `instructions/plain/backend/start.md` |
| Backend review | `instructions/evidence/backend/review.md` | `instructions/plain/backend/review.md` |
| Backend final | `instructions/evidence/backend/final.md` | `instructions/plain/backend/final.md` |
| Frontend start | `instructions/evidence/frontend/start.md` | `instructions/plain/frontend/start.md` |
| Frontend review | `instructions/evidence/frontend/review.md` | `instructions/plain/frontend/review.md` |
| Frontend final | `instructions/evidence/frontend/final.md` | `instructions/plain/frontend/final.md` |
| Overall review | `instructions/evidence/overall/review.md` | `instructions/plain/overall/review.md` |
| Overall final | `instructions/evidence/overall/final.md` | `instructions/plain/overall/final.md` |

For each Final step, the runner appends the matching Review instruction as a Markdown blockquote at the bottom of the prescribed instruction. It then combines the prescribed instruction and that arm's `instructions/<arm>/continue.md` once as the objective. No runtime instruction bytes are shared across arms.

Codex receives each objective as a native Goal in one app-server thread. It advances after Goal completion, terminal-turn completion, and an idle thread.

Engine completion is recorded execution behavior, not a quality verdict.

## Retained record

The runner retains facts in delivery order:

- the exact prescribed, continuation, and combined user text;
- complete native stdin, stdout, and stderr in `events.jsonl` and `raw.log`, with observation and process-relative times;
- project, engine, arm, benchmark Git revision, Evidence artifact SHA-256 when applicable, requested model, effort, CLI version, session, instruction, and process identity;
- the current instruction cursor and engine-specific terminal checkpoints;
- native token categories, process elapsed time, exit code, and signal.

Setup time remains separate from model-process time. The retained record does not add build, lint, requirement, graph, quality, publication, or completion verdicts.

## Interruption and review

The operator does not add prose or implementation advice during a cell. The shared continuation text already instructs the measured agent to finish autonomously.

After an abnormal interruption, preserve the run and inspect its retained state. Codex may continue an exact retained Goal.

Review every completed workspace without changing it. Record application defects separately from evidence that a template, instruction, or runner misdirected the agent. Do not change frozen inputs while any cell in the same comparison cohort is active.
