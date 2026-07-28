# Activity Attribution Adapter

This module separates exact observations from semantic estimates. It never claims that Codex exposes the purpose of a response, model-active time, or provider-wait time.

## Adapter boundary

The runner supplies exact parent core-seal, outer run-manifest, materialization-manifest, usage-ledger, semantic-event-ledger, and activity-ledger bytes, the immutable binding, one deduplicated observation per usage-ledger response, and item lifecycle observations. The validator proves the core seal names the run manifest and exact ledgers; the run manifest names the run, block, and materialization input; and the materialization manifest names its base, arm, requirements, workspace, and aggregate input digests together with `sha256-posix-path-nul-bytes-v1`. It recomputes the RFC 8785 event chain and requires every response and item event reference to name a verified chain member. An unqualified or disconnected digest cannot pass. `EvidenceBenchmarkActivityObservations.create` then verifies response provenance and counters, token arithmetic, unique IDs, capture and closure state, interval bounds, and ordered-epoch links before a rating turn may run.

The CLI admits `provider-output-registry.json` through `EvidenceBenchmarkActivityRegistry.admit`. It rejects remote references, root escape, symbolic schema files, byte or digest drift, missing activity turn classes, and provider keywords outside the registry allowlist. The returned schema identities must equal the immutable binding.

The rating controller runs `activity-rater-a` and `activity-rater-b` in distinct processes, threads, sessions, turns, and upstream responses. A runner-issued assignment binds each turn to the exact observation digest, full verified event catalog, response catalog, codebook, process provenance, model, effort, and isolation state. The execution record binds the assignment to exact process-start, assignment, turn-start, raw-response-completed, and final agent-message item-completed events in a recomputed runner chain. Raw response bytes prove usage only. Separately retained item-completed bytes carry the JSON text whose canonical digest must equal the provider-output artifact. The exact process artifact fixes the process nonce, PID, UTC and monotonic start, invocation, executable, OpenAI provider, ChatGPT authorization class, Codex `0.145.0`, `gpt-5.6-terra`, high effort, omitted requested service tier, and effective null service tier. Each rater sees neither the other output nor aggregate arm results and cites selected evidence as `[[event:<event-sha256>]]` in its rationale. Provider JSON Schema controls the model-facing shape; local admission enforces the cross-row probability, evidence, causal-role, identity, assignment, execution, and isolation rules that JSON Schema cannot settle.

The deterministic queue sends disagreements, weak confidence, residual probability, missing citations, and high-influence responses to a fresh `activity-adjudicator` thread. Its generic provider decision is locally restricted to `rater_a`, `rater_b`, or `unresolved` and is bound to both rater artifact digests, the queue digest, the observation digest, the codebook digest, and the parent core seal.

## Report semantics

Exact token totals come only from non-null `rawResponse/completed` rows in the bound source ledger. Whole-response category tables contain exact counters under estimated labels. Probability-weighted token and lifecycle-time values are estimates represented as integer numerators over 10,000; lower and upper rows preserve inter-rater semantic uncertainty.

Category union wall, source-reported activity time, pairwise overlap, and exclusive-equivalent wall are distinct quantities. Union and activity sums can exceed cell wall under parallel work. Exclusive-equivalent wall splits each elementary segment over its distinct point categories and assigns sub-nanosecond integer remainders in frozen codebook order so the published integer rows reconcile exactly to wall.

Uncovered wall, ambiguous item links, absent adjudication, nullable usage, and censored lifecycle endpoints remain residual or right-censored. A report with either state is retained, but its status forbids a complete method-attribution claim.

## Offline verification

```bash
pnpm --dir benchmark run test:unit
```

The activity fixture performs no model call. It covers registry closure and traversal rejection, core-seal and exact-ledger drift, event-chain recomputation, duplicate responses, token arithmetic, runner-issued assignment sealing, independent rater provenance, probability sums, adjudication input sealing, descendant-thread responses, same-turn responses, same-category and cross-category overlap, source-duration drift, residual wall, right-censoring, exact token reconciliation, and exclusive-wall reconciliation.
