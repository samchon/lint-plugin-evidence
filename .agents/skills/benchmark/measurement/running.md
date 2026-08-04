# Running A Campaign

One cell is one native session driven through its arm's eight objectives. The operator freezes the inputs, launches, and watches; the runner prepares the workspace, sends every objective, and retains the record.

## Open The Campaign

1. Open the campaign issue.
2. Use the campaign branch in the repository's single worktree.
3. Push an empty campaign commit and open a draft pull request.
4. Record the authorized matrix, benchmark revision, engines, models, efforts, CLI versions, Evidence archive digest, and live dashboard in the pull-request body.
5. Assign one read-only reporting subagent to update that body every 5 minutes and immediately after a state change or anomaly.

## Launch A Cell

Freeze every input before launch, and never launch an unauthorized cell or rerun:

- **Identity** — subject, arm, engine, model, effort.
- **Material** — requirements, template, instructions, package archive.
- **Version** — CLI version, benchmark revision.

[intervention/boundary.md](../intervention/boundary.md) owns what may change and when.

The runner reads the benchmark revision from the repository's `HEAD` and refuses to launch while anything is uncommitted or untracked, so commit or stash first.

```bash
pnpm --filter @samchon/evidence-benchmark start codex <subject> <evidence|plain> <model> <effort>
```

Run at most one command for a run ID.

A launch that fails before native work does not consume the authorized cell, as long as its identity and frozen inputs are unchanged. Two such failures are ordinary: an unclean repository, and an occupied port from the cell's own block, whose map [intervention/recovery.md](../intervention/recovery.md) owns.

## What The Runner Prepares

Each cell gets a new ignored workspace, prepared before any model use:

1. Copy `benchmark/template/base` and render its variables.
2. Apply `benchmark/template/<arm>` over it. Plain receives no Evidence package, tag, rule, carrier, or guidance.
3. Copy `benchmark/requirements/<subject>/` byte-for-byte into the workspace's `docs/analysis/`.
4. For Evidence only, install the locally packed Evidence archive. Parallel Evidence cells share one immutable archive and each pins its SHA-256; Plain never reads or installs it.
5. Run `pnpm install`.
6. Initialize the workspace as a Git repository and commit the prepared baseline.

Instructions are never copied into the workspace. The runner reads each Markdown file from this repository when its objective starts, and records the exact text it sent.

## The Objective Sequence

One native session receives its arm's frozen base sequence, read from `benchmark/instructions/<arm>/<scope>/<step>.md`:

`backend-start` → `backend-review` → `backend-final` → `frontend-start` → `frontend-review` → `frontend-final` → `overall-review` → `overall-final`

`EvidenceBenchmarkInstruction.entries()` is the only authority on that sequence.

The runner joins each objective with the same arm's `instructions/<arm>/continue.md` once, and a Plain reminder or Final also carries its own scope's Review instruction quoted beneath it. An operator warning is the one exception: outside a Plain reminder or Final it replaces the continuation rather than joining it, because `backend/start` already fills 3923 of the 4000 characters Codex accepts.

The arms share no runtime instruction bytes. Do not add operator prose.

Only Plain stops at a Review boundary; Evidence runs the eight objectives without stopping. [plain-review.md](plain-review.md) owns that loop.

## What Is Retained

Every run directory holds the record the campaign is reported from:

- `state.json` — cell identity, frozen inputs, instruction plan and cursor, status, checkpoints, processes, and review history.
- `events.jsonl` — the complete native stream with observation and process-relative times.
- `<stage>.log` — one file per objective in the run root, named after the Goal that owned the thread when the chunk arrived: `backend-start.log`, `backend-remind-3.log`, `overall-final.log`. Reading them in objective order reproduces the native stream exactly, and a resumed run appends to the same file.

Stage names in the logs and on the dashboard are one vocabulary.

Setup time stays separate from model-process time, and the record carries no build, lint, quality, or completion verdict.

## Supervise

Observe every active cell at least every 30 seconds:

- `state.json`, and benchmark and native process liveness.
- The recency of `events.jsonl` and of the current stage's `<stage>.log`.
- The frozen configuration files in every cell. The reporting subagent re-reads them on every cycle and reports a hit as a material change, quoting the diff it just read. [integrity.md](integrity.md) owns what is a hit and what is the cell doing its job.

Correct the dashboard on any disagreement immediately, without waiting for its 5-minute interval.

Take anything else to [intervention/SKILL.md](../intervention/SKILL.md), and diagnose before touching it.
