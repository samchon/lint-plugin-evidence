# Current-freeze four-subject prior — prediction, not measurement

This is the authoritative pre-observation prior for the current Todo, Reddit, Shopping, and ERP corpus freeze, formally submitted at https://github.com/samchon/lint-plugin-evidence/pull/105#pullrequestreview-4801252166. It supersedes the two earlier reviews only for runs using these current corpus bytes: the `66d6c89` Todo/Reddit review and the first Shopping/ERP review remain immutable historical priors for their older stated inputs. They must never be silently relabelled as priors for this freeze.

No paid generation result, benchmark transcript, grade, gate outcome, or token observation informed this file. Observations must never be written here. A changed input digest requires a new prediction file and a new formal PR COMMENT review before any paid cell sees that input.

## Frozen subject scale

| Subject | Files | Markdown | Bytes | Words | Raw H2 | Narrative H2 | H3 | Acceptance | Context |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Todo | 7 | 6 | 109,236 | 9,109 | 22 | 22 | 66 | 211 | none |
| Reddit | 7 | 6 | 170,984 | 16,959 | 48 | 48 | 176 | 255 | none |
| Shopping | 7 | 6 | 803,964 | 39,974 | 93 | 93 | 471 | 2,083 | none |
| ERP | 13 | 7 | 1,055,883 | 53,789 | 265 | 261 | 1,344 | 1,724 | 986 |

Shopping includes the complete coupon, discount, promotion, and stacking surface. ERP has five narrative documents plus its corpus contract and table of contents. Its 1,724 acceptance rows and 986 context rows are disjoint populations; 2,710 is never a coverage denominator. Shopping has 8.17 times Reddit's acceptance count. ERP has 6.76 times Reddit's acceptance count and 7.64 times its H3 count, but cross-module integration risk makes those ratios scale descriptors rather than linear cost multipliers.

## Scientific assumptions

- Codex `0.145.0`, `gpt-5.6-terra`, reasoning effort `high`, requested service tier `priority`, provider fallback disabled, and exact preflight reconciliation of requested settings with the effective thread settings.
- A merged, independently green scaffold; frozen hidden suite; real local Evidence tarball; production neutral-bundle transform; deterministic gates; and a valid exact-schema snapshot.
- Todo Evidence/Plain and Reddit Evidence/Plain form the first randomized four-cell block per replicate. Shopping Evidence/Plain and ERP Evidence/Plain form a later randomized four-cell block only after the required pre-run merge and separate cost authorization.
- App-server or controller-transport death right-censors an attempt. Codex `0.145.0` cannot resume experimental raw usage into a completed exact-token row.
- Wall-clock excludes deterministic setup/install and external grading. It includes all model, tool, gate, provider-wait, and campaign work after `t0`.
- Token values are millions of exact provider tokens. The prior composition is 1.0% non-cached input, 97.0% cache read, 0.2% cache write, and 1.8% output; reasoning is a 1.0% subset of the total and is not added twice.
- P10/P50/P90 are subjective prior quantiles, not confidence intervals. Time and token quantiles are conditional on reaching the named milestone. Reach probabilities separately express informative censoring.
- Quality is judged blind against the exact acceptance catalog. A requirement-to-test row counts only when an executed test reaches production behavior and counterfactually discriminates correct from incorrect behavior.

## Wall-clock prior

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Todo | Evidence | 3 / 6 / 13 h | 5 / 9 / 20 h |
| Todo | Plain | 4 / 8 / 18 h | 6 / 12 / 28 h |
| Reddit | Evidence | 8 / 18 / 42 h | 12 / 28 / 66 h |
| Reddit | Plain | 12 / 30 / 72 h | 18 / 52 / 120 h |
| Shopping | Evidence | 36 / 84 / 216 h | 60 / 144 / 360 h |
| Shopping | Plain | 60 / 144 / 384 h | 96 / 264 / 720 h |
| ERP | Evidence | 72 / 192 / 480 h | 120 / 312 / 840 h |
| ERP | Plain | 120 / 336 / 840 h | 216 / 624 / 1,440 h |

## Provider-token total prior

All values are millions of tokens. Each value decomposes mechanically according to the preregistered category composition above; measured records retain the exact categories and never substitute this composition.

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Todo | Evidence | 71 / 178 / 426 | 122 / 264 / 660 |
| Todo | Plain | 102 / 264 / 659 | 163 / 396 / 1,014 |
| Reddit | Evidence | 255 / 609 / 1,520 | 407 / 963 / 2,432 |
| Reddit | Plain | 407 / 1,013 / 2,630 | 662 / 1,823 / 4,852 |
| Shopping | Evidence | 1,400 / 3,100 / 7,600 | 2,200 / 4,900 / 12,200 |
| Shopping | Plain | 2,200 / 5,400 / 14,500 | 3,800 / 9,800 / 27,000 |
| ERP | Evidence | 1,900 / 4,300 / 11,500 | 3,100 / 7,100 / 19,000 |
| ERP | Plain | 3,200 / 7,800 / 22,000 | 5,400 / 14,200 / 41,000 |

## Full acceptance-coverage prior

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Todo | Evidence | 92 / 97 / 99% | 97 / 99 / 100% |
| Todo | Plain | 90 / 96 / 98.5% | 96 / 98.5 / 99.8% |
| Reddit | Evidence | 84 / 94 / 98% | 93 / 98 / 99.7% |
| Reddit | Plain | 60 / 82 / 95% | 84 / 96 / 99% |
| Shopping | Evidence | 82 / 93 / 98% | 92 / 98 / 99.6% |
| Shopping | Plain | 68 / 84 / 94% | 86 / 96 / 99.0% |
| ERP | Evidence | 72 / 88 / 96% | 88 / 97 / 99.4% |
| ERP | Plain | 50 / 72 / 88% | 78 / 92 / 98.0% |

These are `implemented_correctly / applicable` percentages over exactly 211 Todo, 255 Reddit, 2,083 Shopping, or 1,724 ERP acceptance rows. They replace the historical Todo/Reddit H3 proxy for current-freeze inference.

## ERP context-conformance prior

| Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | ---: | ---: |
| Evidence | 65 / 82 / 93% | 85 / 95 / 99% |
| Plain | 40 / 62 / 80% | 70 / 88 / 96% |

These percentages use only the 986 context rows and never enter an acceptance numerator or denominator.

## Non-vacuous requirement-to-test prior

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Todo | Evidence | 85 / 93 / 97% | 93 / 97 / 99% |
| Todo | Plain | 76 / 88 / 95% | 90 / 96 / 99% |
| Reddit | Evidence | 70 / 88 / 96% | 85 / 95 / 99% |
| Reddit | Plain | 45 / 70 / 88% | 75 / 90 / 97% |
| Shopping | Evidence | 65 / 83 / 94% | 80 / 94 / 98% |
| Shopping | Plain | 45 / 68 / 85% | 72 / 89 / 96% |
| ERP | Evidence | 50 / 72 / 88% | 72 / 90 / 97% |
| ERP | Plain | 30 / 50 / 72% | 60 / 82 / 93% |

## Independent gate-pass prior

Each entry is Build `t_done` / Build `t_dry` / Test `t_done` / Test `t_dry`, with P10/P50/P90 in each cell.

| Subject | Arm | Build `t_done` | Build `t_dry` | Test `t_done` | Test `t_dry` |
| --- | --- | ---: | ---: | ---: | ---: |
| Todo | Evidence | 80 / 90 / 97% | 92 / 98 / 100% | 68 / 82 / 93% | 85 / 95 / 99% |
| Todo | Plain | 76 / 88 / 96% | 90 / 97 / 99% | 62 / 78 / 91% | 82 / 93 / 98% |
| Reddit | Evidence | 62 / 80 / 92% | 82 / 94 / 98% | 42 / 65 / 84% | 66 / 85 / 95% |
| Reddit | Plain | 48 / 72 / 88% | 76 / 90 / 97% | 28 / 52 / 75% | 55 / 78 / 91% |
| Shopping | Evidence | 55 / 72 / 86% | 80 / 92 / 98% | 35 / 58 / 78% | 65 / 84 / 94% |
| Shopping | Plain | 40 / 60 / 78% | 70 / 88 / 96% | 20 / 42 / 65% | 50 / 74 / 88% |
| ERP | Evidence | 35 / 58 / 78% | 70 / 88 / 96% | 15 / 38 / 62% | 50 / 75 / 90% |
| ERP | Plain | 20 / 45 / 68% | 60 / 82 / 94% | 5 / 22 / 45% | 35 / 65 / 84% |

## Completion honesty and censoring prior

| Subject | Arm | False first completion P10/P50/P90 | Reach `t_done` | Reach `t_dry` |
| --- | --- | ---: | ---: | ---: |
| Todo | Evidence | 8 / 18 / 35% | 92% | 82% |
| Todo | Plain | 10 / 22 / 40% | 88% | 75% |
| Reddit | Evidence | 20 / 35 / 58% | 80% | 65% |
| Reddit | Plain | 38 / 60 / 82% | 62% | 40% |
| Shopping | Evidence | 20 / 38 / 60% | 72% | 55% |
| Shopping | Plain | 45 / 70 / 88% | 50% | 30% |
| ERP | Evidence | 35 / 58 / 78% | 45% | 25% |
| ERP | Plain | 65 / 84 / 95% | 22% | 8% |

False completion means the first locally valid `outcome = complete` claim is later contradicted by independent gates or blind grading. Reach probabilities include quota, provider, host, watchdog, harness, and user-abort censoring.

## Campaign and method-overhead prior

| Subject | Arm | Phase 2 rounds P10/P50/P90 | Productive rounds P10/P50/P90 | Phase 1 method overhead P10/P50/P90 |
| --- | --- | ---: | ---: | ---: |
| Todo | Evidence | 2 / 3 / 5 | 0 / 1 / 3 | 15 / 24 / 35% |
| Todo | Plain | 2 / 3 / 6 | 0 / 1 / 4 | 25 / 40 / 55% |
| Reddit | Evidence | 2 / 4 / 7 | 0 / 2 / 5 | 18 / 26 / 38% |
| Reddit | Plain | 3 / 6 / 10 | 1 / 4 / 8 | 35 / 48 / 62% |
| Shopping | Evidence | 3 / 6 / 11 | 1 / 4 / 9 | 18 / 27 / 40% |
| Shopping | Plain | 5 / 10 / 18 | 3 / 8 / 16 | 40 / 55 / 70% |
| ERP | Evidence | 4 / 9 / 16 | 2 / 7 / 14 | 20 / 30 / 45% |
| ERP | Plain | 7 / 15 / 28 | 5 / 13 / 26 | 45 / 62 / 78% |

Method overhead is manually attributed from the preserved event and raw-response logs. It includes method reading, exhaustive planning, obligation inventory, trace maintenance, and method-specific correction. Static instruction bytes alone cannot establish it.

## Artifact-scale and residual-defect prior

| Subject | Arm | Product LOC at `t_dry` P10/P50/P90 | Test LOC at `t_dry` P10/P50/P90 | Critical/high residuals P10/P50/P90 |
| --- | --- | ---: | ---: | ---: |
| Todo | Evidence | 10 / 18 / 32 k | 4 / 8 / 15 k | 0 / 1 / 3 |
| Todo | Plain | 9 / 17 / 30 k | 3 / 7 / 13 k | 0 / 1 / 5 |
| Reddit | Evidence | 20 / 36 / 65 k | 7 / 14 / 27 k | 0 / 2 / 6 |
| Reddit | Plain | 18 / 33 / 60 k | 5 / 11 / 23 k | 1 / 4 / 12 |
| Shopping | Evidence | 45 / 80 / 145 k | 14 / 28 / 55 k | 0 / 2 / 8 |
| Shopping | Plain | 40 / 72 / 135 k | 9 / 20 / 42 k | 1 / 5 / 18 |
| ERP | Evidence | 75 / 145 / 280 k | 25 / 55 / 115 k | 1 / 5 / 18 |
| ERP | Plain | 65 / 125 / 260 k | 16 / 38 / 90 k | 4 / 14 / 45 |

LOC excludes dependencies, build output, caches, injected requirements, and method instructions. More code is descriptive, not intrinsically better.

## Directional hypotheses and threats

- Evidence is predicted to have a small final Todo quality effect, a material Reddit effect, and larger Shopping/ERP omission and integration effects.
- Evidence is predicted to reduce median `t_done` time by 25% for Todo, 40% for Reddit, 42% for Shopping, and 43% for ERP despite lint and graph-maintenance cost.
- Evidence is predicted to reduce median provider tokens at `t_dry` by 33% for Todo, 47% for Reddit, 50% for Shopping, and 50% for ERP.
- The comparison estimates the complete Evidence method bundle versus the complete Plain method bundle. It does not isolate the plugin binary from its instructions, configuration, or graph-directed correction.
- Informative censoring is the dominant threat: the longest and weakest Plain attempts are most likely to exhaust quota, making completer-only Plain quality optimistic.
- Four-cell concurrency may couple quota, provider waits, CPU, RAM, disk, browsers, and databases. Comparisons remain within randomized blocks.
- `t_dry` is a repeated finder-recall stopping rule, not proof of semantic perfection. Both arms retain a non-zero residual-defect tail.
- No local Terra calibration exists. These deliberately wide tails are planning priors, not launch authorization.
