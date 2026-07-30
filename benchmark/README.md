# Evidence benchmark

This benchmark compares the same coding agent building the same application with and without `@samchon/lint-plugin-evidence`. Both arms receive the same requirements, shared template, instruction order, model, and effort. Only the Evidence arm receives the package, Evidence template overlay, and Evidence-specific guidance.

The runner prepares an isolated workspace, drives the prescribed Goals in one native session, and retains the native execution record. It does not validate requirements, judge the generated application, or repair a measured workspace.

## Workspace preparation

Each benchmark cell uses a new ignored workspace.

1. Copy the shared base template into the workspace.
2. For the Evidence arm, apply the Evidence overlay after the base template. The Plain arm receives no Evidence overlay, package, tag, rule, carrier, or guidance.
3. Copy the selected `benchmark/requirements/<project>/` directory exactly into `docs/analysis/`. Treat its paths and bytes as opaque input.
4. For the Evidence arm only, add the locally packed Evidence `.tgz` as a dependency.
5. Run `pnpm install`.
6. Initialize the workspace as a Git repository and commit the prepared baseline.

Instructions remain in the benchmark repository. The runner reads each Markdown file when starting its Goal and records the exact text it sends; it does not copy instructions into the generated workspace.

## Run

Start a new cell from the repository root:

```bash
pnpm --filter @samchon/evidence-benchmark start -- <project> <evidence|plain> [model] [effort] [run-id]
```

Omit `run-id` to create a new cell. After an abnormal interruption, pass that cell's existing `run-id` with the same project, arm, model, and effort to resume its retained workspace and native session.

## Goal sequence

One native session receives these nine instructions as Goals in order:

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

The runner starts one Goal at a time. It combines the exact prescribed instruction and `instructions/continue.md` once as that Goal's objective, then leaves continued turns to the native Goal runtime. It never injects a second continuation turn. When the measured agent marks the Goal complete, the runner starts the next prescribed Goal. The measured agent's completion status is recorded behavior, not a quality verdict from the runner.

## Retained record

The runner retains facts in delivery order:

- the exact prescribed and continuation user text;
- the complete native event stream and raw stdout and stderr;
- project, engine, arm, model, effort, CLI version, session, turn, and Goal identity;
- Goal state transitions and the current instruction position;
- native token categories, tool and command events, and model-process elapsed time;
- process exit code and signal.

Setup time remains separate from model-process time. The retained record does not add build, lint, requirement, graph, quality, publication, or completion verdicts.

## Operator boundary

The native Goal runtime handles ordinary questions, partial reports, and pauses under the shared continuation text already present in the Goal objective. The operator does not add prose or implementation advice to those turns.

The operator reacts only to an abnormal interruption such as a failed native turn, non-zero process exit, or signal. It preserves the retained state and resumes the same native session when authorized. It does not mutate the measured workspace, add hints, retry automatically, or replace the measured agent's Goal status with an external completion judgment.
