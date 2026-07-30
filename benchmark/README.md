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
pnpm --filter @samchon/evidence-benchmark start -- <codex|claude-code> <project> <evidence|plain> <model> <effort> [run-id]
```

Omit `run-id` to create a cell under `benchmark/result/<project>/<engine>/<arm>/runs/<run-id>/`. Pass an existing run ID only to resume that exact engine, project, arm, model, effort, workspace, and session.

## Instruction sequence

One native session receives these nine instructions in order:

| Step | Evidence | Plain |
| --- | --- | --- |
| Skills contract | `instructions/skills-contract.md` | `instructions/skills-contract.md` |
| Backend start | `instructions/backend/start.md` | `instructions/backend/start.md` |
| Backend review | `instructions/backend/review.md` | `instructions/backend/review.md` |
| Backend final | `instructions/backend/evidence-final.md` | `instructions/backend/plain-final.md` |
| Frontend start | `instructions/frontend/start.md` | `instructions/frontend/start.md` |
| Frontend review | `instructions/frontend/review.md` | `instructions/frontend/review.md` |
| Frontend final | `instructions/frontend/evidence-final.md` | `instructions/frontend/plain-final.md` |
| Overall review | `instructions/overall/review.md` | `instructions/overall/review.md` |
| Overall final | `instructions/overall/evidence-final.md` | `instructions/overall/plain-final.md` |

For each step, the runner combines the prescribed instruction and `instructions/continue.md` once as the objective.

Codex receives each objective as a native Goal in one app-server thread. It advances after Goal completion, terminal-turn completion, and an idle thread.

Claude Code receives each objective as one noninteractive agent loop. The first loop creates the session and later loops resume it. It advances after one successful terminal result for the retained session. Claude Code does not expose the Codex native Goal primitive.

Engine completion is recorded execution behavior, not a quality verdict.

## Retained record

The runner retains facts in delivery order:

- the exact prescribed, continuation, and combined user text;
- complete native stdin, stdout, and stderr in `events.jsonl` and `raw.log`;
- project, engine, arm, model, effort, CLI version, session, instruction, and process identity;
- the current instruction cursor and engine-specific terminal checkpoints;
- native token categories, process elapsed time, exit code, and signal; and
- Claude Code's reported client-side cost estimate.

Setup time remains separate from model-process time. The retained record does not add build, lint, requirement, graph, quality, publication, or completion verdicts.

## Interruption and review

The operator does not add prose or implementation advice during a cell. The shared continuation text already instructs the measured agent to finish autonomously.

After an abnormal interruption, preserve the run and inspect its retained state. Codex may continue an exact retained Goal. Claude Code may continue from a completed instruction boundary, but an instruction that was dispatched without a successful terminal result cannot be resent as an exact continuation; keep that cell incomplete.

Review every completed workspace without changing it. Record application defects separately from evidence that a template, instruction, or runner misdirected the agent. Do not change frozen inputs while any cell in the same comparison cohort is active.
