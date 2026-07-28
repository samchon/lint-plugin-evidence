# Evidence benchmark

This benchmark generates the same full-stack application with and without `@samchon/lint-plugin-evidence`, then measures time, provider tokens, completion honesty, artifact scale, semantic requirement coverage, test quality, and the cost of a fixed post-completion discovery campaign.

The benchmark is expensive and the current protocol intentionally blocks paid launch while required pins remain null. Read `.agents/skills/benchmark/SKILL.md` and `protocol/README.md` before operating it.

## What belongs here

```text
benchmark/
  README.md
  requirements/<subject>/       frozen authored specifications and grading inventory
  template/{base,plain,evidence}/
  prompts/                      frozen arm-neutral user, goal, challenge, and campaign prompts
  protocol/                     frozen procedure, schemas, pins, price sheet, and priors
  src/                          materializer and Codex runner
  fixtures/                     deterministic runner and materializer fixtures
  .work/<run-id>/               temporary live workspace; never a canonical result
  result/<subject>/<arm>/
    latest.json                 pointer to the latest retained completed run
    workspace/                  reproducible t_dry project snapshot for the latest run
    runs/<run-id>/              immutable records, streams, snapshots, findings, and grades
```

`benchmark/.work/` is transient and ignored. `benchmark/result/` is retained because each latest workspace is also the future demo-repository source. Updating `latest.json` and `workspace/` never deletes prior run records.

Every terminal attempt is appended under `runs/<run-id>/`, including failed and interrupted rows. Only a completed run that reached `t_dry` may validate `protocol/schema/result-promotion.schema.json`, update `latest.json`, and replace the demo `workspace/` from its sealed reproducible `t_dry` project snapshot. The canonical `runs/<run-id>/workspace/` and demo `workspace/` exclude dependencies, caches, build output, runtime SQLite/WAL files, and Playwright output while retaining source, tests, configuration, documentation, lockfiles, migrations, assets, and the Evidence archive required by the relative `file:` dependency. The run record separately inventories the full live workspace used by gates. Promotion reopens the record in a fresh process, verifies raw references, envelope and event chains, and absence of orphan tails, then proves all prior run directories remain unchanged.

## Experiment cells

| Directory  | Registered arm | Meaning                                  |
| ---------- | -------------- | ---------------------------------------- |
| `plain`    | A — Control    | Exhaustive manual obligation campaigns   |
| `evidence` | B — Treatment  | Evidence graph and graph-directed review |

Run subjects in cost order: Todo, Reddit, Shopping, ERP. Each subject × arm cell requires at least three runs. Todo and Reddit launch as one randomized four-run concurrency block for each replicate; later comparisons preserve their own block topology.

Shopping's frozen corpus has six Markdown documents, H2=93, H3=471, and 2,083 acceptance rows. It includes the complete coupon, discount, promotion, and stacking surface. Its size and frozen prior do not authorize a paid run; the later-wave merge, runner, grader, fixtures, price source, and explicit cost gate still apply.

ERP has seven Markdown files: five narrative documents, the corpus contract, and the table of contents. Its final corpus contract separates 1,724 H3-owned acceptance criteria for product-quality coverage from 986 H2-owned context criteria for integration and context conformance. The two population digests, counts, ratings, and percentages are pinned and reported separately; they are never summed. ERP remains a later-wave subject and cannot launch until the merged corpus and the runner, grader, report, and valid/invalid fixtures all prove this dual-denominator contract.

## Materialization

Preparation performs no model call.

1. Verify that the exact source SHA is merged and all repository, materializer, package, and runner suites are green.
2. Run the neutral full-stack scaffold install, build, database, test, and browser smoke once for the exact template revision, before either arm is materialized. This revision gate is not repeated inside every experimental cell.
3. Pack the actual `@samchon/lint-plugin-evidence` package from that SHA before creating any project workspace, then run an isolated consumer smoke that proves the tarball installs, imports, and loads its native component. A broken package never reaches a paid cell.
4. Render the common full-stack scaffold, SQLite variant, shared benchmark base, and selected arm overlay through one deterministic path-to-content renderer.
5. Copy the complete selected subject directory from `benchmark/requirements/<subject>/` into `docs/analysis/` byte-for-byte, including its corpus contract and `acceptance-criteria.jsonl`. This is the user-supplied specification in both arms; only hidden acceptance and grading artifacts remain harness-side.
6. Copy and install the tarball through a relative `file:` dependency only in an Evidence cell. A Plain cell records the same product-artifact digest in its outer experiment manifest for block provenance but receives neither the archive bytes nor the dependency. Independently resolve and install each cell's lockfile; cells never share an installed dependency tree.
7. Record the effective tree, prompt, goal, challenge, recovery prompt, campaign, clause inventory, hidden suite, toolchain, package, and price-sheet digests.

Do not run an arm-specific evidence lint or native compile as a pre-`t0` baseline. Its first execution and every resulting diagnostic belong to the measured product-method cost after `t0`. Any unexpected overlay collision, missing requirement file, acceptance-inventory mismatch, absolute local dependency, changed lockfile, failed neutral-template revision gate, failed tarball consumer smoke, or failed per-cell install stops preparation.

## Required CLI contract

Packaging must expose the following commands before the first paid run. They are the operator contract for the materializer and runner; if any command is absent, launch remains blocked.

```bash
pnpm benchmark -- prepare --plan benchmark/plans/todo-reddit-r1.json
pnpm benchmark -- start --plan benchmark/plans/todo-reddit-r1.json
pnpm benchmark -- status --run <run-id>
pnpm benchmark -- resume --run <run-id>
pnpm benchmark -- abort --run <run-id> --reason "<specific reason>"
pnpm benchmark -- grade --run <run-id>
pnpm benchmark -- report --block <block-id>
```

`prepare` performs every deterministic launch check and writes an immutable plan and run manifests without contacting the model. `start` refuses an unprepared or digest-mismatched plan and launches the complete block. The other commands address one preserved run by ID. In this Codex revision, `resume` may inspect and terminally seal a stale record but cannot continue measured generation after app-server or transport death.

Do not substitute a direct `codex exec`, interactive Codex session, or hand-written app-server request. The pinned runner owns Goal activation, same-thread continuation, raw usage, descendant threads, checkpoints, and exact stream preservation.

## Cost gate

Every plan states:

- P50 and P90 wall-clock by cell and block;
- P50 and P90 non-cached input, cache read, cache write, output, and provider-total tokens;
- P50 and P90 provider credits and USD when an applicable official conversion exists;
- starting account quota or credit state;
- hard credit and wall-clock limits;
- the human authorizer and UTC authorization time.

Preparation verifies the exact `protocol/price-sheet.json` digest and the tracked experimental app-server schema snapshot at the pinned path, including its file count, byte count, and tree hash. It fails while `price-sheet.json.launchGate.blocked` is true, an execution-critical provider-credit rate or token semantic is unavailable, an official-source snapshot is unpinned, the exact schema tree differs, or effective thread tier and speed mode differ from the sheet. An explicitly unavailable USD conversion remains null and does not block a provider-credit run. Operators cannot bypass the execution-critical gate with a CLI flag; resolving it requires a formal protocol checkpoint before any cell starts.

The experiment requests Codex service tier `default`, which is the Standard Terra path and omits an upstream priority override. Fast/`priority` is not part of this experiment: it carries a 2.5× credit multiplier and would invalidate the price sheet and the current prior. The runner records requested settings, effective `thread/start` settings, and any `model/rerouted` notification; it fails closed on a mismatch or reroute.

Raw `inputTokens` is inclusive. The runner requires `cachedInputTokens + cacheWriteInputTokens <= inputTokens`, calculates `nonCachedInputTokens = inputTokens - cachedInputTokens - cacheWriteInputTokens`, and bills mutually exclusive categories exactly once. It prices each deduplicated atomic raw response, updates cumulative credits durably, and checks the authorization before every next provider request. A response already in flight may cross the ceiling because its final usage is unknowable; that one atomic overshoot is recorded exactly, no later provider request is sent, and the attempt is right-censored as `budget_exhausted`. Starting a request while cumulative credits already meet or exceed the ceiling is an integrity failure.

A hard limit does not make partial work disappear. The runner checkpoints, terminates the process tree, records `interrupted` with the quota or budget reason, seals all streams, inventories the live workspace, preserves a reproducible project snapshot, and keeps the row as right-censored data.

## Start and live monitoring

`start` stages the frozen Goal objective with status `paused`, sends the exact first utterance with the frozen terminal structured-output schema, waits for that user turn's `turn/started`, records `t0`, and then activates the same Goal by omitting the objective and setting only `status = active`. This marks the current turn Goal-active without injecting objective text, so the first utterance must contain every substantive requirement and the Goal may contain only persistence and completion conditions. Staging an active idle Goal is forbidden because Codex `0.145.0` would auto-start a Goal-only turn before the measured user prompt. It writes:

```text
<run>/
  manifest.json
  state.json
  heartbeat.json
  checkpoint.json
  logs/
    client.raw.jsonl
    server.raw.jsonl
    stderr.raw.log
    transport.envelopes.jsonl
    runner.events.jsonl
  rollouts/
  gates/
```

Monitor through `status`, `heartbeat.json`, and append-only events. Do not edit a live workspace, send ad hoc messages, or run competing commands inside it. The sole post-claim user intervention is the frozen completion challenge, sent only after `t_done` and its immutable snapshot.

The runner records `t0`, `t_done`, `t_green`, and `t_dry` exactly once. `turn/completed` alone does not establish `t_done`: the terminal assistant item must validate with `outcome = complete`. A valid `outcome = interrupted` right-censors the run and forbids the completion challenge; malformed or missing output is a preserved runner failure. An agent claim does not establish `t_green`; only harness-owned build and test gates do.

## Resume

Codex `0.145.0` cannot preserve exact raw usage across an app-server restart. `experimentalRawEvents = true` exists only on `thread/start`; `thread/resume` creates its listener with raw events disabled and exposes no parameter to re-enable them. Therefore app-server or controller-transport death right-censors the attempt. It cannot be resumed into a completed comparison cell.

1. Confirm no controller, app-server, child tool, or generated application process still owns the run root.
2. Run `status` and inspect the terminal reason, heartbeat age, checkpoint digest, manifest digest, thread ID, Goal status, outstanding turn, completion-challenge state, clean streak, and exact-usage reconciliation.
3. `resume` reopens and verifies the append-only record, inventories and snapshots the partial workspace, and seals the attempt `interrupted`; it does not call `thread/resume` or send another model turn.
4. Preserve the partial workspace, all exact usage observed before loss, interruption interval, provider wait, and duplicate usage notifications. Deduplicate exact totals by upstream response ID and mark the row right-censored.
5. Any replacement attempt receives a new run ID and a fresh workspace and thread. It does not inherit partial output, elapsed time, tokens, or Goal state from the censored attempt.

The disabled recovery-continuation prompt is a guard artifact only and is never sent in a valid exact-token run. A future protocol may enable continuation only after a real same-live-app-server, lossless-transport reattachment fixture proves raw events, response IDs, effective thread settings, and token usage remain complete.

## Abort

Use abort only for a named integrity, safety, cost, or operator reason.

```bash
pnpm benchmark -- abort --run <run-id> --reason "<specific reason>"
```

Abort writes a final checkpoint, stops the controller and complete descendant process tree, verifies liveness has ended, records `interrupted` with subtype `user_abort`, inventories the live workspace, preserves a reproducible project snapshot, reconciles exact usage, and seals the run. It does not delete or relabel the row.

When an unmerged tree, digest mismatch, broken shared path, weakened gate, incorrect prompt, or invalid measurement is discovered, abort every affected live cell. Record the cause and cost, correct the whole consequence surface, merge and validate the fix, and begin a new protocol revision. Never repair an experimental input in place.

## Phase 2 and grading

After `t_done`, the fixed completion challenge runs on the same thread. Phase 2 then creates a neutral stripped bundle for four fresh-context finders, adversarially verifies deduplicated candidates, and sends only verified findings to the arm-aware fixer. Two consecutive valid rounds with zero new verified findings establish `t_dry`.

Blind grading runs at both `t_done` and `t_dry`. The primary denominator is the corpus-supplied `acceptance-criteria.jsonl`, not heading count. Two independent graders assess every clause, and a human audits the frozen sample plus every disagreement, critical result, `not_applicable`, and `unverifiable` rating.

The live workspace is always built and tested. Its full path, size, file-kind inventory, and gate identity remain measurement evidence, but it is not copied wholesale into Git. The retained project snapshot is the reproducible source artifact, and the stripped bundle is for neutral discovery and grading only.

## Results and reporting

Every terminal run is appended to the permanent GitHub results ledger in [issue #99](https://github.com/samchon/lint-plugin-evidence/issues/99) with UTC, setup and generation time, each token category, provider credits, interruption or failure state, artifact scale, independent gates, semantic coverage, campaign findings, and grading reliability. Failed and interrupted attempts remain visible.

Predictions under `protocol/predictions/` are never edited after observation. Measurements come only from live run records. Any reconstructed, model-attributed, or extrapolated value is labelled as an estimate and cannot replace an exact field.

The machine-local `.wiki/` keeps Korean research and design decisions. It is not the permanent result ledger.

## Safe document checks

Frozen requirements, prompts, protocol, templates, and results are excluded from formatting. Validate syntax without rewriting them:

```powershell
Get-ChildItem benchmark/protocol -Recurse -Filter *.json |
  ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json | Out-Null }
git diff --check
pnpm exec prettier --check benchmark/README.md
```

Do not run Prettier over `benchmark/prompts/` or `benchmark/protocol/`. A post-run whitespace-only change is still an experimental input change.
