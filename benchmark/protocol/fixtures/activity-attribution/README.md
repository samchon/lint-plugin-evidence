# Activity attribution fixtures

`cases.json` freezes the semantic failures exercised by `EvidenceBenchmarkActivitySelfTest`. The executable fixture constructs exact usage, event, activity, assignment, rating, adjudication, and report artifacts in memory and performs no provider call.

Schema validity is only the first layer. Production admission also recomputes the RFC 8785 event chain, exact-byte ledger and parent-core bindings, token arithmetic, runner-issued assignment digests, complete event membership, rater independence, probability sums, adjudication inputs, right-censoring, and token/time reconciliation.

`valid-complete` is the positive control. Every invalid case changes one consequence-bearing fact while recomputing the surrounding attacker-controlled digests where relevant, so a shallow outer-hash check cannot satisfy the fixture.
