# Todo and Reddit prior — prediction, not measurement

This prior was recorded before any paid run and formally submitted on PR #105 at https://github.com/samchon/lint-plugin-evidence/pull/105#pullrequestreview-4800288874. It is based on requirements and template snapshot `66d6c89bedcfcf60d31781768a07cd5f110f305a`, static corpus counts, method-instruction counts, and a broad prior-art scale anchor. It is not a benchmark result, confidence interval, cost authorization, or promise of completion.

Observed data must not be written into this file. Runs write under `benchmark/result/` and the permanent issue ledger. A later Shopping/ERP prior receives a new file and a new formal comment so history remains visible.

## Assumptions

- Codex `0.145.0`, `gpt-5.6-terra`, reasoning effort `high`.
- A complete, merged, independently green full-stack scaffold and real local product tarball.
- Todo Evidence/Plain and Reddit Evidence/Plain launch as one identical four-run concurrency block.
- Wall-clock excludes setup/install and external grading.
- Token totals are cumulative provider totals including cache replay, in millions of tokens; reasoning is an output subset and is not double-counted.
- P10/P50/P90 are subjective prior quantiles, not sampling confidence intervals.

## Wall-clock prior

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Todo | Evidence | 3 / 6 / 13 h | 5 / 9 / 20 h |
| Todo | Plain | 4 / 8 / 18 h | 6 / 12 / 28 h |
| Reddit | Evidence | 8 / 18 / 42 h | 12 / 28 / 66 h |
| Reddit | Plain | 12 / 30 / 72 h | 18 / 52 / 120 h |

## Provider-token prior

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Todo | Evidence | 71 / 178 / 426 M | 122 / 264 / 660 M |
| Todo | Plain | 102 / 264 / 659 M | 163 / 396 / 1,014 M |
| Reddit | Evidence | 255 / 609 / 1,520 M | 407 / 963 / 2,432 M |
| Reddit | Plain | 407 / 1,013 / 2,630 M | 662 / 1,823 / 4,852 M |

The P50 provider totals are predicted to be approximately 98% cache replay. The runner records non-cached input, cache read, cache write, output, reasoning subset, and provider total separately; this prior does not authorize collapsing measured categories.

## Coverage and gate prior

| Subject/Arm | Requirement at done/dry P50 | Non-vacuous tests at done/dry P50 | Build pass at done/dry | Test pass at done/dry | False completion |
| --- | ---: | ---: | ---: | ---: | ---: |
| Todo Evidence | 97 / 99% | 93 / 97% | 90 / 98% | 82 / 95% | 18% |
| Todo Plain | 96 / 98.5% | 88 / 96% | 88 / 97% | 78 / 93% | 22% |
| Reddit Evidence | 94 / 98% | 88 / 95% | 80 / 94% | 65 / 85% | 35% |
| Reddit Plain | 82 / 96% | 70 / 90% | 72 / 90% | 52 / 78% | 60% |

Coverage was predicted with H3 leaves as a temporary proxy. Measured primary coverage uses the frozen atomic-clause denominator, so direct equality with this proxy is not expected.

## Campaign and method prior

| Subject/Arm | Phase 2 rounds P10/P50/P90 | Productive rounds P10/P50/P90 | Phase 1 method overhead P10/P50/P90 |
| --- | ---: | ---: | ---: |
| Todo Evidence | 2 / 3 / 5 | 0 / 1 / 3 | 15 / 24 / 35% |
| Todo Plain | 2 / 3 / 6 | 0 / 1 / 4 | 25 / 40 / 55% |
| Reddit Evidence | 2 / 4 / 7 | 0 / 2 / 5 | 18 / 26 / 38% |
| Reddit Plain | 3 / 6 / 10 | 1 / 4 / 8 | 35 / 48 / 62% |

## H1–H5 prior

- H1 is expected to hold for Todo, with a final median gap near one percentage point.
- H2 is expected to be falsified by the current method bundle: Evidence/Plain median `t_done` wall-time is predicted near 0.75 for Todo and 0.60 for Reddit because Plain already mandates repeated exhaustive campaigns.
- H3 is not adjudicated before Shopping and ERP. The pilot tail ratio is predicted to increase from roughly 1.3 at Todo to 2.2 at Reddit.
- H4 may hold only for unacknowledged omissions inside the configured denominator. False acknowledgements and semantic defects remain possible.
- H5 is expected to hold: dry is the finder's recall limit, not semantic truth, and at least one run in each arm may remain below 100%.

The largest uncertainties are missing local Terra calibration, the final scaffold's artifact scale, four-run quota coupling, app-server cache semantics, and informative censoring in the Reddit Plain tail.
