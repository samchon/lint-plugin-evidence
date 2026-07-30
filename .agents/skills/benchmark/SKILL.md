---
name: benchmark
description: Defines authorization, frozen inputs, launch, native agent operation, interruption recovery, retained measurement, completed-workspace review, comparison, publication boundaries, and truthful reporting for the @samchon/lint-plugin-evidence benchmark. Use before preparing, launching, observing, resuming, accepting, comparing, publishing, or reporting a benchmark run.
---

# Benchmark

## Purpose

The benchmark compares the same coding engine building the same application with and without the Evidence plugin. A comparable pair uses the same subject requirements, shared template, instruction order, engine, model, effort, CLI version, and benchmark revision. Only the Evidence arm receives the locally packed plugin, Evidence overlay, graph configuration, and Evidence-specific guidance.

The runner executes and records the experiment. It does not validate requirements, judge the generated application, repair a measured workspace, or turn an agent completion claim into a quality verdict.

## Authorization

A model run is expensive. Launch only the exact engine, subject, arm, model, and effort the user authorizes. Authorization for a new cell does not cover a different cell or an unrequested rerun.

Recovery may resume the same retained run identity and native session after an abnormal interruption when that engine retained an exact continuation boundary. A new run ID, changed cell identity, changed model or effort, changed benchmark input, or restarted comparison is a new run and requires explicit authorization.

The runner does not publish results. Publication requires separate explicit authorization and a procedure that names the destination and accepted run; never infer either.

## Frozen Inputs

`benchmark/requirements/**` is user-owned, authoritative, and inviolable. Never edit, rewrite, normalize, summarize, rename, add, delete, validate, or challenge anything in that tree. Accept the selected directory as opaque paths and bytes and let the runner copy it exactly into `docs/analysis/`.

Keep the benchmark revision, selected requirements, template, overlays, locally packed product, instructions, engine, model, effort, and CLI version fixed throughout every comparable run. The runner reads an instruction when it starts, so editing an input while a cell is active changes the experiment even if earlier instructions already retained their text.

As the operator, do not modify a measured workspace, inject implementation advice, weaken a gate, hard-code a subject answer, or install Evidence material in Plain. A defect or contradiction in the generated application is measured behavior, not permission to repair or rerun it.

## Before Launch

Record the authorized engine, subject, arm, model, effort, and benchmark repository commit before launch. Use the same fixed revision and execution settings for every cell intended for comparison. Do not start while any selected requirement, template, overlay, instruction, or Evidence package input is still changing.

Run at most one command for a run ID. Concurrent launch or resume processes can corrupt the retained session and record.

Pass the engine, model, and effort explicitly:

```bash
pnpm --filter @samchon/evidence-benchmark start -- <codex|claude-code> <subject> <evidence|plain> <model> <effort>
```

Omitting the run ID creates a new run under `benchmark/result/<subject>/<engine>/<arm>/runs/<run-id>/`. Before paid agent work, the runner prepares a new ignored workspace:

1. It copies the base template.
2. It applies only the selected arm overlay.
3. It copies the selected requirement directory byte-for-byte into `docs/analysis/`.
4. For Evidence only, it packs the local plugin and installs the resulting archive.
5. It installs workspace dependencies.
6. It initializes and commits the prepared workspace baseline.

A preparation failure before the native session starts is not a measured result. Correct the external prerequisite without changing frozen benchmark meaning, then launch under the existing authorization. Stop for user direction if correction would change an input or cell identity.

## Instruction Sequence

One native session receives exactly nine instructions in this order:

| Step | Objective | Evidence instruction | Plain instruction |
| --: | --- | --- | --- |
| 1 | Skills contract | `instructions/skills-contract.md` | `instructions/skills-contract.md` |
| 2 | Backend start | `instructions/backend/start.md` | `instructions/backend/start.md` |
| 3 | Backend review | `instructions/backend/review.md` | `instructions/backend/review.md` |
| 4 | Backend final | `instructions/backend/evidence-final.md` | `instructions/backend/plain-final.md` |
| 5 | Frontend start | `instructions/frontend/start.md` | `instructions/frontend/start.md` |
| 6 | Frontend review | `instructions/frontend/review.md` | `instructions/frontend/review.md` |
| 7 | Frontend final | `instructions/frontend/evidence-final.md` | `instructions/frontend/plain-final.md` |
| 8 | Overall review | `instructions/overall/review.md` | `instructions/overall/review.md` |
| 9 | Overall final | `instructions/overall/evidence-final.md` | `instructions/overall/plain-final.md` |

At each step, the runner reads the selected instruction and `instructions/continue.md`, joins those exact texts once, and records the complete objective. Do not send a synthetic continuation, answer an ordinary question, or add operator prose.

Codex receives each objective as a native Goal in one app-server thread. The runner advances only after the Goal is complete, its terminal turn is completed, and the thread is idle.

Claude Code receives each objective as one noninteractive native agent loop. The first loop creates a session and the following loops resume it. The runner advances only after the loop emits one successful terminal result for the retained session. Claude Code has no Codex Goal primitive; do not describe its result as one.

These terminal signals record execution progress. They do not establish implementation quality.

## Operator Boundary

Leave an active cell to its native agent runtime. Questions and partial reports do not call for operator prose; the shared continuation text already instructs the agent to finish autonomously. Do not prompt the measured agent, edit its workspace, change an input, or make an external completion judgment.

Act only when the command reports an abnormal interruption or the user cancels the run. Interruptions include a failed or interrupted native turn, usage or budget exhaustion, runtime failure, non-zero exit, signal, invalid protocol state, or a retained-state mismatch.

On interruption:

1. Preserve the run directory and workspace unchanged.
2. Read `state.json`, `events.jsonl`, and `raw.log` to identify the exact current instruction, native failure, process result, and retained session.
3. Resume only when the cell identity, frozen inputs, workspace, CLI version, objective, and engine-specific checkpoint remain exact.
4. Stop and report the retained facts when identity or input drift exists, the exact checkpoint is missing, the workspace was modified externally, the cause is unknown, or the same deterministic failure recurs.

Do not add prompts, repair the workspace, substitute a session, or retry automatically.

If the user cancels, stop the active command, preserve its run directory, and report it as incomplete. Do not delete it or mark it complete; resuming later requires renewed authorization.

## Resume

Resume with the original engine, subject, arm, model, effort, and retained run ID:

```bash
pnpm --filter @samchon/evidence-benchmark start -- <codex|claude-code> <subject> <evidence|plain> <model> <effort> <run-id>
```

The runner verifies the retained cell and preserves earlier objectives, token usage, elapsed durations, process records, and raw events.

Codex can continue the exact current Goal when the retained native Goal and terminal checkpoints still match. A new app-server process is transport for the same session, not a new measured cell.

Claude Code can continue at an instruction boundary when the prior successful result is retained, or start the current instruction when it was never dispatched. If the current instruction was dispatched without a successful terminal result, exact resume is unavailable: preserve the incomplete cell and stop. Resending the objective or adding `continue` would create a new user input and is forbidden.

If the runner rejects the CLI version, cell identity, native checkpoint, or terminal boundary, stop. Do not bypass the check, edit `state.json`, create a replacement instruction, or start a fresh run under the old result.

## Retained Record

Each run keeps:

- `workspace/`: the prepared baseline and measured agent changes;
- `state.json`: cell identity including the benchmark Git revision, record paths, session and CLI identity, instruction cursor and records, cumulative native token categories, process records, status, and interruption details;
- `events.jsonl`: every native stdin, stdout, and stderr chunk with observation time, process index, sequence, stream, and process-relative elapsed time; and
- `raw.log`: the same raw chunks concatenated in delivery order.

Codex records the native Goal, terminal-turn and idle checkpoints, starting and ending token totals, token delta, and accumulated native turn duration. Claude Code records input dispatch, its resolved native model, terminal result, native usage categories, client-estimated cost, and process duration; it does not report a separate reasoning-token category, so none is invented. Both retain the requested model, exact prescribed text, continuation text, combined objective, command, arguments, exit code, signal, and raw events.

Do not reconstruct missing measurements. Report native token categories separately, keep setup outside process and instruction time, and label any derived price, estimate, or later quality assessment.

## Acceptance

Treat execution as complete only when `state.json` records `completed`, the cursor has passed all nine instructions, every instruction has the engine-specific terminal checkpoint, and every terminal process exited with code zero and no signal.

Runner completion proves only that the sequence reached those recorded terminal conditions. It does not prove requirement coverage, implementation correctness, test quality, graph integrity, or product quality.

Inspect the completed workspace without changing it before making any quality claim. Treat `docs/analysis/**` as the accepted specification, check the prescribed gates and resulting artifacts, and report defects and contradictions as results. Never convert uncertainty or a measured agent's prose into acceptance.

Compare only cells whose frozen inputs and declared execution identity match except for the intended arm treatment. Qualify or reject a comparison when revision, requirements, instructions, engine, model, effort, CLI version, workspace integrity, or operator intervention differs; do not hide the difference or silently rerun.

## Completed-Workspace Review

Review every completed workspace read-only while its raw record is fresh. Separate defects in the generated application from evidence that a template, instruction, or runner systematically misdirected the agent. Record the exact run ID, artifact location, retained event, and reason for each conclusion.

Report benchmark-input defect candidates immediately. During a multi-cell cohort, do not change its frozen revision or inputs after any cell starts. Finish reviewing every cell in that cohort, compare whether the candidate recurs, then correct verified benchmark defects before launching a later cohort. A correction creates a new benchmark revision and never changes or silently replaces completed results.

## Reporting

Report retained facts under their exact cell and run ID: current or terminal status, instruction position, session and CLI identity, interruption, native token categories, instruction and process elapsed time, exit code, and signal. Preserve failures and incomplete instructions in the account.

Keep setup and operator time separate from retained model-process time. Label estimates, derived costs, and post-run assessments as such. State what was directly recorded, what was inspected afterward, and what remains unknown.
