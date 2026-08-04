---
name: benchmark
description: Defines how an @samchon/lint-plugin-evidence benchmark campaign is set up, launched under frozen inputs, run, supervised, recovered, and reported, from issue creation through pull-request completion. Use whenever operating, supervising, or reporting a benchmark run.
---

# Benchmark Operation

A campaign measures one coding engine building the same application twice: once with `@samchon/lint-plugin-evidence` installed and its guidance in the workspace, and once with neither. One subject and arm is a **cell**, one execution of a cell is a **run**, and every run is retained under `benchmark/output/<subject>/codex/<arm>/runs/<run-id>/`.

The comparison is worth exactly as much as the guarantee that the two arms differ in one thing only. The operator therefore freezes every other input, records what happened, and touches nothing else — the record included: a measurement the runner did not retain is reported as unknown, never reconstructed.

## Topics

- **[Dashboard](dashboard.md)** — how the live dashboard is generated and its exact shape. Read before assigning the reporting subagent, and before every refresh.
- **[Plain Review Verdicts](review-verdicts.md)** — what a verdict judges, how it is written and applied, and what each decision does. Read when a Plain cell reaches `awaiting-review-verdict`.
- **[Recovery And Cancellation](recovery.md)** — diagnosis, cell ports and orphan processes, resume eligibility, checkpoint-derived runs, and cancellation. Read when a cell is interrupted, when a launch or resume fails, or when the campaign is cancelled.
- **[Campaign Completion](completion.md)** — the execution-complete criterion, read-only workspace review, cohort reporting, and closing the pull request. Read when a cohort is closing.

## The Frozen Boundary

Freeze the authorized subject, arm, engine, model, effort, requirements, template, instructions, package archive, CLI version, and benchmark revision before launch. Do not launch an unauthorized cell or rerun.

Treat `benchmark/requirements/**` as opaque, authoritative bytes. Never edit, rename, add, delete, normalize, summarize, validate, or challenge it. The runner only copies the selected directory into the workspace's `docs/analysis/`.

Do not edit a measured workspace, prompt the measured agent, inject advice, weaken a gate, hard-code a subject answer, or expose Evidence material to Plain. A cell's questions and partial reports do not invite operator input; its continuation instruction already tells it to finish on its own.

### Three Files Nobody Touches

Never touch a `tsconfig.json`, a `lint.config.ts`, or a `package.json` `main`, `types`, or `exports` value anywhere under `benchmark/template/**`, in either arm, at any nesting level. That includes adding, removing, or reordering `include`, `exclude`, `ignores`, `paths`, `rootDir`, `extends`, `plugins`, `rules`, or a claim, and it includes creating or deleting such a file.

These three decide what each Program contains and where a package resolves to, and so together they decide what every evidence population selects from. A change no one asked for voids the measurement silently instead of failing it: an empty population demands nothing, and a claim that reaches that state reports full coverage while checking nothing.

This is the same boundary a measured cell is warned for crossing, and the operator is not exempt from it. The user owns these files. Do not repair one you believe is broken, do not adapt one to a symptom you are chasing, and do not add an exclusion to silence a diagnostic. Report what you observed and the file and line behind it, then wait for an explicit instruction naming the file.

Inside a running cell those same three files decide what a claim selects from, which is why a cell that edits one stops being measured rather than starting to fail. Each has its own hit criterion:

- **`lint.config.ts`.** Diff it against the run's baseline commit, discard lines containing `disabled:` and pure comments, and report whatever remains. Removing a `disabled` property is the Evidence arm's prescribed unlock as each layer completes; every other edit is tampering, including narrowing a reference `files` glob, redirecting it to build output, and deleting it.
- **`tsconfig.json`.** Report any change at all, at any nesting level, in either arm. `include`, `exclude`, `rootDir`, `paths`, and `extends` decide which files enter a Program, and a claim populates only from the Program that owns it. A file dropped from `include` removes the hosts or targets that depended on it, and the claim then passes while checking nothing.
- **`packages/api/package.json`.** Report any `main`, `types`, or `exports` value that resolves to build output instead of source. A cell that redirects the SDK package to `lib` breaks the frozen glob that selects the accessor surface, and then has a reason to edit the claim that depends on it.

## Start The Campaign

Before measurement:

1. Open the campaign issue.
2. Use the campaign branch in the repository's single worktree.
3. Push an empty campaign commit and open a draft pull request.
4. Record the authorized matrix, benchmark revision, engines, models, efforts, CLI versions, Evidence archive digest, and live dashboard in the pull-request body.
5. Assign one read-only reporting subagent to update that body every 5 minutes and immediately after a state change or anomaly.

## Prepare And Launch A Cell

The runner records the campaign's benchmark revision from the repository's `HEAD` and refuses to launch while anything is uncommitted or untracked, so commit or stash before starting a cell.

Start a cell with every identity field explicit:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <subject> <evidence|plain> <model> <effort>
```

Before native work, the runner copies the base template, applies only the selected arm overlay, copies the selected requirements byte-for-byte, installs dependencies, and commits the workspace baseline. Evidence additionally installs one immutable locally packed archive shared by parallel Evidence cells and pins its digest to the cell. Plain never reads or installs it.

The launch also fails before any model use when one of the cell's four assigned ports is occupied; [recovery.md](recovery.md) owns the port map and what to do about it.

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

At each step the runner joins that file with the same arm's `instructions/<arm>/continue.md` once and records the exact objective it sent. A Plain reminder or Final also carries its own scope's Review instruction quoted beneath it. The arms share no runtime instruction bytes. Do not add operator prose.

Codex advances only after the retained Goal completes, its terminal turn completes, and the thread becomes idle.

Only Plain pauses, and it pauses for an operator verdict; Evidence runs the eight steps above without stopping. [review-verdicts.md](review-verdicts.md) owns that loop.

After `backend-start` reaches that exact boundary, the runner creates a durable checkpoint before dispatching `backend-review`. The checkpoint retains the material workspace, prepared Git baseline, native session and terminal turn, CLI version, token boundary, input digests, and inherited timing. Reinstallable dependencies, caches, and untracked runtime logs are excluded, while Git-visible files are always retained. It is a recovery point for a later downstream-instruction correction, not permission to modify an active measured workspace.

The runner gives app-server a bounded shutdown grace after closing its input, then force-stops the owned process tree and records that cleanup if app-server does not exit. A detached owner monitor performs the same cleanup if the runner itself disappears, so a disconnected app-server cannot survive indefinitely.

## Supervise The Run

Observe every active cell at least every 30 seconds. Check `state.json`, benchmark and native process liveness, and `events.jsonl` and `raw.log` recency. Investigate any disagreement immediately and correct the dashboard without waiting for its 5-minute interval.

The reporting subagent re-reads the frozen-boundary files in every cell on every cycle and reports a hit as a material change, quoting the diff it just read.

On a confirmed hit, warn the cell and resume it. **Do not restart it.** The violation is measured behavior and the run holds the evidence of it; a restart destroys that record, discards the cell's work, and answers a correctable mistake with the most expensive remedy available. Restart only when the cell cannot be recovered at all, and say in the report what made recovery impossible.

A warning is the operator's one channel into a cell, and it carries only what no agent can derive from inside its workspace: an authorization, or a frozen boundary it has crossed. It never carries a finding, and it says nothing about the subject. Stop the cell, attach the warning to its current objective, then resume the same run command:

```bash
pnpm --filter @samchon/evidence-benchmark warn <subject> <evidence|plain> <run-id> <warning.json>
```

The warning file is a failing decision with a retained `rationale` and the `feedback` the cell will read:

```json
{
  "decision": "fail",
  "rationale": "The cell narrowed the reference files glob in packages/backend/lint.config.ts.",
  "feedback": "Restore packages/backend/lint.config.ts to its committed baseline. Its lint configuration is not yours to change."
}
```

The runner refuses feedback that names the machinery outside the workspace — the benchmark, an operator, an auditor, a verdict, a supervisor, a reviewer, or the plugin under test — because a cell told it is being measured stops being a measurement.

An abnormal interruption or an explicit cancellation is a recovery event. Stop, read [recovery.md](recovery.md), and diagnose before touching anything.
