# Current-freeze Standard-tier correction — prediction, not measurement

This is the authoritative pre-observation tier correction for the current Todo, Reddit, Shopping, and ERP freeze, formally submitted at https://github.com/samchon/lint-plugin-evidence/pull/105#pullrequestreview-4801307464. The earlier current-freeze review at https://github.com/samchon/lint-plugin-evidence/pull/105#pullrequestreview-4801252166 assumed Codex service tier `priority` while its price sheet used Standard rates. Codex `priority` is Fast and costs 2.5 times Standard credits, so that combination is internally invalid. The prior review remains immutable history and cannot authorize or predict the final experiment configuration.

No paid generation result, transcript, grade, gate outcome, or token observation informed this correction. The final experiment requests Codex service tier `default`, which selects Standard Terra and omits an upstream priority override. Fast/`priority` is forbidden. A changed model, tier, corpus digest, method bundle, or price sheet requires another new prior and formal COMMENT review before a paid request.

## Inherited frozen inputs and non-time priors

The exact current-freeze scale remains Todo 7 files/6 Markdown/109,236 bytes/9,109 words/H2 22/H3 66/AC 211; Reddit 7/6/170,984/16,959/48/176/255; Shopping 7/6/803,964/39,974/93/471/2,083; and ERP 13/7/1,055,883/53,789/raw H2 265/narrative H2 261/H3 1,344/AC 1,724 plus CTX 986. ERP acceptance and context remain disjoint.

Provider-token totals, category composition, acceptance coverage, ERP context coverage, non-vacuous requirement-to-test coverage, build/test gate probabilities, completion honesty, reach probabilities, Phase 2 rounds, method overhead, artifact LOC, and residual-defect priors are inherited exactly from `current-freeze-all-subjects.md`. Priority changes request scheduling and credit rate, not the preregistered semantic estimand or token/quality distributions. Standard provider credits use 62.5 per million non-cached input, 6.25 per million cache read, 78.125 per million cache write, and 375 per million output including reasoning. USD remains null.

## Revised Standard wall-clock prior

Standard-versus-Fast latency has no local Terra calibration. The planning correction therefore applies a transparent subjective 1.5× wall-time factor to the prior conditional quantiles and rounds outward. This factor is deliberately uncertain and must not be read as an observed speed ratio.

| Subject | Arm | `t_done` P10/P50/P90 | `t_dry` P10/P50/P90 |
| --- | --- | ---: | ---: |
| Todo | Evidence | 5 / 9 / 20 h | 8 / 14 / 30 h |
| Todo | Plain | 6 / 12 / 27 h | 9 / 18 / 42 h |
| Reddit | Evidence | 12 / 27 / 63 h | 18 / 42 / 99 h |
| Reddit | Plain | 18 / 45 / 108 h | 27 / 78 / 180 h |
| Shopping | Evidence | 54 / 126 / 324 h | 90 / 216 / 540 h |
| Shopping | Plain | 90 / 216 / 576 h | 144 / 396 / 1,080 h |
| ERP | Evidence | 108 / 288 / 720 h | 180 / 468 / 1,260 h |
| ERP | Plain | 180 / 504 / 1,260 h | 324 / 936 / 2,160 h |

The wall-time tails are conditional on reaching each milestone. Unconditional reach and right-censoring probabilities remain the previously frozen values. Informative censoring remains the dominant threat, especially for Shopping Plain and ERP Plain.

## Configuration and launch consequence

- Every thread requests model `gpt-5.6-terra`, effort `high`, Codex service tier `default`, and provider fallback disabled.
- `ThreadStartResponse` reconciles the effective thread configuration. Every later turn repeats the frozen request. A settings update, priority override, or `model/rerouted` notification fails closed.
- Raw response events do not expose actual per-response model or tier; no report may invent that identity.
- The official rate and cache-semantics source snapshots are still null. This prior freezes expectations but does not open the paid launch gate.
