# Evidence benchmark

This benchmark compares coding agents building the same application with and without `@samchon/lint-plugin-evidence`. It retains the complete generated project and measures elapsed time, native token usage, API-equivalent cost, requirement and test coverage, implementation scale, gate behavior, completion honesty, and product quality.

Campaigns use Codex `gpt-5.6-terra` with `high` effort and Claude Code `sonnet-5` with `high` effort. Every run records the engine, exact model, effort, CLI version, and invocation. The current runner launches Codex cells; Claude Code cells must not start until their engine adapter and deterministic proof are implemented on the campaign revision.

## Active supervision is required

The coding agent is the measured instrument. Starting the runner and waiting for its process to end is insufficient: an operator agent must inspect each live stream and workspace, resume recoverable interruptions, reject premature completion, run the prescribed follow-up turns, and audit the final gates and semantics.

Codex writes one JSON event per line to `logs/*.stdout.jsonl`. These JSONL files are execution logs, not requirements; they retain thread IDs, commands, file changes, token usage, completion claims, and provider errors.

`Selected model is at capacity` is a transient model-server availability failure, not the coding agent giving up or the project failing. The runner retains that cell so the operator can resume the same thread, workspace, frozen inputs, logs, elapsed time, and token ledger. Repeated capacity failures may be handled by a run-scoped watcher that retries only after the latest failure proves the same provider error.

## Campaign pull request

Treat the benchmark as an issue campaign. Keep one campaign pull request open until every authorized wave finishes. Push deterministic runner, template, instruction, and plugin corrections to that pull request, and record detailed findings, interruptions, recoveries, interventions, and completed phases as formal `COMMENT` reviews.

Assign a dedicated read-only reporting subagent to edit the pull-request body in place every 15 minutes. Keep only this dashboard in the body:

| Project | Mode | Progress | Quality | Cost | Time |
| ------- | ---- | -------- | ------: | ---: | ---: |

`Progress` gives the current retained instruction, state, and estimated completion. `Quality` is provisional until final audit. `Cost` contains native token categories and API-equivalent cost. `Time` is cumulative elapsed duration without timestamps. Keep a compact per-phase token, cost, and duration breakdown for all nine retained instructions, then report database-table, API-operation, DTO-type, DTO-property, and test-function counts for each cell. Report counts, not names.

The reporting subagent reads retained state, logs, usage, and workspace inventories. It never edits a measured workspace, frozen input, campaign source, or result ledger. The separate liveness supervisor still inspects every active cell at least once every 30 seconds and handles failures immediately.

## Layout

```text
benchmark/
  prompts/       retained baseline-wave user turns
  instructions/ backend-first gated user turns
  requirements/  subject specifications copied into docs/analysis
  template/      shared scaffold plus evidence and plain overlays
  src/           materialization, runner, recovery, repair, and publication code
  result/        ignored local runs and latest successful demo workspaces
  .work/         ignored package, controller, repair, and reporting state
```

Each attempt lives under `benchmark/result/<subject>/<arm>/runs/<run-id>/`. A cell that reached a Codex turn remains there when interrupted so it can resume. The latest successful demo is promoted to `benchmark/result/<subject>/<arm>/workspace/`; setup failures that never entered measured work may be removed.

## Verify before model use

Install the repository and run the deterministic benchmark checks:

```bash
pnpm install --frozen-lockfile
pnpm --filter @samchon/evidence-benchmark check
pnpm --filter @samchon/evidence-benchmark test:unit
pnpm --filter @samchon/evidence-benchmark test:package
pnpm --filter test-benchmark start
```

The package smoke installs the locally packed product into a materialized Evidence workspace. The consumer-shaped template proof materializes the Plain workspace, installs its declared dependencies, and runs the backend build followed by the backend test. `.github/workflows/benchmark.yml` runs that Plain proof on Ubuntu and Windows for relevant pull-request changes.

The evidence overlay additionally installs the locally packed product during benchmark materialization. Plain records the same package identity without receiving the package.

## Plan and start

Run Todo and Reddit first, with evidence and plain arms concurrent within each subject wave. Run Shopping and ERP only after the cheaper subjects complete successfully.

Those four directories are the current campaign corpus, not an execution allow-list. Any 1-63 character lowercase subject slug made from letters, digits, and hyphens, except Windows device names, enters the same plan, materialization, runtime, recovery, repair, and publication paths when it owns a complete `benchmark/requirements/<subject>/` Markdown corpus. The runner assigns ports from the selected wave order, never from a subject-name table.

Inspect the exact wave without a model call, then launch it from the same clean, validated, pushed commit:

```bash
pnpm --filter @samchon/evidence-benchmark plan -- todo reddit
pnpm --filter @samchon/evidence-benchmark start -- todo reddit
```

Use `--port-base` to move the complete disjoint port allocation when the default range is occupied:

```bash
pnpm --filter @samchon/evidence-benchmark start -- --port-base 50000 todo reddit
```

`start` packs and verifies the product once, materializes and installs every selected evidence/plain cell, then starts them concurrently. It freezes the requirement and instruction bytes before the first turn, records the rendered workspace and package identities, captures the four canonical lint configurations, creates and installs a frozen pnpm lockfile, and journals `run.json` after each attempt. Evidence final turns must restore the exact lint bytes and literal claim populations selected for their phase before the runner accepts them. Build, lint, database, backend-test, frontend-test, runtime, coverage, and quality acceptance remains an operator audit; the runner does not infer those results from a zero Codex exit status.

The runner assigns each subject and arm distinct API, Swagger, Vite development, and Playwright ports. It checks every selected port before packaging or model use, exports the assignments to agent child processes, persists their fixed values in package-local `.env` files, and records them in `run.json`. Pnpm, ttsc, Go build/module/workspace, Playwright, and operating-system temporary caches are cell-local below the writable run root and excluded from results. A deny-by-default Codex permission profile gives model tools write access only to the measured workspace and its run-owned cache tree, minimal runtime reads, loopback network access, and a credential-free allowlisted child environment. The deterministic harness tests the serialized profile and rejects dangerous sandbox bypasses, inherited secret environments, and upstream proxy credentials.

## Observe and resume

Inspect every active cell at least once every 30 seconds: read its `run.json`, controller liveness, newest stdout JSONL and stderr, current workspace, and active gate. Revive a recoverable interruption immediately. Separately, update the campaign pull-request body every 15 minutes with only Project, Mode, Progress, Quality, Cost, and Time; report interruptions, recoveries, defects, interventions, and completed phases as formal `COMMENT` reviews.

Resume a recoverably interrupted cell with its exact identity:

```bash
pnpm --filter @samchon/evidence-benchmark resume -- todo evidence <run-id>
```

Recovery is proven only when the controller is alive, `run.json` is `running`, and a new attempt JSONL contains activity. A successful launch command alone is not proof.

The complete operator procedure, including stalled streams, questions, premature completion, repeated provider capacity, repairs, acceptance, reporting, and publication, is in [the benchmark running skill](../.agents/skills/benchmark/running.md).

## Cancel a campaign

When the user cancels a campaign and rejects its partial results, first stop the 15-minute reporting subagent, 30-second supervisor, capacity watchers, cell controllers, model processes, servers, and their owned descendants. Verify that no process references the canceled run roots. Then delete the exact ignored `benchmark/.work/` and `benchmark/result/` trees inside the campaign worktree.

Do not delete requirement corpora, templates, instructions, shared caches, source changes, or the independently maintained result repository. Deleted local run data cannot be resumed.

## Instruction sequence

The backend-first workflow uses nine user turns on one Codex thread.

| Step            | Evidence                     | Plain                     |
| --------------- | ---------------------------- | ------------------------- |
| Skills contract | `skills-contract.md`         | `skills-contract.md`      |
| Backend start   | `backend/start.md`           | `backend/start.md`        |
| Backend review  | `backend/review.md`          | `backend/review.md`       |
| Backend final   | `backend/evidence-final.md`  | `backend/plain-final.md`  |
| Frontend start  | `frontend/start.md`          | `frontend/start.md`       |
| Frontend review | `frontend/review.md`         | `frontend/review.md`      |
| Frontend final  | `frontend/evidence-final.md` | `frontend/plain-final.md` |
| Overall review  | `overall/review.md`          | `overall/review.md`       |
| Overall final   | `overall/evidence-final.md`  | `overall/plain-final.md`  |

Arm-specific method instructions stay inside the corresponding template overlay.

Each turn explicitly enables Goal mode and treats its complete instruction as that stage's bounded objective and completion criteria. At wave launch, the runner reads every instruction once, copies the exact bytes into each cell's `inputs/instructions/`, and records their aggregate hash in `run.json`. Later source edits cannot change an active or resumed cell's remaining turns.

`benchmark/prompts/` retains the three user utterances for the legacy single-goal baseline. The current backend-first runner does not read them.

## Apply a common template repair

Prefer a corrected new run. If an expensive active wave must be salvaged after a small common template defect, first stop the affected model processes, disable any capacity watcher, and verify every selected evidence and plain cell is `interrupted`. Correct and validate the source template, then create one workspace-relative unified text patch below `benchmark/.work/repairs/`.

```bash
pnpm --filter @samchon/evidence-benchmark repair -- --patch benchmark/.work/repairs/<fix>.patch <run-id> todo reddit
```

The command dry-runs every selected cell before changing any, applies the same text patch to both arms, records its bytes and SHA-256 under each run's `interventions/`, excludes repair time from agent time, and rolls back on partial failure. It rejects changes to requirements, local package archives, Git metadata, dependency directories, binary files, deletions, renames, and symbolic links.

A repair applied after measured work is an operator intervention, even when both arms receive identical bytes. Report it as a comparison qualification. Requirement changes, arm-specific help, or unequal patches require a new run.

## Accept a result

`status: completed` is provisional. Before accepting a cell, verify all nine prescribed turns, build, lint, database preparation, backend tests, frontend tests, runtime behavior, requirement coverage, test coverage, enabled evidence claims, residual placeholders, and semantic quality. The runner records every attempt and accepts only successful turns in canonical order; Evidence final turns additionally carry exact lint-restoration seals. A rejected turn interrupts the cell. Failed capacity attempts remain in cumulative cost and time; setup and repair overhead remain separate.

Do not record absolute start or completion timestamps. Preserve total elapsed duration, native token categories, standard API-equivalent cost, commands and gates, first completion claims, implementation scale, coverage, quality findings, frozen-input identities, raw streams, and the final workspace.

## Publish an accepted result

Completed and operator-accepted applications belong in one independently maintained result repository:

```text
<agent>/<model>/<project>/<evidence|plain>/
```

Write the completed human-and-agent audit to `benchmark/result/<project>/<arm>/runs/<run-id>/benchmark-report.json`, then name both the public GitHub repository and its clean, up-to-date local checkout explicitly:

The report schema is strict. Identity and frozen-input hashes must match the run. `totalElapsedMs`, `agentElapsedMs`, `nonAgentElapsedMs`, accepted and rejected attempt counts, all four native token categories, and API-equivalent cost must equal the retained attempt ledger; cost is recomputed by subtracting cached input from total input and applying the report's per-million uncached-input, cached-input, and output prices. Record every terminal gate as `passed`, requirement and test coverage as covered/total pairs, implementation scale, the first completion claim and its honesty, a 0–100 quality score with summary and residual defects, and the sorted SHA-256 of every retained intervention.

```json
{
  "schemaVersion": 1,
  "status": "accepted",
  "project": "<project>",
  "arm": "<evidence|plain>",
  "runId": "<run-id>",
  "measurement": {
    "totalElapsedMs": 0,
    "agentElapsedMs": 0,
    "nonAgentElapsedMs": 0,
    "attempts": { "total": 0, "accepted": 0, "rejected": 0 },
    "tokens": {
      "input_tokens": 0,
      "cached_input_tokens": 0,
      "output_tokens": 0,
      "reasoning_output_tokens": 0
    },
    "pricingUsdPerMillion": {
      "input": 0,
      "cachedInput": 0,
      "output": 0
    },
    "apiEquivalentCostUsd": 0
  },
  "gates": {
    "build": "passed",
    "lint": "passed",
    "database": "passed",
    "backendTests": "passed",
    "frontendTests": "passed",
    "runtime": "passed"
  },
  "coverage": {
    "requirements": { "total": 0, "covered": 0 },
    "tests": { "total": 0, "covered": 0 }
  },
  "implementation": {
    "tables": 0,
    "apiOperations": 0,
    "dtoTypes": 0,
    "dtoProperties": 0,
    "testFunctions": 0
  },
  "completion": { "firstClaimTurn": null, "honest": false },
  "quality": {
    "score": 0,
    "summary": "<audit summary>",
    "residualDefects": []
  },
  "frozenInputs": {
    "sourceCommit": "<sha-1>",
    "instructionsTreeSha256": "<sha-256>",
    "requirementsTreeSha256": "<sha-256>",
    "completedWorkspaceTreeSha256": "<sha-256>"
  },
  "interventions": []
}
```

Replace the zeros with measured values; standard input and output prices must be positive.

```bash
pnpm --filter @samchon/evidence-benchmark publish:result -- --repository <owner/name> --checkout <local-path> --public todo evidence <run-id>
```

There is no default owner, repository, or checkout. The command requires the authenticated `gh` login to equal the named repository owner; proves the repository is public; proves the checkout has the matching GitHub origin, a clean `main` or `master` branch, and no remote drift; revalidates the retained JSONL terminal events and token usage, thread identity, model and isolation invocation, lint-restoration proofs, current workspace digest, strict report ledger, frozen inputs, intervention records, and evidence archive; then replaces only that agent/model/project/arm leaf in one commit. The report carries the operator's terminal-gate and quality audit; publication validates its schema and retained-ledger arithmetic but does not rerun those gates. Publication excludes private environment files, dependencies, nested Git state, and nested workflows. A pre-push failure restores the prior leaf; a successful push is verified against the remote branch.

Evidence results retain `.benchmark-deps/*.tgz` because their frozen lockfile installs the exact locally packed product measured by the run. Raw logs and controller state remain in this repository.

## Generated-project CI

Every generated workspace includes `.github/workflows/ci.yml`. On pushes and pull requests it performs a frozen pnpm install, full build, lint, SQLite preparation, backend tests, Chromium installation, and frontend Playwright tests. The workflow uses local CI-only environment values and requires no repository secrets.
