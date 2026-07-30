# Running A Benchmark

## Operator Contract

The benchmark is executed by coding agents and supervised by an operator agent. Starting controller processes is the beginning of the work, not the hand-off point.

Before any measured agent turn starts, verify that every engine, subject, and arm cell in the selected wave passed preparation. A failed or incomplete preparation stops the complete wave before model use.

Observe every active cell at least once every 30 seconds throughout the run. At each pass, read `run.json`, controller and model-process liveness, the latest raw stdout and stderr, recent commands, and the generated workspace. A status label without its process and stream evidence is not an observation.

The 30-second observation interval is an operational recovery requirement, not a pull-request reporting interval. Refresh the campaign pull-request body every 10 minutes, but handle an interruption, question, suspicious completion, stalled stream, failed gate, or newly discovered shared defect immediately.

Use two separate agents when the campaign is large enough to justify delegation:

- a liveness supervisor that checks every active cell at least once every 30 seconds and immediately resumes or escalates it; and
- a read-only reporting subagent that refreshes the pull-request body every 10 minutes from retained state, usage, logs, and workspace inventories.

The reporting subagent never edits a measured workspace, frozen input, campaign source, or result ledger. Stop both agents when the campaign ends.

## What The Raw Stream Means

Each engine writes its native JSON events one per line to `logs/*.stdout.jsonl`. These JSONL files are execution evidence, not requirement documents: they retain session creation, tool and command activity, file changes, completion claims, native token usage, and provider errors.

`Selected model is at capacity` is a provider availability failure. It does not mean the task was too difficult, the agent chose to stop, or the workspace failed. Preserve the attempt and resume it when capacity returns.

## Observation Loop

For each cell:

1. Confirm the controller or resume controller is alive.
2. Confirm `run.json` agrees with the process state.
3. Inspect the newest JSONL and stderr rather than relying on file age alone; a long command may legitimately keep one event open.
4. Inspect the workspace and current gate when the stream reports failure, completion, a question, or no meaningful progress.
5. Classify the cell as progressing, recoverably interrupted, legitimately blocked, invalidated, or provisionally complete.
6. Take the matching action and record material findings in the campaign pull request.

An agent asking whether to continue, proposing to split the authorized work, or reporting completion before the prescribed gates is not a terminal result. Continue with the next retained review or final turn. Do not add arm-specific hints or improvised implementation advice; the prescribed user-turn sequence must remain the common intervention surface.

## Resuming A Cell

Resume an interrupted cell with its exact engine, subject, arm, and run ID:

```bash
pnpm --filter @samchon/evidence-benchmark resume -- <engine> todo evidence <run-id>
```

Resume reuses the retained workspace, nested Git history, frozen instructions, runtime assignment, engine session, logs, elapsed time, and token ledger. It skips only the accepted canonical prefix. A final turn is retained only while its current lint-restoration seal still matches; otherwise that turn and every accepted successor are invalidated, and execution restarts from that boundary.

Codex and Claude Code measured launches and resumes use the installed local CLIs, the same authenticated accounts, and each CLI's native non-interactive YOLO flag. Retain the exact model, session, structured-output, tool, mutable-settings, and frozen-input invocation. Reject a controller environment whose variable names identify credentials or proxies before starting a model process. Report that model-launched shell commands are not filesystem- or network-isolated; do not reintroduce an adapter-owned permission or OS-sandbox policy.

A launched command is not proof of recovery. Verify all three:

- the new controller is alive;
- `run.json` returned to `running`; and
- the new attempt JSONL shows session or command activity.

Provider capacity may interrupt the same turn repeatedly. A run-scoped watcher may check every 30 seconds and retry only when the latest retained failure proves the same capacity error. It must not retry setup, build, test, tool-policy, unknown, or product failures, and every retry remains part of cumulative accounting.

## Shared Template Repairs

Prefer a new clean run after discovering a shared input defect. When the user explicitly chooses to salvage an expensive active wave for a small common template defect, use a recorded common repair instead of editing workspaces by hand.

First stop the affected model processes and verify every selected Codex and Claude Code evidence and plain cell is `interrupted`. Disable any capacity auto-resumer during the repair. Correct and validate the source template for future runs, then create one workspace-relative unified text patch below `benchmark/.work/repairs/`.

Apply the same patch to both engines and both arms of every selected subject:

```bash
pnpm --filter @samchon/evidence-benchmark repair -- --patch benchmark/.work/repairs/<fix>.patch <run-id> todo reddit
```

The repair command admits every cell before changing any, rejects requirement, package-archive, Git, dependency-directory, binary, deletion, rename, and symlink targets, commits only the common patch targets as a nested-workspace operator commit while preserving unrelated agent work, records the exact patch and SHA-256 under each run's `interventions/`, separates repair time from agent time, and rolls back already changed cells if the transaction fails.

A patch applied before any model turn is a frozen-input hotfix. A patch applied after measured work is an operator intervention and qualifies the comparison even when both engines and both arms receive identical bytes. Report that qualification in the pull request and final result. If the patch changes requirements, arm semantics, task difficulty, or cannot apply equally, invalidate the affected cells and launch a new run identity.

## Accepting Completion

Do not accept `status: completed` or an agent's final prose by itself. Verify:

- the skills-contract turn and every prescribed backend, frontend, and overall turn have exactly one accepted successful attempt in canonical order;
- the package-local and workspace terminal builds pass with every deferred evidence claim restored;
- lint, database preparation, backend tests, frontend tests, and runtime probes pass;
- requirement and test coverage are audited against the frozen corpus;
- no unexplained disabled claim, placeholder, simulated implementation, orphaned process, or ignored failure remains; and
- the final quality assessment names residual defects instead of converting uncertainty into success.

Failed capacity attempts remain in the token and time totals. Setup and operator-repair time remain separate.

## Campaign Reporting

Keep the pull-request body small. After its fixed intent and one campaign-status sentence, group the live dashboard under exactly `## Codex` and `## Claude Code`. Do not combine both engines in one status, turn, or implementation-scale table. Keep the same table order inside each engine section so a reader can compare them without searching.

```markdown
## Codex

| Project | Mode | Progress | Quality | Cost | Time |
| ------- | ---- | -------- | ------: | ---: | ---: |

## Claude Code

| Project | Mode | Progress | Quality | Cost | Time |
| ------- | ---- | -------- | ------: | ---: | ---: |
```

`Progress` names the current retained instruction, estimated completion, and state without unexplained abbreviations. `Quality` is `—` until the final audit and becomes only the short final score or verdict; diagnostic prose belongs in a formal review. `Cost` shows total native token usage in whole millions and the selected model's standard API-equivalent price in whole dollars, using `<1M` below one million and never writing a decimal token or dollar value. `Time` is the sum of actual model-process turn durations rounded to whole seconds. Setup, materialization, installation, the launch barrier, controller admission, reporting, and other pre-agent time are reported separately and never enter this table.

Record causes, recoveries, interventions, completed phases, scoring evidence, and clean self-review rounds as formal `COMMENT` pull-request reviews. Do not add that narrative to either engine dashboard. Update the body immediately when a visible state is wrong; do not wait for the next 10-minute pass.

Within each engine section, keep a compact turn breakdown for that engine's cells across `skills-contract`, `backend/start`, `backend/review`, `backend/final`, `frontend/start`, `frontend/review`, `frontend/final`, `overall/review`, and `overall/final`. The skills contract becomes measured work only when the engine child process starts; a CLI or configuration failure before model activity is a launch failure, not a completed skills-contract turn. Every completed or active turn reports cumulative whole-million native tokens, whole-dollar API-equivalent cost, and whole-second model-process duration.

Below each engine's turn breakdown, report that engine's implementation scale as counts rather than names. Count database tables, API operations, DTO types and properties, and test functions for each cell. Do not enumerate table or operation names in the pull-request body; detailed inventories belong in a formal review.

The reporting subagent edits the existing body in place every 10 minutes. It updates values inside the two fixed engine sections without changing their structure, appending a new status comment, or replacing detailed formal reviews with dashboard prose.

## Canceling A Campaign

When the user explicitly cancels the benchmark and rejects its partial results:

1. stop the 10-minute reporting subagent and any 30-second liveness or capacity watcher;
2. stop every selected cell controller, model process, server, and owned descendant;
3. verify no process still references the canceled run roots;
4. resolve the exact ignored `benchmark/.work/` and `benchmark/result/` paths inside the campaign worktree; and
5. delete those two trees without touching requirements, templates, instructions, shared caches, source changes, or the independently maintained result repository.

The deletion is destructive. State which local trees were removed and that the partial run cannot be resumed.

## Publishing An Accepted Result

Publish only an operator-accepted completed run. Results share one independently maintained repository:

```text
<agent>/<model>/<project>/<evidence|plain>/
```

Record the final audit as `benchmark-report.json` beside the run state. Publication is always a separate explicit command naming both the public repository and its clean local checkout:

```bash
pnpm --filter @samchon/evidence-benchmark publish:result -- --repository <owner/name> --checkout <local-path> --public <engine> todo evidence <run-id>
```

There is no default owner, repository, or checkout. The command requires the authenticated `gh` login to equal the repository owner; verifies public visibility, matching GitHub origin, clean current branch, remote parity, successful turns, frozen inputs, the completed-workspace digest, report, and evidence archive; rejects symlinks and private environment files; and replaces only the selected result leaf. It pushes one commit and proves the remote commit equals it. A pre-push failure restores the prior local leaf.

The published leaf contains the completed application, result identity, audit report, and no raw logs, controller state, nested workflow, nested Git state, dependency directory, or private environment. Evidence leaves retain `.benchmark-deps/*.tgz` because the generated lockfile uses that local package as the measured product.
