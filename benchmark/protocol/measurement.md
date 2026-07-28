# Measurement contract

The runner records measurements from the live Codex app-server stream and harness process. A value reconstructed from a transcript is an estimate and must never occupy a measured field.

## Retained run layout

Every run owns one immutable result root under `benchmark/result/<subject>/<arm>/runs/<run-id>/`.

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
  snapshots/
    t_done/
      project/
      snapshot-manifest.json
      live-inventory.json
    t_dry/
      project/
      snapshot-manifest.json
      live-inventory.json
  campaign/
  grading/
```

The runner-owned manifest, streams, usage, gates, snapshots, campaign, terminal state, pre-seal quality inputs, and grading-input manifest form the immutable canonical run core. The grading-input manifest binds the run manifest and algorithm-qualified `t_done`/`t_dry` source and neutral-bundle raw-tree digests; it never contains the not-yet-created core seal. The core seal hashes that grading-input manifest. Failed, interrupted, safety-limited, and completed cores are retained immediately. Grading and reporting are separate postprocess owners: they append content-addressed artifacts that bind the core seal and never rewrite core bytes or an existing postprocess byte. Schema `additionalProperties: false` rejects a pre-seal `coreSealSha256`, preventing the digest cycle `grading input -> core seal -> grading input`.

No core seal updates `latest.json` or the demo `workspace`. Final promotion requires a completed `t_dry` core, two blind grades and post-grade arm guesses at both `t_done` and `t_dry`, fresh third-AI adjudication, a deterministic human-audit queue, deterministic gate and secondary review artifacts, a schema-valid final report, and a fresh-process core-to-postprocess verification. Human validation may remain explicitly pending; that forbids human-validated and composite claims but does not block machine-complete preservation or demo promotion. `schema/result-promotion.schema.json` also requires a clean Git round trip and compare-and-swap ownership.

## Workspace evidence and retained snapshots

The live workspace and the Git-retained project snapshot are different artifacts. The live workspace is the directory in which the agent and gates ran. At every snapshot milestone, the runner records its path, total bytes, file and directory counts, file-kind counts, and a deterministic path/hash inventory. That inventory is measurement evidence; the live tree is not copied wholesale into Git.

The retained project snapshot is the canonical source artifact under `snapshots/<milestone>/project/`. Its manifest validates against `schema/snapshot-manifest.schema.json`. It retains all reproducibility inputs, including authored source, tests, configuration, documentation, package manifests, the lockfile, database schema and migrations, seed sources, static assets, and the Evidence tarball referenced by a relative `file:` dependency. It excludes at least:

- `.git/` and other VCS administration;
- `node_modules/` and package-manager stores;
- compiler, bundler, generated coverage, and documentation outputs;
- tool caches and temporary files;
- runtime SQLite databases and `-wal` or `-shm` companions;
- Playwright reports, browser downloads, screenshots, traces, and videos;
- runner logs, rollouts, campaign records, grades, and other harness-owned output.

Every retained file or symlink and every excluded subtree root receives an explicit manifest row; an ignored path cannot disappear silently. Each excluded root records its descendant count, total bytes, and tree digest. Exclusion reasons are frozen before launch in a policy whose digest is independent of `.gitignore`. The manifest records the effective template `.gitignore` digest and a drift report; every intentional difference must be preregistered and zero unreviewed differences are permitted. A required relative dependency, lockfile, source, test, config, migration, or static asset appearing in the excluded set fails the snapshot.

Canonical `runs/<run-id>/workspace/` and the arm-level demo `workspace/` are byte-for-byte copies of the sealed `t_dry` retained project snapshot, not copies of the live physical tree. The production validator proves unique NFC-normalized POSIX paths in bytewise sorted order, exact manifest-to-tree file-set equality, every entry's bytes and executable mode, non-overlapping excluded roots, retained/excluded disjointness, and path-backed required-class checks. Before promotion, a fixture commits the canonical run tree to a temporary SHA-1 Git repository, clones it into a clean directory, and recomputes the snapshot manifest, retained-tree digest, promotion record, and terminal seal. Any difference fails the launch gate. If a future protocol needs a complete physical workspace archive, it must define a separate immutable archive, hash, size, retention policy, and owner; it cannot redefine the canonical project snapshot.

## Milestones

| Name | Definition |
| --- | --- |
| `t0` | The app-server emits `turn/started` for the first arm-neutral user generation turn after the Goal objective was staged paused and immediately before that same Goal is activated |
| `t_green` | The first harness-observed successful canonical build-and-test gate after `t0` |
| `t_done` | A completed generation turn's terminal assistant item first validates against the frozen output schema with `outcome = complete`, regardless of later quality grade |
| `t_dry` | The second consecutive valid campaign round completes with zero new verified findings |

The runner stores UTC and monotonic nanoseconds for every milestone. UTC establishes ordering across artifacts; monotonic time is the authority for durations.

`turn/completed` alone never establishes `t_done`. The runner requires the terminal assistant item, the provider-facing `schema/generation-outcome-provider.schema.json`, the stricter local `schema/generation-outcome-local.schema.json`, and the mechanical completion-adjudication record. The provider schema contains only Structured Outputs-supported core keywords; complete-empty, interrupted-nonempty, nonblank, and uniqueness rules are local admission checks. `outcome = interrupted` right-censors the run without `t_done` or a challenge. Missing, malformed, or locally invalid output is a preserved runner failure. Goal status is a separate consistency signal; a mismatch is an anomaly and never replaces the structured decision.

`t_done` is never moved. The exact terminal response, live-workspace inventory, and retained project snapshot are durable before the completion challenge is sent. The challenge starts as the next turn on the same thread, uses the same output schema, and must complete with `outcome = complete` before Phase 2 begins. The challenge and every later action are part of the `t_done` to `t_dry` tail.

The agent's build claim does not establish `t_green`. Harness-owned gates use exact commands, exit codes, duration, stdout/stderr references, and output digests. The record distinguishes `agentReportedGreen`, `t_green`, `gateAtDone`, and `gateAtDry`.

Gate ownership is fixed before launch. A neutral scaffold revision passes one unmeasured template smoke. The packed product separately passes an unmeasured consumer install, import, and native-load smoke. Each cell performs and records its own pre-`t0` lockfile resolution and install as setup, without sharing dependencies. Arm-specific lint, native compilation, diagnostics, and remediation begin only after `t0`; their time and tokens are measured intervention cost and cannot be shifted into setup.

## Event stream

`logs/runner.events.jsonl` contains one event per line conforming to `schema/event.schema.json`. Sequence numbers are one-based and contiguous; sequence one uses 64 zeroes as its previous hash, and no later event may use that sentinel. Each line contains the SHA-256 of the preceding canonical event so truncation, insertion, and reordering are detectable.

Required event families:

- setup and digest verification;
- run, thread, turn, request, response, message, and tool lifecycle;
- token usage, safety-threshold attribution, and monetary availability;
- gate start, command, result, and diagnostic fingerprints;
- completion candidate, adjudication, milestone, and workspace snapshot;
- completion challenge lifecycle;
- bundle creation and leak scan;
- campaign round, finder, candidate, deduplication, verification, fix, and clean-streak lifecycle;
- grade submission, disagreement, human audit, and adjudication;
- checkpoint, heartbeat, interruption, failure, abort, resume, and terminal state.

Raw app-server envelopes remain in `client.raw.jsonl`, `server.raw.jsonl`, and `transport.envelopes.jsonl`; runner events point to them by stable line or byte-span reference rather than copying lossy excerpts.

## Status and censoring

Run status is one of `running`, `interrupted`, `failed`, or `completed`. An operator-requested abort is an `interrupted` run with subtype `user_abort`, not deletion. Each turn separately records `completed`, `interrupted`, or `failed`.

Interruption subtypes are `quota`, `provider`, `host`, `watchdog`, `safety_limit`, `user_abort`, and `harness`. A `safety_limit` record distinguishes `observed_total_tokens` from `hard_deadline`. Product build or test failures that the agent cannot resolve are run failures, not infrastructure interruptions.

A run that has not reached `t_done` or `t_dry` is right-censored at its last heartbeat. Report intention-to-treat rows, completer-only summaries, interruption rates, and best/worst bounds. Never replace an interrupted or failed row with a silent rerun.

## Token accounting

Every completed model request stores:

- provider model ID and requested reasoning effort;
- raw inclusive input tokens;
- cached input/read tokens;
- cache-write or cache-creation tokens;
- normalized non-cached input tokens;
- visible output tokens when available;
- reasoning output tokens when available;
- provider total tokens;
- the phase and activity category;
- the exact price-sheet digest and literal monetary status; provider credits and USD remain null while the mapping is unavailable.

In Codex `0.145.0`, `thread/tokenUsage/updated` exposes accumulated thread snapshots with `last` and `total`; each contains input, cached-input, output, reasoning-output, and total counters, while cache-write input is optional and normalizes to zero when absent. These snapshots reconcile the ledger but do not define individual requests. Exact request rows come from the pinned generated schema's raw response-completion event, are deduplicated by upstream response ID across every primary and descendant thread, and are never reconstructed by differencing two accumulated snapshots.

Exact response usage requires the tracked exact experimental schema snapshot, `thread/start` with `experimentalRawEvents = true`, `allowProviderModelFallback = false`, model `gpt-5.6-terra`, omitted wire `serviceTier`, and a non-null `RawResponseCompletedNotification.usage`. The manifest calls this symbolic tier `default`, while `ThreadStartResponse.serviceTier = null` is the required effective value; the string `default` is never sent. Fast/`priority` is forbidden because it uses a different credit multiplier. The notification schema permits `usage = null`; the runner treats that as unavailable exact measurement, preserves the row and raw event, and fails the run rather than substituting accumulated differences. That notification does not expose provider model or service tier. The runner instead records the requested thread settings and reconciles them against `ThreadStartResponse.model`, `modelProvider`, and `serviceTier`; it proves every later request preserves the same model, effort, and tier omission and fails on a settings update, `model/rerouted` notification, or mismatch.

Codex `0.145.0` enables raw response events only when a thread is started. Its `thread/resume` path installs a listener with raw events disabled and has no re-enable field. Consequently an app-server process or controller transport loss is terminal for exact-token measurement. The runner seals the attempt `interrupted`, retains all prior usage and workspace evidence, and never stitches post-resume accumulated snapshots or model turns into the row. A replacement starts from a fresh workspace under a new run ID.

For Codex, normalized non-cached input is:

```text
normalized_non_cached_input = raw_inclusive_input - cache_read - cache_write
```

For this pinned contract, cached input and cache-write input are subsets of inclusive input. The runner requires all fields to be nonnegative, `cache_read + cache_write <= raw_inclusive_input`, `provider_total = raw_inclusive_input + output`, and `reasoning_output <= output`; a violation fails exact accounting instead of clamping. Provider total is retained exactly as reported. The normalized comparison total adds each mutually exclusive billed category once. Reasoning output is a diagnostic subset of output and is not added twice.

The runner durably appends each observed deduplicated raw response's provider `totalTokens` and the cumulative observed total. It records cache read, cache write, normalized non-cached input, output, and reasoning separately, but never converts them to provider credits or USD while the pinned mapping is unavailable. The authorization value is an observed-response provider-total-token threshold, not a hard ceiling: one Codex top-level turn may issue multiple upstream Responses requests through its internal tool loop and descendant agents, and the harness sees each only after `rawResponse/completed`. The app-server exposes no synchronous per-provider-request authorization hook.

When cumulative observed provider total tokens reach the threshold, the runner immediately requests turn interruption, terminates the app-server and descendant process tree if needed, and sends no new harness-owned turn. Already-issued upstream requests may still complete, so overshoot is not bounded to one response. A forced stop can also lose a terminal raw notification; the record then preserves exact observed usage as a lower bound, sets completeness false, and right-censors the run as `safety_limit`. The safety report records the threshold, observed total, observed overshoot, response IDs, stop-observation state, hard deadline, and whether the wall-clock stop fired. The hard deadline independently terminates the complete process tree when reached. A true hard token or monetary ceiling requires an upstream request gateway or synchronous hook.

The same subject and replicate use identical `maximumObservedTotalTokens` and hard-deadline duration in both arms. Their absolute deadline timestamps differ only by their recorded start instants. The plan validator rejects an arm-specific threshold or duration. These are safety controls, not estimands; every stopped row remains visible and right-censored.

A concurrent plan additionally freezes `maximumObservedBlockTotalTokens` and a block hard-wall duration. The outer coordinator owns an append-only response-ID set and aggregate provider-total-token ledger across every cell. When either block limit is observed, it durably writes one idempotent shared stop event before quiescing all campaigns and terminating all primary and descendant process trees. Every cell terminal seal references the shared event digest and the cell and block lower bounds. A restart reconstructs the coordinator from that durable ledger and reissues an incomplete stop idempotently; it never forgets a previously observed response or reopens a sealed cell. The block guard is not a hard ceiling because several cells and responses may already be in flight.

Cell `hardDeadlineUtc` is derived exactly as `t0 UTC + hardWallDurationSeconds`; block `blockHardDeadlineUtc` is derived as `blockStartedAtUtc + blockHardWallDurationSeconds`. The durations are immutable plan inputs, while the derived timestamps are durably appended at the corresponding exact start event. The local validator rejects any arithmetic mismatch.

Provider credits and USD are optional secondary outputs. The current price sheet marks both unavailable because no direct source establishes the ChatGPT cache-write credit rate or credit-to-USD conversion. This does not block a token/time/quality run, but it forbids monetary totals, monetary stop rules, and cost-effectiveness claims. A future monetary result requires a new pinned mapping, source snapshots, fixtures, and formal protocol checkpoint.

`schema/cost-report.schema.json` is a local artifact schema and is never registered as a model-facing output schema. The production validator enforces threshold comparison, exact overshoot arithmetic, stop-trigger implications, deadline consistency, and lower-bound state against `fixtures/cost-report/cases.json`; JSON Schema validation alone is insufficient.

The primary token comparison reports non-cached input, cache read, cache write, output, reasoning subset, and provider total separately. “Millions of tokens” always means cumulative provider tokens including cache replay unless a table explicitly names a normalized category.

## Activity attribution

The unit is one unique upstream `rawResponse/completed` response ID. Its exact token vector is an immutable ledger fact; phase, activity probabilities, labels, and causal roles are separate adjudicated values and never alter token totals. Two independent activity raters process identical catalog-order blocks of at most 50 response IDs, then a fresh AI adjudicates disagreements.

`schema/activity-ledger.schema.json` is runner-owned and core-sealed. It binds exact usage and event ledgers, the terminal event-chain hash, capture and closure flags, expected response and item counts, the measured wall, contiguous phase walls, and every item lifecycle. `schema/activity-observation.schema.json` contains only exact or explicitly censored observations. Before either rater runs, `schema/activity-assignment.schema.json` binds the exact observation, complete verified event window, response catalog, codebook, process provenance, model, effort, and isolation state. Each rating and adjudication then requires `schema/activity-process-identity.schema.json` and `schema/activity-execution.schema.json`: exact process-start provenance, assignment and turn events, raw response bytes and usage, and final agent-message item-completed bytes must all reconcile. Raw response completion never proves structured output; only parsed final item text is bound to the provider-output digest. `schema/activity-report.schema.json` marks every semantic allocation as an estimate, keeps exact-under-estimated-label counters distinct from probability-weighted point and uncertainty rows, and repeats the full token/time/burden allocation within every exact phase wall.

| Primary activity | Definition |
| --- | --- |
| `requirements_reading` | Reading or indexing the shared specification |
| `method_reading` | Reading AGENTS, skills, method ledgers, or evidence diagnostics for procedure |
| `planning_inventory` | Plans, obligation inventories, trace ledgers, and progress accounting |
| `implementation` | Creating or changing product behavior |
| `deterministic_feedback` | Responding to build, lint, type, test, or schema diagnostics |
| `ordinary_remediation` | Correcting a discovered implementation defect outside Phase 2 |
| `completion_audit` | Pre-claim and fixed completion-challenge review |
| `phase2_discovery` | Finder, deduplication, and adversarial verification |
| `phase2_fix` | Fixing verified Phase 2 findings |
| `grading` | Blind semantic grading and human audit; excluded from generation cost |
| `residual_unclassified` | Evidence is insufficient to allocate the response without invention |

Classification first fixes the phase from exact events, then assigns an 11-category basis-point probability vector summing to 10,000. The primary label is the unique deterministic maximum; a tied maximum fails local admission instead of inventing a tie break. Secondary mechanism tags distinguish direct method campaign, induced method campaign, quality-producing fix, and shared product work; the causal role symmetrically reports direct and induced burden for both Plain and Evidence. A quality-producing correction is never relabelled as pure procedure overhead merely because a method exposed it. Ratings bind rubric, response IDs, exact ledger digest, evidence events, rater, confidence anchor, and fresh adjudication under the provider/local activity schemas.

Reads under `.agents/skills/`, writes to method ledgers, build invocations, and diagnostic episodes can be observed mechanically, while semantic purpose remains an AI judgment. Low confidence, rater disagreement, a residual share above the frozen threshold, or a direct/induced causal disagreement enters the human-validation queue. Report point allocation, residual, inter-rater agreement, and best/worst bounds.

Report three distinct method-cost quantities:

1. Unique static instruction size by files, bytes, words, and tokenizer estimate.
2. Replayed billed context attributable to method files, currently `unavailable` because Codex usage does not expose file-level prompt-token attribution.
3. Active time and request tokens whose primary activity is method reading, planning, trace maintenance, or method-specific correction.

## Time accounting

Report setup, Phase 1, Phase 2 tail, total generation, and grading separately.

```text
setup = t0 - setup_started
phase1 = t_done - t0
tail = t_dry - t_done
generation_total = t_dry - t0
```

Within each phase, sweep exact interval endpoints and report category union, activity sum, every pairwise overlap, and equal-split exclusive-equivalent time. Codex exposes no response-start event that can exactly separate model-active, provider-wait, and idle complements, so their unresolved complement is reported as `unresolved_model_provider_idle`, never guessed apart. Tool/build/test, runner wait, and operator intervals remain distinct. Parallel sums that exceed wall-clock are labelled activity time.

Four simultaneous Todo/Reddit cells form one randomized concurrency block. Record launch order, overlap intervals, CPU, RAM, disk, process count, provider waits, quota state, measured block wall from the earliest cell `t0` to the last terminal, and conservative safety block wall from outer launch start to its derived deadline. Pair arm comparisons within the same block; do not compare those raw wall times directly with a future sequential Shopping or ERP run.

## Diagnostic and remediation episodes

A diagnostic episode begins with a new normalized fingerprint and ends at the first successful gate where that fingerprint is absent. Store the diagnostic text, rule/code, normalized locations, attempts, repeated identical count, elapsed time, tokens, edits, resolution gate, and later recurrence.

Three appearances of the same unresolved fingerprint flag an actionability audit. This is not automatically a product defect; a reviewer checks whether the diagnostic named the violated obligation, target, expected correction, and relevant configuration boundary.

## Coverage and quality

The primary semantic denominator is the frozen atomic-clause catalog. For applicable clauses:

```text
full_requirement_coverage = implemented_correctly / applicable
partial_or_better_coverage = (implemented_correctly + partial) / applicable
non_vacuous_test_coverage = clauses_with_executed_non_vacuous_test / testable
```

H2 and H3 section coverage are reported separately and never pooled as independent observations. A parent heading and its child clauses cannot each contribute equal independent weight to a single denominator.

When a corpus supplies `context-criteria.jsonl`, compute a second vector with the same status arithmetic:

```text
full_context_conformance = context_implemented_correctly / context_applicable
partial_or_better_context_conformance = (context_implemented_correctly + context_partial) / context_applicable
```

Acceptance numerators may divide only by the acceptance population, and context numerators may divide only by the context population. For ERP, the frozen counts are 1,724 acceptance rows and 986 context rows. No implementation, CI fixture, grade, or report may use 2,710 as a combined denominator.

Quality remains a vector: semantic coverage, hidden acceptance, requirement-to-test coverage, conventional code coverage, mutation kill rate, deterministic gates, critical defect count, and blind maintainability review. A weighted composite is secondary and may be published only if its weights and critical-defect cap were frozen before the first run.

## Artifact scale

Capture scale at materialization, `t_done`, after the completion challenge, every Phase 2 round, and `t_dry`.

- input documents, bytes, words, H2, H3, tables, cross references, and atomic clauses;
- raw and stripped files and LOC split into authored, generated, test, config, and comments;
- packages, dependencies, exported symbols, API operations, request/response DTOs, database models and columns;
- frontend routes, screens, forms, state stores, and browser journeys;
- test files, cases, assertions, positive, negative, boundary, integration, and browser tests;
- TODOs, stubs, placeholders, skipped tests, disabled gates, and unresolved diagnostics.

Exclude dependencies, build output, caches, injected requirements, and agent method instructions from product LOC. Report normalization per atomic clause, fully covered clause, endpoint, model, and non-vacuous test.

## Derived metrics

The issue #88 metrics M1–M8 remain mandatory. Additional mandatory outputs are:

- first-claim false-completion rate and claim-to-independent-gate mismatch;
- time and tokens by activity, especially method-campaign overhead;
- verified findings and fix cost by defect class;
- clean and productive rounds, invalid rounds, and findings decay;
- interruption probability and censored tail by subject and arm;
- diagnostic actionability, repeated-fingerprint resolution, and recurrence;
- blind arm-guess accuracy and inter-rater reliability;
- raw-to-stripped scale delta and artifact scale normalized cost.
- acceptance coverage and context conformance as separate populations whenever a context catalog exists.

Predictions live under `predictions/`. Observations live only in run records and the permanent results ledger. A report labels any model-based allocation, reconstructed value, or extrapolation as an estimate.
