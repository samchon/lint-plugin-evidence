# Shopping and ERP prior — prediction, not measurement

This prior was frozen after the Shopping and ERP requirement inventories stabilized and before any paid Shopping or ERP generation run, then formally submitted on PR #105 at https://github.com/samchon/lint-plugin-evidence/pull/105#pullrequestreview-4801116513. It contains no observed benchmark data. It is not a result, confidence interval, cost authorization, launch approval, or promise that an uncensored run will finish.

Observed data must never be written into this file. Runs write under `benchmark/result/` and the permanent issue #99 ledger. Later revisions receive a new file and a new formal PR COMMENT review; this prior is append-only history.

## Frozen subject scale

| Subject | Markdown | H2 | H3 | Acceptance denominator | Context denominator | Links |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shopping | 6 | 93 | 471 | 2,083 | none | not separately frozen |
| ERP | 6 | 261 | 1,344 | 1,724 | 986 | 196 |

Shopping includes the complete coupon, promotion, discount, and stacking surface. ERP acceptance rows are H3-owned product-quality obligations. ERP context rows are H2-owned cross-leaf integration and context-conformance obligations. The ERP populations are never added; 2,710 is not a coverage denominator.

## Scientific assumptions

- Codex `0.145.0`, `gpt-5.6-terra`, reasoning effort `high`, provider fallback disabled, and one frozen service tier.
- A complete merged scaffold, real local Evidence tarball, frozen hidden suite, production neutral-bundle transform, and independently green deterministic gates.
- Shopping Evidence/Plain and ERP Evidence/Plain start as one randomized four-cell concurrency block after the required pre-run merge.
- App-server or controller-transport death right-censors a run. This Codex revision cannot resume experimental raw usage into a completed exact-token row.
- Wall-clock excludes deterministic setup/install and external grading. Milestone time includes model, tool, build, test, provider wait, and campaign work after `t0`.
- Token values are millions of provider tokens. Non-cached input, cache read, cache write, and output are mutually exclusive predicted categories whose sum equals provider total. Reasoning is an output subset and is not added twice.
- The category prior uses 1.0% non-cached input, 97.0% cache read, 0.2% cache write, and 1.8% output; reasoning is predicted at 1.0% of provider total. This is an intentionally simple preregistered composition assumption, not a claim about observed cache semantics.
- Scale extrapolation uses only frozen corpus structure and the pre-observation Todo/Reddit prior as anchors. It applies sublinear reuse within a full-stack scaffold and superlinear integration risk for coupon stacking, ERP cross-module invariants, browser journeys, and test-oracle construction.
- P10/P50/P90 are subjective prior quantiles. Time and token quantiles are conditional on reaching the named milestone; interruption probabilities are reported separately.
- Quality quantiles describe the distribution across completed artifacts, not confidence intervals around a measured mean.

## Wall-clock prior

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Shopping | Evidence | 36 / 84 / 216 h | 60 / 144 / 360 h |
| Shopping | Plain | 60 / 144 / 384 h | 96 / 264 / 720 h |
| ERP | Evidence | 72 / 192 / 480 h | 120 / 312 / 840 h |
| ERP | Plain | 120 / 336 / 840 h | 216 / 624 / 1,440 h |

These tails are deliberately wide. ERP Plain has a median `t_dry` prior of 26 days and a P90 of 60 days conditional on reaching `t_dry`; quota or infrastructure censoring is more likely than an uninterrupted P90 completion.

## Exact provider-token category prior

All values are millions of tokens.

| Subject | Arm | Milestone | Quantile | Non-cached input | Cache read | Cache write | Output | Reasoning subset | Provider total |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shopping | Evidence | `t_done` | P10 | 14.0 | 1,358.0 | 2.8 | 25.2 | 14.0 | 1,400.0 |
| Shopping | Evidence | `t_done` | P50 | 31.0 | 3,007.0 | 6.2 | 55.8 | 31.0 | 3,100.0 |
| Shopping | Evidence | `t_done` | P90 | 76.0 | 7,372.0 | 15.2 | 136.8 | 76.0 | 7,600.0 |
| Shopping | Evidence | `t_dry` | P10 | 22.0 | 2,134.0 | 4.4 | 39.6 | 22.0 | 2,200.0 |
| Shopping | Evidence | `t_dry` | P50 | 49.0 | 4,753.0 | 9.8 | 88.2 | 49.0 | 4,900.0 |
| Shopping | Evidence | `t_dry` | P90 | 122.0 | 11,834.0 | 24.4 | 219.6 | 122.0 | 12,200.0 |
| Shopping | Plain | `t_done` | P10 | 22.0 | 2,134.0 | 4.4 | 39.6 | 22.0 | 2,200.0 |
| Shopping | Plain | `t_done` | P50 | 54.0 | 5,238.0 | 10.8 | 97.2 | 54.0 | 5,400.0 |
| Shopping | Plain | `t_done` | P90 | 145.0 | 14,065.0 | 29.0 | 261.0 | 145.0 | 14,500.0 |
| Shopping | Plain | `t_dry` | P10 | 38.0 | 3,686.0 | 7.6 | 68.4 | 38.0 | 3,800.0 |
| Shopping | Plain | `t_dry` | P50 | 98.0 | 9,506.0 | 19.6 | 176.4 | 98.0 | 9,800.0 |
| Shopping | Plain | `t_dry` | P90 | 270.0 | 26,190.0 | 54.0 | 486.0 | 270.0 | 27,000.0 |
| ERP | Evidence | `t_done` | P10 | 19.0 | 1,843.0 | 3.8 | 34.2 | 19.0 | 1,900.0 |
| ERP | Evidence | `t_done` | P50 | 43.0 | 4,171.0 | 8.6 | 77.4 | 43.0 | 4,300.0 |
| ERP | Evidence | `t_done` | P90 | 115.0 | 11,155.0 | 23.0 | 207.0 | 115.0 | 11,500.0 |
| ERP | Evidence | `t_dry` | P10 | 31.0 | 3,007.0 | 6.2 | 55.8 | 31.0 | 3,100.0 |
| ERP | Evidence | `t_dry` | P50 | 71.0 | 6,887.0 | 14.2 | 127.8 | 71.0 | 7,100.0 |
| ERP | Evidence | `t_dry` | P90 | 190.0 | 18,430.0 | 38.0 | 342.0 | 190.0 | 19,000.0 |
| ERP | Plain | `t_done` | P10 | 32.0 | 3,104.0 | 6.4 | 57.6 | 32.0 | 3,200.0 |
| ERP | Plain | `t_done` | P50 | 78.0 | 7,566.0 | 15.6 | 140.4 | 78.0 | 7,800.0 |
| ERP | Plain | `t_done` | P90 | 220.0 | 21,340.0 | 44.0 | 396.0 | 220.0 | 22,000.0 |
| ERP | Plain | `t_dry` | P10 | 54.0 | 5,238.0 | 10.8 | 97.2 | 54.0 | 5,400.0 |
| ERP | Plain | `t_dry` | P50 | 142.0 | 13,774.0 | 28.4 | 255.6 | 142.0 | 14,200.0 |
| ERP | Plain | `t_dry` | P90 | 410.0 | 39,770.0 | 82.0 | 738.0 | 410.0 | 41,000.0 |

Provider credits follow the frozen price sheet and are not precomputed here because the live tier, source archive, and price-sheet launch gate are not yet frozen. USD may remain unavailable and null.

## Acceptance-coverage prior

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Shopping | Evidence | 82 / 93 / 98% | 92 / 98 / 99.6% |
| Shopping | Plain | 68 / 84 / 94% | 86 / 96 / 99.0% |
| ERP | Evidence | 72 / 88 / 96% | 88 / 97 / 99.4% |
| ERP | Plain | 50 / 72 / 88% | 78 / 92 / 98.0% |

This is full `implemented_correctly / applicable` coverage over the acceptance catalog: 2,083 Shopping rows or 1,724 ERP rows. Partial-or-better coverage is predicted two to seven percentage points higher at `t_done` and one to four points higher at `t_dry`, with the larger gap in Plain.

## ERP context-conformance prior

| Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | ---: | ---: |
| Evidence | 65 / 82 / 93% | 85 / 95 / 99% |
| Plain | 40 / 62 / 80% | 70 / 88 / 96% |

These percentages use only the 986 H2 context rows. They never enter acceptance numerators or denominators.

## Non-vacuous requirement-to-test prior

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Shopping | Evidence | 65 / 83 / 94% | 80 / 94 / 98% |
| Shopping | Plain | 45 / 68 / 85% | 72 / 89 / 96% |
| ERP | Evidence | 50 / 72 / 88% | 72 / 90 / 97% |
| ERP | Plain | 30 / 50 / 72% | 60 / 82 / 93% |

The numerator requires an executed, production-reaching, counterfactually discriminating test. Test titles, mocked reimplementations, build success, and line coverage do not count.

## Independent gate-pass prior

Each cell reports the predictive probability that a fresh independent gate passes at the named milestone.

| Subject | Arm | Build `t_done` P10/P50/P90 | Build `t_dry` P10/P50/P90 | Test `t_done` P10/P50/P90 | Test `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: | ---: | ---: |
| Shopping | Evidence | 55 / 72 / 86% | 80 / 92 / 98% | 35 / 58 / 78% | 65 / 84 / 94% |
| Shopping | Plain | 40 / 60 / 78% | 70 / 88 / 96% | 20 / 42 / 65% | 50 / 74 / 88% |
| ERP | Evidence | 35 / 58 / 78% | 70 / 88 / 96% | 15 / 38 / 62% | 50 / 75 / 90% |
| ERP | Plain | 20 / 45 / 68% | 60 / 82 / 94% | 5 / 22 / 45% | 35 / 65 / 84% |

## Completion honesty and censoring prior

| Subject | Arm | False first completion P10/P50/P90 | Reach `t_done` | Reach `t_dry` |
| --- | --- | ---: | ---: | ---: |
| Shopping | Evidence | 20 / 38 / 60% | 72% | 55% |
| Shopping | Plain | 45 / 70 / 88% | 50% | 30% |
| ERP | Evidence | 35 / 58 / 78% | 45% | 25% |
| ERP | Plain | 65 / 84 / 95% | 22% | 8% |

False completion means the first schema-valid `outcome = complete` claim is later contradicted by independent gates or blind grading. Reach probabilities include quota, provider, host, watchdog, harness, and user-abort censoring. They are block-level planning priors, not permission to omit interrupted rows.

## Campaign and method-overhead prior

| Subject | Arm | Phase 2 rounds P10/P50/P90 | Productive rounds P10/P50/P90 | Phase 1 method overhead P10/P50/P90 |
| --- | --- | ---: | ---: | ---: |
| Shopping | Evidence | 3 / 6 / 11 | 1 / 4 / 9 | 18 / 27 / 40% |
| Shopping | Plain | 5 / 10 / 18 | 3 / 8 / 16 | 40 / 55 / 70% |
| ERP | Evidence | 4 / 9 / 16 | 2 / 7 / 14 | 20 / 30 / 45% |
| ERP | Plain | 7 / 15 / 28 | 5 / 13 / 26 | 45 / 62 / 78% |

Method overhead is the share of Phase 1 active time and request tokens primarily attributed to method reading, exhaustive planning, obligation inventory, trace maintenance, and method-specific correction. It is not inferred from static instruction bytes alone. Plain is expected to spend more because its skills require repeated exhaustive coverage campaigns without a graph-backed closure oracle.

## Artifact-scale and residual-defect prior

| Subject | Arm | Authored product LOC at `t_dry` P10/P50/P90 | Test LOC at `t_dry` P10/P50/P90 | Critical/high residual findings P10/P50/P90 |
| --- | --- | ---: | ---: | ---: |
| Shopping | Evidence | 45 / 80 / 145 k | 14 / 28 / 55 k | 0 / 2 / 8 |
| Shopping | Plain | 40 / 72 / 135 k | 9 / 20 / 42 k | 1 / 5 / 18 |
| ERP | Evidence | 75 / 145 / 280 k | 25 / 55 / 115 k | 1 / 5 / 18 |
| ERP | Plain | 65 / 125 / 260 k | 16 / 38 / 90 k | 4 / 14 / 45 |

LOC excludes dependencies, build output, caches, injected requirements, and method instructions. Scale is descriptive rather than intrinsically good: more code can mean broader implementation, duplication, or unnecessary surface.

## Directional hypotheses

- Evidence is predicted to reduce median `t_done` time by roughly 42% for Shopping and 43% for ERP relative to Plain, despite its own lint and graph-maintenance cost.
- Evidence is predicted to reduce median provider tokens by roughly 43% at Shopping `t_done`, 50% at Shopping `t_dry`, 45% at ERP `t_done`, and 50% at ERP `t_dry`.
- Evidence's strongest expected quality effect is lower unacknowledged omission and higher cross-surface test coverage. It is not expected to eliminate false acknowledgements, semantic defects, or test-oracle gaps.
- ERP context conformance is expected to show a larger Evidence/Plain gap than leaf acceptance coverage because graph-directed review can expose missing cross-module consumers, but this is a method-bundle claim rather than a plugin-only causal claim.
- `t_dry` remains a finder-recall stopping rule rather than proof of semantic perfection. Both arms retain a non-zero critical/high residual tail.
- The primary threat is informative censoring: the longest and weakest Plain runs are most likely to exhaust quota before `t_dry`, which can make completer-only Plain quality look better than intention-to-treat quality.

## Largest uncertainties

- No local `gpt-5.6-terra` calibration run exists.
- The effective service tier, cache semantics, price-source archive, and exact raw schema archive are not frozen.
- Shopping coupon stacking and ERP cross-module invariants may create more superlinear remediation than H2/H3/criterion counts imply.
- Four-cell concurrency may couple quota, provider waits, CPU, RAM, disk, browsers, and database processes.
- Neutral campaign recall, mutation population quality, hidden acceptance strength, and human-adjudication reliability are not yet calibrated at this scale.
- App-server death is terminal under exact-token measurement, increasing right-censoring relative to a resumable workload.
