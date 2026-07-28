# Evidence benchmark

This benchmark generates the same full-stack application with and without `@samchon/lint-plugin-evidence`, then measures time, provider tokens, completion honesty, artifact scale, semantic requirement coverage, test quality, and the cost of a fixed post-completion discovery campaign.

The benchmark is expensive and the current protocol intentionally blocks paid launch while required pins remain null. Read `.agents/skills/benchmark/SKILL.md` and `protocol/README.md` before operating it.

## Current readiness

The tracked protocol is not yet authorized for a paid run. `protocol/pins.json` is the authoritative repository-static gate; `launchGate.blocked` is currently `true`, the subject-specific token and wall limits are unresolved, and the production runner, grading, promotion, and reporting vertical fixtures are not yet pinned green. `prepare` must fail closed in this state. Do not edit a pin, bypass the preflight, or invoke Codex directly to make progress.

Everything through the free validation section below is safe to run without model usage. A paid `start` becomes valid only after the exact benchmark implementation is merged, every repository and benchmark suite passes at that merged SHA, the selected wave's numeric safety pins are non-null, the formal issue-ledger checkpoints name that revision, `prepare` completes its zero-model live quota preflight, and the resulting four-cell plan validates without modification.

## Operator prerequisites

Operate from the repository root on the platform pinned by `protocol/pins.json`. The current protocol pins Windows x64, Codex `0.145.0`, signed-in ChatGPT authentication, `gpt-5.6-terra`, high reasoning effort, Standard speed, workspace-write sandboxing, and approval policy `never`.

The host needs Git, Node.js with Corepack, and enough disk for four independent full-stack workspaces, installed dependency trees, logs, snapshots, and retained results. The repository itself uses pnpm `10.6.4`; setup inside the harness and generated projects is launched through the separately pinned pnpm `10.10.0` wrapper in `src/EvidenceBenchmarkProcess.ts`. Do not replace either version with a machine-global package-manager default.

Install the repository without changing the lockfile:

```powershell
corepack enable
pnpm --version
pnpm install --frozen-lockfile
```

The version command must print `10.6.4`, matching the root `packageManager` field. The operator must also have a valid signed-in ChatGPT session available to the pinned Codex binary. API-key authentication, API billing, Fast mode, Priority processing, model fallback, or a different Codex binary defines a different experiment and is rejected by launch admission.

## Free validation

Run the complete free gate before preparing a plan:

```powershell
pnpm build
pnpm test:go
pnpm test:features
pnpm --dir benchmark check
pnpm --dir benchmark test
git diff --check
pnpm exec prettier --check benchmark/README.md
```

`benchmark check` validates the source contract and type-checks the harness. `benchmark test` runs deterministic unit, package, operation, runner, grading, reporting, and promotion fixtures exposed by the integrated package scripts; it must make no model call. The exact script set is the authority—do not treat the absence of a named vertical fixture from the installed revision as a pass.

Confirm the static gate without rewriting the protocol:

```powershell
node -e "const p=require('./benchmark/protocol/pins.json'); console.log(JSON.stringify(p.launchGate,null,2)); if(p.launchGate.blocked) process.exitCode=2"
```

An exit code of `2` means launch is deliberately blocked. It is not a request to edit `pins.json`.

## What belongs here

```text
benchmark/
  README.md
  requirements/<subject>/       frozen authored specifications and grading inventory
  template/{base,plain,evidence}/
  prompts/                      frozen arm-neutral user, goal, challenge, and campaign prompts
  protocol/                     frozen procedure, schemas, pins, price sheet, and priors
  src/                          materializer and Codex runner
  plans/<block-id>.json         prepared immutable four-cell operation plan
  .work/<block-id>/cells/<run-id>/
                                temporary live cell, operation journal, and workspace
  result/<subject>/<arm>/
    latest.json                 pointer to the latest retained completed run
    workspace/                  reproducible t_dry project snapshot for the latest run
    runs/<run-id>/              immutable run core plus append-only postprocess grades and report
```

Protocol fixtures live under `protocol/fixtures/`; executable test code lives under `src/`. `benchmark/plans/` and `benchmark/.work/` are operation state, not measured output. A plan is written once and copied into each cell as `operation-plan.json`; do not edit either copy after preparation.

`benchmark/.work/` is transient and ignored, but it is not disposable while a cell is live or its terminal result has not been durably published. `benchmark/result/` is retained because each latest workspace is also the future demo-repository source. Updating `latest.json` and `workspace/` never deletes prior run records.

Every terminal attempt is retained immediately under `runs/<run-id>/`, including failed, interrupted, and safety-limited rows. The runner seals an immutable canonical core containing the manifest, raw streams, event chain, usage, gates, snapshots, campaign, terminal state, and core digest. Later `grade` and `report` commands may only append content-addressed artifacts under the postprocess area; they bind the core seal and cannot rewrite core bytes or an existing postprocess byte.

A completed core does not update `latest.json` or the demo workspace. One final promotion owner may do so only after both independent grades and arm guesses exist for `t_done` and `t_dry`, a fresh third AI adjudicator has resolved the frozen disagreement queue, deterministic and secondary quality inputs are present, the final report validates, a fresh process verifies the core-to-postprocess digest chain, and the workspace Git round trip passes `result-promotion.schema.json`. The harness also emits the deterministic human-audit queue. A real human may complete it later; until then `humanValidationStatus = pending`, and reports forbid `human-validated` or composite-quality claims without blocking preservation, AI-graded comparison, or demo promotion. Concurrent promoters use compare-and-swap and one lock; stale-core, missing-report, early-promotion, core-mutation, and losing-concurrent-promotion attempts fail without changing pointers.

The canonical `runs/<run-id>/workspace/` and demo `workspace/` exclude dependencies, caches, build output, runtime SQLite/WAL files, and Playwright output while retaining source, tests, configuration, documentation, lockfiles, migrations, assets, and the Evidence archive required by the relative `file:` dependency. The run core separately inventories the full live workspace used by gates.

## Experiment cells

| Directory  | Registered arm | Meaning                                  |
| ---------- | -------------- | ---------------------------------------- |
| `plain`    | A — Control    | Exhaustive manual obligation campaigns   |
| `evidence` | B — Treatment  | Evidence graph and graph-directed review |

Run subjects in cost order: Todo, Reddit, Shopping, ERP. Each subject × arm combination requires at least three replicates; a cell is one subject × arm × replicate, so three replicates are three distinct cells. Todo and Reddit launch as one randomized four-cell concurrency block for each replicate; later comparisons preserve their own block topology.

Shopping's frozen corpus has six Markdown documents, H2=93, H3=471, and 2,083 acceptance rows. It includes the complete coupon, discount, promotion, and stacking surface. Its size and frozen prior do not authorize a paid run; the later-wave merge, runner, grader, fixtures, and explicit token-and-time safety gate still apply.

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

The integrated package must expose the following commands before the first paid run. They are the operator contract for the materializer and runner; if a command or its production adapter is absent, launch remains blocked.

```bash
pnpm --dir benchmark run benchmark -- prepare --plan benchmark/plans/todo-reddit-r1.json
pnpm --dir benchmark run benchmark -- start --plan benchmark/plans/todo-reddit-r1.json
pnpm --dir benchmark run benchmark -- status --run <run-id>
pnpm --dir benchmark run benchmark -- resume --run <run-id>
pnpm --dir benchmark run benchmark -- abort --run <run-id> --reason "<specific reason>"
pnpm --dir benchmark run benchmark -- grade --run <run-id>
pnpm --dir benchmark run benchmark -- report --block <block-id>
```

`prepare` requires `--plan`. It accepts `--subjects todo,reddit` or `--subjects shopping,erp`, `--replicate <positive integer>`, `--block <id>`, and an optional 64-hex-character `--seed`; the defaults are Todo/Reddit, replicate 1, a block ID derived from the plan filename, and a cryptographically generated scheduling seed retained in the plan. There is no `--authorization` escape hatch. Reviewed subject and wave safety limits come from tracked protocol pins, and the production adapter performs the zero-model native quota preflight before writing the plan.

`prepare` performs source admission, deterministic launch checks, materialization, isolated dependency setup, and plan publication without contacting the model. The plan path must be a new canonical path under `benchmark/plans/`; an existing plan is never overwritten. It contains exactly two preregistered subjects crossed with both arms for one replicate, records a randomized launch order, and binds all four cells to one block safety contract.

`start` refuses an unprepared, modified, stale, or digest-mismatched plan and launches the complete four-cell block. It does not accept a subject, arm, run ID, or safety override. `status`, `resume`, `abort`, and `grade` address one preserved cell by run ID; `report` addresses the complete block by block ID. `grade` and `report` reject a nonterminal cell, including `liveness_unknown`.

In Codex `0.145.0`, `resume` never resumes model generation. It verifies an abandoned `running` or `liveness_unknown` record, proves that the controller and descendants are dead, and seals the row as right-censored. If death cannot be proved, the state remains `liveness_unknown`; grading, reporting, promotion, lock release, and sibling continuation remain blocked.

The current tracked revision does not yet expose the complete production facade named by this section. Until it is integrated, merged, pinned, and proven by the vertical fixtures, these commands are a fail-closed interface contract rather than paid-run authorization.

Immediately before spawning the first paid child, `start` must perform a fresh native-quota recheck and the pinned environment, control-home, and public-safety scans, then bind their admitted results to the immutable operation record. These pre-spawn checks are still WIP launch blockers. There is no operator command or manual inspection that substitutes for their production implementation and vertical fixtures.

## Prepare and launch one four-cell block

The first paid wave is Todo and Reddit, both arms, one replicate at a time. Before launch, publish the preregistered P50/P90 time and provider-token vectors, the selected-wave safety limits, monetary status, quota attestation class, merged source SHA, and plan digest in the campaign ledger. Announcing them after observation does not satisfy preregistration.

Once the launch gate is genuinely open, prepare replicate 1:

```powershell
pnpm --dir benchmark run benchmark -- prepare --plan benchmark/plans/todo-reddit-r1.json --subjects todo,reddit --replicate 1
$plan = Get-Content benchmark/plans/todo-reddit-r1.json -Raw | ConvertFrom-Json
$plan.cells | Sort-Object launchOrder | Format-Table launchOrder,runId,subject,arm
```

Inspect the printed four rows and the plan's source, input, prior, quota-attestation, and safety identities. Do not edit the plan to correct an unexpected value; correct the source of the value, preserve the failed preparation record where applicable, and prepare a new plan ID.

Launch all four cells through the coordinator:

```powershell
pnpm --dir benchmark run benchmark -- start --plan benchmark/plans/todo-reddit-r1.json
```

Do not launch the four cells separately. The block-level deadline, observed-token guard, response-ID deduplication, shared stop record, and randomized concurrency order exist only when the coordinator owns the full block.

Repeat with a new plan and replicate number only after the preceding block has reached a durable terminal state and its integrity review is complete. Shopping and ERP use `--subjects shopping,erp`; they remain a separate later wave and cannot be mixed into a Todo/Reddit plan.

Do not substitute a direct `codex exec`, interactive Codex session, or hand-written app-server request. The pinned runner owns Goal activation, same-thread continuation, raw usage, descendant threads, checkpoints, and exact stream preservation.

## Cost gate

Every plan states:

- P50 and P90 wall-clock and provider-total-token priors for the `t_done` and `t_dry` milestones, bound to each selected subject and arm;
- provider credits and USD only when an applicable official conversion exists, otherwise the literal value `unavailable`;
- an observed-response provider-total-token threshold and hard-wall duration identical for both arms of the same subject and replicate, plus one aggregate observed-token threshold and hard-wall duration for the complete concurrency block;
- the exact reviewed selected-wave safety-pin and cost-prior identities;
- a sanitized live quota attestation class, digest, policy identity, and UTC without account identifiers, balances, raw percentages, reset windows, or credentials.

The plan does not invent P50/P90 splits for non-cached input, cache read, cache write, reasoning output, or ordinary output. Exact category vectors are measured from admitted raw provider usage and retained in usage and report artifacts. A source prior may expose an additional category only when its own frozen schema, units, and provenance explicitly provide it; the coordinator cannot derive one from provider-total tokens.

Account and rate-limit endpoints are account-wide and may expose identifiers or balances. A dedicated zero-model launch preflight may inspect account source and native quota only long enough to prove `authenticationMode=chatgpt`, reject API-key billing, and evaluate the frozen first-hit policy. It immediately discards the raw response and never preserves identifiers, balances, credentials, exact utilization, reset windows, or payloads. Native window percentages, reset times, balances, and credits are never converted into provider-total-token allowance. The tracked subject and block token thresholds remain independent observed-usage guards; a native quota first hit is a separate OR stop condition. A command-line document cannot replace either guard, and only the sanitized attestation fields admitted by `quota-policy.json` are retained.

Preparation verifies the exact `protocol/price-sheet.json` digest and the tracked experimental app-server schema snapshot at the pinned path, including its file count, byte count, and tree hash. It fails while `price-sheet.json.launchGate.blocked` is true, a token semantic is unavailable, the exact schema tree differs, or effective thread tier and speed mode differ from the sheet. The frozen price mapping currently leaves provider credits and USD unavailable because the ChatGPT cache-write credit rate and credit-to-USD conversion are not directly sourced. That monetary absence does not block a token/time/quality run, but it forbids provider-credit totals, USD totals, and every cost-effectiveness claim. Operators cannot infer a missing rate or bypass an execution-critical gate with a CLI flag; a future monetary result requires a formal protocol checkpoint.

Preparation also validates `protocol/subject-freeze-manifest.json` and independently recomputes every requirements-tree and catalog digest, byte count, H2/H3 count, acceptance count, and context count across all four subjects. A corpus and its grading catalog cannot be changed together and silently accepted: any difference requires a new all-subject freeze, protocol revision, and prior before launch.

Preparation never executes from the developer worktree. It creates one block-local sealed clone with `--no-checkout`, configures `core.autocrlf=false` before a detached checkout of the exact merged SHA, and compares every tracked raw byte with its Git blob. Requirements, templates, prompts, protocol files, schemas, and README must also satisfy the LF attributes and clean-clone round trip. The frozen raw tree uses bytewise UTF-8 POSIX paths; any legacy materializer JSON ledger is separately named `materializerLedgerSha256` and must bind the same bytes. A clean `git status` does not excuse a raw-byte mismatch.

`price-sheet.json.launchGate` is sheet-specific. The authoritative overall gate is `protocol/pins.json.launchGate`, which remains blocked until the merged revision, issue-ledger checkpoints, numeric safety limits, runner, grader, promotion, report, and all vertical fixtures are pinned and green.

The manifest's symbolic service tier is `default`; the wire request omits `serviceTier`; Codex must report `ThreadStartResponse.serviceTier = null`. Those are three representations of the same Standard Terra configuration, not a request that sends the string `default`. Fast/`priority` is not part of this experiment: it carries a 2.5× credit multiplier and would invalidate the price sheet and the current prior. The runner records requested settings, effective `thread/start` settings, and any `model/rerouted` notification; it fails closed on a mismatch or reroute.

The run authenticates through signed-in ChatGPT. API-key authentication, API Priority processing, or any dollar-per-token API rate is a different execution or billing mode and fails the launch gate rather than supplying the missing ChatGPT monetary mapping.

Raw `inputTokens` is inclusive. The runner requires `cachedInputTokens + cacheWriteInputTokens <= inputTokens`, calculates `nonCachedInputTokens = inputTokens - cachedInputTokens - cacheWriteInputTokens`, and reports the mutually exclusive categories exactly once. It durably adds each deduplicated raw response's provider `totalTokens` to the observed safety total without inventing a monetary conversion.

The configured provider-total-token value is an observed-response stop threshold, not a hard ceiling. Codex can issue several upstream Responses requests inside one top-level turn through its tool loop and descendants, while the harness learns usage only from post-completion notifications and has no per-request authorization hook. When the deduplicated observed total reaches the threshold, the harness immediately interrupts the active turn and terminates the process tree if needed, but already-issued requests may overshoot by more than one response. If termination loses a final usage notification, tokens are a right-censored lower bound. A true hard token or monetary ceiling requires an upstream request gateway or synchronous authorization hook and remains unavailable in Codex `0.145.0`.

Neither stop mechanism makes partial work disappear. The hard wall-clock deadline terminates the process tree at the deadline and may leave final usage as a lower bound; the observed token-threshold stop reacts only after usage notifications arrive and may overshoot. Both checkpoint, record the precise interruption reason and completeness state, seal all available streams, inventory the live workspace, preserve a reproducible project snapshot, and keep the row as right-censored data.

The outer block coordinator deduplicates every response ID across all cells and durably appends the aggregate provider `totalTokens`. Reaching the block threshold or block deadline emits one shared idempotent stop record, quiesces all campaigns, and kills every cell and descendant process tree. Each affected cell seal references that shared digest and its observed cell and block totals. Because several cells and requests may already be in flight, this block guard is also not a hard ceiling and can leave a lower-bound total.

## Start and live monitoring

`start` stages the frozen Goal objective with status `paused`, sends the exact first utterance with the frozen terminal structured-output schema, waits for that user turn's `turn/started`, records `t0`, and then activates the same Goal by omitting the objective and setting only `status = active`. This marks the current turn Goal-active without injecting objective text, so the first utterance must contain every substantive requirement and the Goal may contain only persistence and completion conditions. Staging an active idle Goal is forbidden because Codex `0.145.0` would auto-start a Goal-only turn before the measured user prompt.

The coordinator owns the following operation records:

```text
benchmark/.work/<block-id>/cells/<run-id>/
  operation-plan.json
  operations/
    controller.lock.json
    heartbeat.<owner-id>.jsonl
    state.jsonl
    events.jsonl
    abort-request.json
    safety-abort-request.json
    terminal.json
```

Only the files applicable to a cell's lifecycle are present. The runner separately owns raw transport logs under its admitted cell output:

```text
logs/
  client.raw.jsonl
  server.raw.jsonl
  stderr.raw.log
  transport.envelopes.jsonl
  runner.events.jsonl
snapshots/<t_done|t_dry|terminal>/
  project/
  snapshot-manifest.json
  live-inventory.json
  exclusion-policy.json
  exclusion-drift-report.json
```

The exact filenames of the remaining state, usage, activity, cost, and core artifacts are owned by the production runner and schemas and must be documented only after their vertical integration passes. The raw logs and snapshots above are the stable runner contract.

Monitor with the command, not by parsing a partially written ledger:

```powershell
pnpm --dir benchmark run benchmark -- status --run <run-id>
```

`status` returns `runId`, durable `status`, conservative controller `liveness`, `heartbeatAgeMs`, `terminalReason`, and the cell root. Do not edit a live workspace, send ad hoc messages, run competing commands inside it, or remove a controller lock. The sole post-claim user intervention is the frozen completion challenge, sent only after `t_done` and its immutable snapshot.

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
pnpm --dir benchmark run benchmark -- abort --run <run-id> --reason "<specific reason>"
```

Abort writes a final checkpoint, stops the controller and complete descendant process tree, verifies liveness has ended, records `interrupted` with subtype `operator_abort`, inventories the live workspace, preserves a reproducible project snapshot, reconciles exact usage, and seals the run. It does not delete or relabel the row.

When an unmerged tree, digest mismatch, broken shared path, weakened gate, incorrect prompt, or invalid measurement is discovered, abort every affected live cell. Record the cause and cost, correct the whole consequence surface, merge and validate the fix, and begin a new protocol revision. Never repair an experimental input in place.

## Phase 2 and grading

After `t_done`, the fixed completion challenge runs on the same thread. Phase 2 then creates a neutral stripped bundle for four fresh-context finders, adversarially verifies deduplicated candidates, and sends only verified findings to the arm-aware fixer. Two consecutive valid rounds with zero new verified findings establish `t_dry`.

Blind grading runs at both `t_done` and `t_dry`. The primary denominator is the corpus-supplied `acceptance-criteria.jsonl`, not heading count. A frozen plan partitions each population into at most 50-item blocks and binds every input and schema digest. Two independent graders assess every clause in isolated block contexts, then each makes a separate arm guess only after semantic ratings are sealed. A fresh third AI adjudicates machine disagreements, and the harness assembles the final machine grade and arm-specific defect taxonomy locally. The same deterministic sample, disagreement, critical-result, `not_applicable`, and `unverifiable` queue awaits an actual human audit; while it is pending, the report cannot claim human validation or publish a human-validated composite.

The live workspace is always built and tested. Its full path, size, file-kind inventory, and gate identity remain measurement evidence, but it is not copied wholesale into Git. The retained project snapshot is the reproducible source artifact, and the stripped bundle is for neutral discovery and grading only.

## Results and reporting

Every terminal run is appended to the permanent GitHub results ledger in [issue #99](https://github.com/samchon/lint-plugin-evidence/issues/99) with UTC, setup and generation time, each token category, monetary status and values when available, interruption or failure state, artifact scale, independent gates, semantic coverage, campaign findings, and grading reliability. Failed and interrupted attempts remain visible.

Predictions under `protocol/predictions/` are never edited after observation. Measurements come only from live run records. Any reconstructed, model-attributed, or extrapolated value is labelled as an estimate and cannot replace an exact field.

The machine-local `.wiki/` keeps Korean research and design decisions. It is not the permanent result ledger.

## Terminal postprocess and durable handoff

Do not grade a cell merely because Codex stopped speaking. The runner must first publish a terminal outer seal and an immutable complete core. `liveness_unknown`, a live controller, a missing descendant-death proof, a mutable core, or an incomplete exact-usage reconciliation blocks postprocess.

For each cell that has a complete gradeable core:

```powershell
pnpm --dir benchmark run benchmark -- grade --run <run-id>
```

`grade` consumes the sealed `t_done` and `t_dry` source and neutral-bundle manifests. It must produce two independent blind grade sets, separate arm guesses made only after semantic grades are sealed, fresh third-AI adjudication of disagreements, the local semantic grade and defect taxonomy, deterministic secondary quality inputs, and a human-audit queue. The human queue remains `pending` until a real human completes it; never relabel an AI-only result as human-validated or publish a composite quality score while it is pending.

After all four cells are terminal and every gradeable core has its complete postprocess:

```powershell
pnpm --dir benchmark run benchmark -- report --block todo-reddit-r1
```

The block report includes completed, failed, interrupted, safety-limited, and right-censored rows; it never drops a row because it cannot be compared normally. It reports setup separately from measured generation, preserves token categories and completeness flags, uses the acceptance catalog as the primary denominator, keeps ERP acceptance and context populations separate, and labels unavailable monetary values and estimates literally.

The production `grade`, `report`, postprocess seal, result promotion, demo update, and Git compare-and-swap writers remain launch blockers until one vertical fixture validates their actual emitted bytes against the pinned schemas. Schema files and protocol prose alone do not prove this handoff exists.

Promotion copies the canonical retained `t_dry` project snapshot to both `result/<subject>/<arm>/runs/<run-id>/workspace/` and the arm-level demo `workspace/`, then updates `latest.json` atomically. It must preserve all older `runs/<run-id>/` directories, every failed or interrupted core, raw logs, package archives required by relative `file:` dependencies, grades, reports, and seals. Never replace `benchmark/result/` with an unsealed live workspace.

Before committing a promoted result, verify that `latest.json` points to the intended run, the run-level and demo workspaces match the promotion record, the temporary Git commit-and-clean-clone round trip passed, and no live process owns the corresponding `.work` root. Commit and push the retained result and append the exact report digest and run identities to issue #99. A future standalone demo repository must be created from the promoted demo `workspace/`, not from `.work/`, a stripped grading bundle, or a reconstructed archive.

## Safe document checks

Frozen requirements, prompts, protocol, templates, and results are excluded from formatting. Validate syntax without rewriting them:

```powershell
pnpm --dir benchmark check
pnpm --dir benchmark test:unit
git diff --check
pnpm exec prettier --check benchmark/README.md
```

The shared protocol validator uses fatal UTF-8 decoding, rejects duplicate JSON members, compiles the complete tracked schema inventory, resolves admitted local references, and checks the semantic fixtures. A `ConvertFrom-Json` loop is not a safety gate because it accepts last-write-wins duplicate members and can normalize invalid input before the canonical byte validator sees it.

Do not run Prettier over `benchmark/prompts/` or `benchmark/protocol/`. A post-run whitespace-only change is still an experimental input change.
