# Blind grading rubric

Grading measures the product artifact, not the generator's confidence, traceability prose, or method compliance. The same atomic obligations, deterministic gates, hidden checks, bundle transform, and rating instructions apply to both arms at `t_done` and `t_dry`.

## Atomic clause catalog

Each frozen corpus supplies `benchmark/requirements/<subject>/acceptance-criteria.jsonl`. Every non-empty line is one product-quality denominator record that validates independently against `schema/atomic-clause.schema.json` and names a stable criterion ID, exact `REQ-*` leaf, owning source document, and observable criterion. The frozen input manifest records the JSONL digest, line count, unique-ID count, H2 count, and H3 count. The harness rejects a missing file, malformed line, duplicate criterion ID, unknown requirement ID, source/requirement mismatch, inventory count or digest mismatch, an H3 leaf with no row, or an inventory requirement absent from the Markdown corpus.

A corpus may additionally supply `context-criteria.jsonl` for cross-requirement integration and context conformance. These rows validate against `schema/context-criterion.schema.json`, bind to H2 context owners, and form a second denominator. They never enlarge, shrink, or replace product-quality acceptance coverage. Grade records, reliability statistics, and reports keep acceptance and context ratings, counts, and percentages separate and set `denominatorsSummed = false`.

The production grade validator compares IDs, not only array lengths. Within each population it requires unique rating IDs equal to the exact frozen catalog ID set, checks that `populationCount` equals catalog and rating counts, and reconciles every status, applicability, testability, non-vacuous-test, and critical-defect summary field. It rejects a missing or duplicate ID, an `.AC-*` ID in context ratings, a `.CTX-*` ID in acceptance ratings, and any numerator derived from the other population.

Todo's next frozen corpus revision declares H2=22, H3=66, and 211 atomic criteria. Those values are launch expectations, not historical values for the `66d6c89` prediction snapshot. Reddit and later subjects take their expected counts from their committed corpus contract and frozen input manifest; a missing count or digest blocks launch.

ERP's final corpus contract has 1,724 H3-owned acceptance rows and 986 H2-owned context rows. The former measures product-quality requirement coverage; the latter measures integration and context conformance. The value 2,710 is not a meaningful denominator and must never appear as an aggregate coverage count. `fixtures/erp-dual-denominator/grade-cases.json` freezes the exact-set, duplicate, missing, 1,723/985, cross-population, summary-reconciliation, and combined-denominator cases that the production validator must pass.

The inventory is authored arm-neutrally before generated artifacts are visible. Corpus authors and an independent reviewer decompose every normative requirement into the smallest independently falsifiable observable obligation and reconcile the final JSONL. Artifact-dependent surfaces, testability, severity, and semantic ratings belong to the blind grade rather than the corpus row.

An atomic clause:

- has one stable `.AC-*` ID and one exact `REQ-*` owner;
- names the owning numbered Markdown document;
- states one independently observable pass-or-fail criterion without prescribing implementation;
- remains in product-quality grading even when a generated artifact uses `@evidenceExclude`;
- receives artifact surfaces, applicability, testability, severity, and semantic evidence in the blind grade without changing the frozen corpus row.

Normative table rows and matrix cells become separate clauses when they can fail independently. Pure explanation, examples that introduce no rule, and duplicated restatements point to their canonical clause rather than enlarging the denominator.

Catalog construction is arm-neutral. Catalog reviewers cannot inspect generated workspaces, evidence configuration, campaign findings, or predictions.

## Semantic rating

Each applicable clause receives exactly one primary status.

| Status | Standard |
| --- | --- |
| `implemented_correctly` | Every required surface and case is present and agrees with the clause |
| `partial` | Material required behavior exists, but at least one required surface or case is absent |
| `omitted` | No material implementation of the obligation exists |
| `contradicted` | The artifact implements behavior incompatible with the obligation |
| `unverifiable` | Available artifacts and permitted checks cannot establish the result |
| `not_applicable` | The frozen applicability rule excludes this artifact; requires explicit rationale |

A declaration, type, comment, citation, route name, or test title is not implementation. The grader traces persisted state, transport behavior, domain logic, rendered behavior, and executed assertions as required by the clause.

`unverifiable` is not counted as implemented. `not_applicable` is removed from the denominator only after adjudication; graders cannot use it to resolve uncertainty.

## Surface assessment

The clause grade separately records each applicable surface as `correct`, `partial`, `missing`, `wrong`, or `not_applicable`:

- database schema and persistence;
- API operation and contract;
- backend validation, authorization, transaction, and domain logic;
- frontend route, state, interaction, accessibility, loading, empty, and error behavior;
- integration and generated client use;
- tests and hidden acceptance behavior.

The primary clause status is the worst material applicable surface. A correct backend does not compensate for a missing required frontend, and several partial consumers do not pool into one complete project.

## Test assessment

A clause has a non-vacuous test only when all of the following hold:

1. The test executes in the frozen canonical suite.
2. It reaches the relevant production path rather than a disconnected reimplementation.
3. Its assertion distinguishes required behavior from a plausible incorrect implementation.
4. Removing or reversing the behavior would make the test fail.
5. Required negative and boundary behavior is asserted, not merely exercised.

Record test existence, execution, pass state, positive/negative/boundary dimensions, transport and persistence depth, and the grader's counterfactual. Hidden acceptance results remain harness-owned and are not exposed to the generator.

Conventional line, branch, function, and statement coverage are secondary. A sampled mutation program targets authorization, boundary, state-transition, transaction, and error branches; mutation score is reported with the sampled operator and population.

## Deterministic grade inputs

The semantic grader receives the neutral bundle, acceptance catalog, optional context catalog, frozen requirements, and harness-owned deterministic results:

- build, lint, database, unit, integration, E2E, and browser gates;
- hidden black-box acceptance checks;
- conventional code coverage;
- sampled mutation results;
- artifact inventory and unresolved placeholder scan.

The grader does not receive arm identity, raw workspace, AGENTS or skills, evidence diagnostics or annotations, campaign history, transcript, token counts, elapsed time, predictions, or another grade.

## Defect taxonomy

Semantic grades and campaign findings preserve these distinctions:

- unacknowledged in-denominator omission;
- out-of-denominator configuration omission;
- false-acknowledged omission or contradiction;
- partial implementation;
- implemented-but-wrong semantic defect;
- test-oracle gap;
- non-defect.

H4 predicts only the first class approaches zero in the treatment arm. A false acknowledgement cannot be moved into `semantic_defect` merely to protect that hypothesis.

## Inter-rater procedure

Two independent blind graders assess every acceptance clause and, when present, every context criterion for every `t_done` and `t_dry` bundle in fresh contexts. Graders receive no previous ratings and cannot communicate.

A human reviewer audits:

- a stratified 20% sample from every subject × arm × phase cell;
- every primary-status disagreement;
- every `critical` or `high` finding;
- every `not_applicable` or `unverifiable` rating;
- every case where hidden acceptance and semantic grade disagree.

The human preserves both original grades and writes a separate adjudication with rationale. Raw ratings are never overwritten.

Report exact agreement and the disagreement matrix, weighted Cohen's kappa or Krippendorff's alpha for ordinal statuses, and ICC for continuous coverage and quality values. If ordinal reliability is below 0.67, do not publish a composite quality claim; expand human adjudication and report the vector with uncertainty.

Each blind grader guesses `plain`, `evidence`, or `unknown` and supplies confidence after grading. Accuracy materially above 60% triggers a contamination investigation before results are accepted.

## Reporting

Report, by subject, arm, replicate, and phase:

- full and partial-or-better acceptance coverage;
- context-conformance coverage as a separate denominator when the corpus supplies it;
- H2 coverage and H3 coverage separately;
- status and surface distributions;
- non-vacuous requirement-to-test coverage;
- hidden acceptance, conventional coverage, and mutation score;
- deterministic gate state;
- critical defect count and taxonomy;
- grader agreement, human changes, and arm-guess accuracy.

The primary report is this vector. Acceptance and context counts or percentages are never added together. If a secondary composite is frozen later, publish its exact formula, weights, cap, and all component values. A high score cannot conceal a critical authorization, integrity, or data-loss defect.
