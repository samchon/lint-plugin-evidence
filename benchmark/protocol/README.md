# Frozen benchmark protocol

This directory is the arm-neutral experimental contract for issue #88. It is never copied into a generated project and neither arm may override it. A run reads the same prompts, campaign procedure, grading rules, schemas, pins, and price sheet by content digest.

## Question

The benchmark compares the time, token use, completion honesty, product quality, and post-completion discovery cost of two full-stack generation methods over byte-identical requirements.

| Tree name | Registered arm | Method under test |
| --- | --- | --- |
| `plain` | A — Control | Exhaustive manual obligation campaigns without evidence rules |
| `evidence` | B — Treatment | Evidence graph, evidence diagnostics, and graph-directed review |

The intervention is the complete generated-project method bundle, not the npm dependency in isolation. A claim about the plugin alone requires a later factorial ablation that holds the method instructions constant.

## Fixed decisions

- Every subject is full-stack: database, API, backend, frontend, integration, and browser behavior are in scope.
- A cell is one subject × arm × replicate. Three replicates are three distinct cells, and each Todo/Reddit replicate is one randomized four-cell concurrency block.
- The generator is Codex `0.145.0` using `gpt-5.6-terra` at `high` reasoning effort; `pins.json` records the exact Windows x64 package and executable hashes.
- Phase 1 ends only when a completed generation turn's terminal assistant item passes the provider-facing `schema/generation-outcome-provider.schema.json` and the stricter local `schema/generation-outcome-local.schema.json` with `outcome = complete`; truth is graded later.
- The identical completion challenge follows the immutable `t_done` snapshot and is charged to the `t_done` to `t_dry` tail.
- Phase 2 uses four fresh-context neutral finders per round, adversarial verification, an arm-aware fixer handoff, and `K = 2` consecutive valid rounds with zero new verified findings.
- Grading uses two independent blind graders and a fresh third AI adjudicator for every `t_done` and `t_dry` artifact. The harness emits a deterministic human-audit queue; pending human validation is reported honestly and forbids human-validated or composite claims without blocking the machine-complete benchmark.
- Atomic obligations, not headings, are the primary semantic denominator. H2 and H3 coverage remain separately reported compatibility metrics for issue #88.
- Predictions and measurements are stored separately. A prior is never rewritten to resemble observed data.

## Subject readiness

Todo and Reddit are the first stabilization wave. Their authored requirements, corpus metadata, and `acceptance-criteria.jsonl` must agree before any cell starts.

Shopping's frozen corpus has six Markdown documents, H2=93, H3=471, and 2,083 acceptance rows. Its complete coupon, discount, promotion, and stacking surface is in scope. The current-freeze four-subject prior is frozen, but a prior is not launch authorization.

ERP has seven Markdown files: five narrative documents, the corpus contract, and the table of contents. Its final corpus contract has two non-overlapping reporting populations: 1,724 H3-owned rows in `acceptance-criteria.jsonl` are the primary behavioral and product-quality denominator, while 986 H2-owned rows in `context-criteria.jsonl` are the integration and context-conformance denominator. The manifest exposes them as `acceptanceCriteria` and `contextCriteria`. Their digests, counts, grades, and coverage statistics remain separate; 2,710 is never reported as a combined denominator. ERP cannot launch until the merged corpus and production runner, grader, report, and valid/invalid fixtures prove both populations and reject any cross-population numerator or denominator.

## Run phases

1. The harness validates every launch gate, materializes one workspace, installs the locally packed product, records all digests, and starts the append-only stream.
2. The goal objective is staged once with `status = paused` and no token budget. The runner starts the arm-neutral first user turn, waits for that turn's `turn/started`, records `t0`, then activates the existing Goal with an objective-omitted `thread/goal/set { status: "active" }`. An active idle Goal would auto-start a Goal-only turn and is forbidden.
3. A completed generation turn with a valid structured `outcome = complete` records `t_done`; the harness preserves the exact response, inventories the live workspace, and writes a reproducible project snapshot before any continuation. A valid `outcome = interrupted` right-censors the run without `t_done` or a completion challenge. Missing or malformed structured output is a preserved runner failure.
4. After the first turn is terminal, the runner starts the completion challenge as a new turn on the same thread. It never uses `turn/steer` for this boundary because steering is valid only while a turn is active.
5. The harness creates a stripped neutral bundle and runs the campaign in `campaign.md`.
6. When two consecutive valid rounds yield zero new verified findings, the harness records `t_dry`, inventories the live workspace, writes the reproducible project snapshot, executes independent gates, and creates the final blind grading bundle.
7. The runner validates and seals the immutable run core. Separate grading and reporting owners append artifacts bound to that core. Only the final promoter may update `latest.json`, the demo workspace, and the permanent ledger after the complete postprocess and fresh-process promotion contract passes.

## Frozen inputs

The per-run input manifest includes each file and a root digest for:

- `benchmark/requirements/<subject>/`;
- `benchmark/protocol/subject-freeze-manifest.json`, whose all-subject tree and catalog identities prevent a corpus and its inventory from being changed together without detection;
- `benchmark/prompts/`;
- `benchmark/protocol/`, excluding predictions for other subject waves;
- the effective merged template for the selected arm;
- the atomic-clause catalog and hidden acceptance suite for the subject;
- the locally packed `@samchon/lint-plugin-evidence` tarball digest for block provenance; only Evidence materializes the archive bytes and dependency;
- the exact source, merged commit, lockfile, agent, toolchain, model, effort, and price sheet.

The formatter must not touch `benchmark/requirements/`, `benchmark/prompts/`, `benchmark/protocol/`, `benchmark/template/`, or `benchmark/result/`. Once a cell has started, changing one of its frozen inputs invalidates every run in that cell. Preserve the invalidated records and open a new protocol revision rather than silently rerunning.

## Protocol files

| File | Owns |
| --- | --- |
| `campaign.md` | Phase 2 lenses, verification, fixing, and K=2 stop rule |
| `measurement.md` | Milestones, events, token normalization, time, scale, and interruption accounting |
| `grading.md` | Atomic clauses, semantic ratings, tests, hidden checks, and inter-rater audit |
| `stripping.md` | Raw-to-blind bundle transform and contamination scan |
| `pins.json` | Model, effort, Codex package identity, and unresolved execution pins |
| `cost-predictions.json` | Machine-readable Standard-tier P50/P90 wall-clock and provider-token priors, both milestones, source-chain digests, and zero-observation provenance |
| `price-sheet.json` | Frozen token semantics, directly sourced partial credit rates, unavailable monetary mapping, and launch policy |
| `subject-freeze-manifest.json` | Exact requirements-tree, catalog, H2, H3, acceptance, and context identities for every subject |
| `schema/` | Machine-readable run, event, snapshot, clause, finding, fresh-agent, verified-only handoff, campaign-round, bundle, and grade contracts |
| `predictions/` | Immutable priors, explicitly excluded from measured result records |

## Launch gate

A paid run is forbidden until all of the following are true:

- the foundation change is merged and the exact merged SHA passes install, format check, build, Go tests, feature tests, materialization smoke, tarball install smoke, and runner fake tests;
- the exact neutral full-stack template revision passes one independent install, build, database, test, and browser smoke before either arm is materialized;
- the product tarball passes an isolated install, import, and native-load consumer smoke; every cell resolves and installs its own lockfile and dependency tree; only Evidence receives the archive and relative `file:` dependency, while Plain records its digest for provenance without receiving its bytes;
- every frozen input has a non-null SHA-256 digest and the materialized tree matches it;
- `cost-predictions.json` validates against its strict schema, its append-only source chain ends at the active reviewed leaf, every source byte digest matches, and its eight subject-arm rows reproduce the selected Markdown P50/P90 values exactly. The retained block plan binds the artifact digest and copies the selected row without collapsing `t_done` and `t_dry`; wall-clock hours and millions of provider total tokens remain explicit units;
- the all-subject freeze manifest validates, its own digest is pinned, and every `requirementsRawTreeSha256`, catalog digest, byte count, H2/H3 count, acceptance count, and context count matches independently recomputed bytes;
- `acceptance-criteria.jsonl` exists, every line validates, every criterion ID is unique, each `REQ-*` and source pair exists in the corpus, every leaf has a row, and the frozen inventory count and digest match exactly;
- the selected subject is declared stable; for ERP, both the 1,724-row acceptance population and 986-row context population are pinned and valid/invalid fixtures prove that no report sums or cross-mixes them;
- the runner validates fake completed, failed, interrupted, terminal-seal-only resume, and aborted records against these schemas;
- completion adjudication fixtures cover valid completion, valid interruption, missing and malformed output, a completed turn that claims interruption, and Goal-status mismatch;
- the configured JSON Schema validator enables `date-time`, and `fixtures/formats/cases.json` proves both accepted and rejected calendar/offset cases;
- a strict parser rejects duplicate object members across every tracked protocol JSON file and proves the rejection against `fixtures/json-integrity/duplicate-key.txt`; last-write-wins parsing cannot satisfy the gate;
- a pre-seal grading-input fixture binds the run manifest plus algorithm-qualified `t_done`/`t_dry` source and bundle raw-tree digests, the core seal hashes that fixture, and a negative fixture containing `coreSealSha256` is rejected to prove there is no digest cycle;
- adjudication-provenance fixtures reject reused grader/adjudicator identity, a non-recomputed two-grade-plus-queue input digest, duplicate or missing milestone grade sets, a grade-set/core-seal mismatch, and a pending-human composite claim;
- the canonical block plan hashes into one outer write-once execution-safety artifact; every per-cell cost report binds `runId`, `blockId`, both parent digests, and any shared durable stop digest, while the four-cell block report binds the same execution-safety artifact and globally deduplicates response IDs;
- the model, effort, Codex binary and app-server schema, sandbox, approval behavior, service tier behavior, and toolchain are pinned;
- the tracked exact `--experimental` app-server schema snapshot contains `v2/RawResponseCompletedNotification.json`, `v2/RawResponseItemCompletedNotification.json`, `v2/ThreadStartResponse.json`, and the `ThreadStartParams.experimentalRawEvents` opt-in; launch proves the pinned path, 347 files, 3,303,877 bytes, tree hash, and one non-null exact-usage notification;
- a Goal fixture proves paused objective staging emits no Goal-only turn, activates the same objective only after the first user `turn/started`, preserves Goal usage, and injects no objective text; a prompt-delta fixture proves the Goal contains no substantive requirement absent from the first utterance, while a negative fixture proves active-before-user would auto-start and is rejected by the runner;
- `provider-output-registry.json` exhaustively owns every `turn/start.outputSchema`; a recursive preflight resolves every local `$ref` closure and rejects unsupported keywords anywhere, while the registered local schemas enforce nonblank, cardinality, uniqueness, pattern, and cross-field semantics after provider-core validation;
- app-server or controller-transport death terminally right-censors the attempt because Codex `0.145.0` disables raw events on `thread/resume`; the resume command verifies and seals records but never continues measured generation;
- the manifest records symbolic tier `default`, every `thread/start` sets `allowProviderModelFallback = false` and model `gpt-5.6-terra` while omitting the wire `serviceTier`, and `ThreadStartResponse.serviceTier = null` is required. These are the three frozen representations of Standard, not a wire request containing `"default"`. `ThreadStartResponse.model` and `modelProvider` reconcile the remaining effective settings; every later request preserves the omission; any request drift, settings update, or `model/rerouted` notification fails closed. Raw response-completion events carry usage but do not claim provider model or tier identity;
- the atomic-clause catalog, hidden suite, stripping transform, leak scan, and grading calibration pass;
- each grading plan binds the run, bundle and digest, all-subject freeze, subject requirements tree, catalogs, rubric, prompt, provider/local block and arm-guess schemas, registry, the runtime-sealed protocol raw-tree algorithm and digest, and two independent grader assignments before either grader sees an artifact;
- the production runner, not a manual operator or fixture adapter, performs syntax-aware evidence/config/lint stripping, the leak scan, two-pass deterministic bundle hashing, four same-digest read-only finder instances, fresh verification, verified-only handoff, mutation restoration, and K=2 state transitions;
- the promoter proves a completed immutable core plus both milestones' grades, arm guesses, fresh AI adjudication, human-audit queue and status, deterministic/secondary inputs, and final report; then creates the canonical workspace from the sealed `t_dry` retained-project manifest, commits it to a temporary Git repository, clones it cleanly, and proves the clone has the same manifest, tree digest, and core seal;
- the price sheet's `launchGate.blocked` is `false`;
- the operator records the subject, arm, replicate, four-cell concurrency block, expected P50/P90 wall time and token vectors, monetary status, quota state, arm-equal cell token/deadline limits, and block-global token/deadline limits.
- tracked protocol pins contain only the null final-source/final-review template and the resolution policy. After merge, runtime source admission resolves the final COMMENT review and its reviewed head through GitHub, verifies that head is a merge parent or ancestor under the fixed merge-commit strategy, and proves the reviewed and merged Git tree OIDs are equal. The block plan alone binds those non-null identities. Prepare separately seals the protocol raw tree and writes its algorithm-qualified digest into downstream runtime artifacts; mutation after sealing fails closed;
- beyond the schema's exact four-cell cardinality, the production semantic validator rejects mixed replicates, duplicate `runId` or `launchOrder`, duplicate subject × arm pairs, and any block other than exactly two preregistered subjects × both arms for one replicate;
- `schema/block-plan.schema.json` is the single canonical prepared-operation and paid-authorization artifact: it binds remote-verified merged source, sealed source and manifest, local product provenance, all four materialization/setup records, randomized launch order, priors, and safety authorization. Every path is canonical repository-relative POSIX form with nonempty ASCII segments and no dot segment; empty, aliased, absolute, drive-root, backslash, NUL, and Unicode forms are invalid. The plan never self-hashes: later artifacts reference the SHA-256 of its exact closed bytes.
- the retained block plan contains only non-identifying native-quota result classes, policy identity and digest, and an attestation digest. Exact percentages, window/reset values, bucket IDs, raw snapshots, and derived fingerprints remain in an ephemeral non-promoted control-plane checkpoint and are destroyed after attestation.
- `quota-policy.json` freezes the four native window mappings and first-hit behavior for null, sparse update, reached, reset, and fetch-failure states. The block plan binds its exact raw-byte digest. The public attestation hashes only the named sanitized projection through RFC 8785 canonical JSON; raw telemetry is never part of that preimage.

Compile success alone is not a validated launch. A run from an unmerged or unverified tree is aborted, retained with its cost, and excluded from comparison cells.

The price sheet's gate answers only whether its token semantics and monetary-availability policy are internally usable. `pins.json.launchGate` is the authoritative overall launch gate and remains blocked until the merged revision, issue #88/#99 checkpoint comments, safety limits, runner, grader, promotion, reporting, and vertical fixtures are pinned and green. A sheet-specific false value never unblocks a run by itself.

Frozen source identity uses materializer manifest schema version 2 and algorithm ID `sha256-posix-path-nul-bytes-v1`: normalized POSIX relative paths sorted by raw UTF-8 bytes, hashing `path || NUL || exact bytes || NUL`. Locale-aware sorting is forbidden. `requirementsRawTreeSha256` names that domain, and every run manifest must carry the same schema version and algorithm ID.

The Codex schema generator is not assumed deterministic. Repeated `--experimental` generation from the same binary has changed `codex_app_server_protocol.v2.schemas.json`, so a run consumes and hashes the preserved tree named in `pins.json` rather than accepting a freshly generated tree by version alone. A bare tree hash is insufficient. The exact original 347 files and 3,303,877 bytes are tracked at `benchmark/protocol/vendor/codex/0.145.0/app-server-schema-experimental` with tree SHA-256 `8fe683...`; launch verifies that path, file count, byte count, every byte, and tree digest. Tree hashing compares normalized POSIX relative paths by raw UTF-8 bytes, then hashes `path || NUL || exact-file-bytes || NUL`; locale-aware sorting such as `localeCompare` is forbidden because it produces a different digest. A deterministic archive may be added but is not a substitute for or requirement beyond the tracked extracted tree. A newly generated tree cannot impersonate it. Missing `rawResponse/completed` or a notification with `usage = null` makes exact token measurement unavailable and fails the run closed.

Arm-specific lint and native compilation are intentionally absent from pre-`t0` baselines. The first such execution and its diagnostics occur after `t0` and remain in the measured treatment or control method cost. This preserves the intervention while the separate tarball smoke prevents a structurally broken package from consuming a paid run.

Campaign records have one owner. The standalone round JSON stores complete inline finder and verification data and validates directly against `schema/campaign-round.schema.json`; the raw response is retained by byte reference, not copied into a second manifest. The runner sends `schema/finding-provider.schema.json` and validates the result again with `schema/finding-local.schema.json`; verifiers use the corresponding `verification-provider` and `verification-local` pair. Only `schema/fixer-handoff.schema.json` creates a separate immutable artifact because verified findings cross from the neutral campaign into the arm-aware raw workspace.
