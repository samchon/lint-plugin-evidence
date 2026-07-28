# Safety-limit candidate analysis — not a frozen prior or authorization

No numeric safety limit is accepted yet. The first mechanical proposal multiplied the larger arm's conditional `t_dry` provider-total-token P90 and Standard wall-time P90 by 1.25, rounded outward, and summed cell limits for each four-cell block. That yields cell candidates of Todo 1.3B/54h, Reddit 6.1B/228h, Shopping 34B/1,356h, and ERP 52B/2,700h; Todo+Reddit block 15B/230h and Shopping+ERP block 172B/2,706h. These values are deliberately not copied into `pins.json`.

The proposal is not yet safe or sufficiently grounded. The active prior supplies subjective total-token quantiles and a category composition, but it does not expose a validated workload equation for top-level turns, descendant requests, finder/fixer rounds, cache replay multiplicity, or concurrency dependence. Provider `totalTokens` already includes inclusive input plus output per response; cached and cache-write subsets must not be added again. Summing marginal P90s is a conservative planning arithmetic, not a block P90. Using the maximum cell wall quantile is only a concurrency proxy. The enormous later-wave limits may protect prior completion probability while failing the user's bankruptcy-protection purpose.

The independent audit must reconstruct and sensitivity-test:

- top-level and descendant response counts by phase;
- input, cache-read, cache-write, output, and provider-total units without duplicate subsets;
- finder, verifier, fixer, grading, and activity-rating rounds and their exclusion from generation totals where applicable;
- cell dependence and overlapping wall intervals;
- conditional milestone reach and informative censoring.

The reviewed candidates are rejected and remain non-authorizing. In particular, the Shopping and ERP wall candidates (56.5 and 112.5 days) conflict with the user-facing expectation and bankruptcy-protection purpose, while the proposed block token values merely equal or exceed the sum of their cell guards and therefore provide no earlier aggregate protection. The statistical completion-tail ceiling remains a planning distribution, not an operator safety authorization.

Any later executable numeric proposal may take the minimum only of comparable provider-total-token quantities:

1. a scientifically justified completion-tail guard from the audited workload prior;
2. an operator-authorized per-cell and block provider-total-token guard chosen for loss tolerance;

The current `account/rateLimits/read` surface reports nullable primary, secondary, individual, and spend-control state but no comparable provider-total-token capacity. It is therefore a separate typed native first-hit `OR` guard, never a numeric member of the minimum and never converted into tokens. The retained block plan records only the non-identifying result class for each window, capture time, typed policy identity and digest, attestation digest, and `guardRelation = independent-first-hit-or`.

Exact percentages, windows, reset times, bucket identifiers, balances, raw account identifiers, credentials, rate-limit payloads, and derived fingerprints exist only in the private ephemeral control-plane checkpoint and are destroyed after the attestation is sealed; they never enter a retained, promoted, wiki, issue, or review artifact. If account telemetry is credit-based or otherwise not convertible under the frozen token semantics, a numeric quota candidate is `unavailable`, not guessed. Every token limit remains an observed-response threshold rather than a hard ceiling, every native quota stop is independently actionable, and every stop remains right-censored data.

Before launch, the operator receives expected block P50/P90 token and wall vectors, proposed cell and block limits, live quota applicability, and worst-case overshoot limitations. A paid start requires a new formal checkpoint that fills the numeric pins after independent audit.
