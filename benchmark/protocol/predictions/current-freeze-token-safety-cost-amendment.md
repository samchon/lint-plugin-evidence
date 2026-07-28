# Current-freeze token-safety and monetary-status amendment — prediction, not measurement

Formal review: https://github.com/samchon/lint-plugin-evidence/pull/105#pullrequestreview-4801470216.

This append-only amendment corrects the launch consequence stated in `current-freeze-cache-write-rate-addendum.md`. The unresolved ChatGPT cache-write provider-credit rate remains real and the value 78.125 remains forbidden, but monetary conversion is a secondary output rather than a primary estimand or safety control. Provider credits and USD therefore remain literally unavailable, and the benchmark makes no cost-effectiveness claim. Their absence does not by itself block a token/time/quality run.

No paid generation result, transcript, grade, gate result, time observation, token observation, or quality observation informed this amendment. All frozen corpus sizes, Standard wall-time quantiles, provider-token priors, quality priors, coverage priors, censoring priors, campaign priors, and directly sourced rate facts remain unchanged. Prior monetary totals and monetary stop thresholds are withdrawn as unavailable.

Safety authorization instead freezes one `maximumObservedTotalTokens` and one hard wall duration per subject and replicate, identical across Evidence and Plain. The runner sums deduplicated raw-response provider `totalTokens`. When that observed total reaches the threshold, or when the absolute deadline arrives, it interrupts the active turn and kills the complete process tree. Because usage arrives only after provider responses complete and several requests may already be in flight, `hardCeilingGuaranteed = false`; overshoot can exceed one response, and a forced stop can leave only a right-censored lower bound. A true hard token or monetary ceiling would require an upstream synchronous authorization hook.

The exact numeric token thresholds and wall durations remain execution pins and must be frozen with the merged plan before paid launch. This amendment is not a cost authorization or launch approval.
