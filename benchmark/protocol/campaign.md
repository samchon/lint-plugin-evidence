# Phase 2 discovery campaign

Phase 2 measures the cost and recall limit of continued discovery after the generator's first schema-valid completion outcome. It is identical across arms and begins only after `t_done`, its immutable snapshot, and a schema-valid `outcome = complete` from the fixed completion challenge have been recorded.

## Inputs

Each round receives:

- the byte-identical frozen requirements;
- the frozen atomic-clause catalog;
- a new neutral grading bundle produced from the current raw workspace;
- the six frozen lens files under `lenses/` and their four fixed finder assignments;
- the finder, verifier, and fixer prompts by exact digest;
- the canonical findings accumulated in earlier rounds, available only to deduplication and not to fresh finders.

Finders and verifiers never receive the raw workspace, AGENTS or skills, lint configuration or output, evidence annotations, arm name, prior transcript, quota history, or another agent's identity. Each finder gets a separate read-only bundle instance with a unique instance ID; all four instances must have the same neutral tree digest. The fixer receives the verified manifest and raw workspace only after neutral verification and the harness mutation probe are complete.

## Round procedure

1. Record `campaign.round.started`, compute the authored-state digest, and create one canonical stripped bundle from the current raw workspace.
2. Materialize four isolated read-only instances of that bundle, prove all four have the canonical bundle digest, and start four fresh top-level finder threads concurrently according to the fixed assignment table. A finder receives no other finder output.
3. Send only `schema/finding-provider.schema.json` as `turn/start.outputSchema`, then validate each response again against `schema/finding-local.schema.json`. A provider-invalid, locally invalid, interrupted, or incomplete finder result invalidates the round and cannot count as clean.
4. Deduplicate candidates against the index for the current authored-state digest using clause IDs, observed behavior, artifact locations, and reproduction paths. Text similarity alone does not establish a duplicate. A rejected or duplicate decision from another digest cannot skip verification.
5. Send every deduplicated-new candidate to independent fresh top-level adversarial verifier threads. A verifier sees only the neutral bundle, frozen requirements and inventory, and its candidate manifest; it returns `verified`, `rejected`, `duplicate`, or `unverifiable` under the `schema/verification-provider.schema.json` and `schema/verification-local.schema.json` pair.
6. Run exactly one harness-owned mutation probe against the raw workspace, restore the original bytes immediately, and add a surviving mutation as a verified `test_oracle_gap`. Finder, verifier, and fixer agents never choose or apply the probe.
7. Classify every verified finding with the frozen defect taxonomy. For an evidence workspace, a separate harness analysis later determines whether an omission was inside or outside the configured denominator; the neutral verifier is not told the arm.
8. If at least one new finding is verified, mark every one `repair_pending`, write one immutable fixer handoff conforming to `schema/fixer-handoff.schema.json`, and give it to the arm-aware fixer in the raw workspace. Record every fix event, token, duration, file change, test, and gate.
9. Reject a no-op fixer: the authored-state digest must change. Materialize a new post-fix neutral bundle and give each finder-sourced repair to a fresh top-level closure verifier with its original reproduction. A finding becomes `fixed` only when the fresh verifier and deterministic reproduction both prove the defect absent on that exact digest. `still_present` or `unverifiable` remains `repair_pending`, invalidates the round, and blocks the clean streak. If a surviving mutation created a `test_oracle_gap`, replay the same selected mutation after the repair and require the expected gate failure plus exact byte restoration; this replay belongs to the original target's one probe episode, not a second selected probe.
10. Run harness-owned canonical gates, compute the post-round authored-state digest, record the live-workspace inventory and retained project snapshot, and record one object conforming to `schema/campaign-round.schema.json`.
11. Reset the clean streak to zero when `verifiedNew > 0`, a gate fails, a mutation does not fail as expected, byte restoration fails, any read-only actor mutates its bundle, a repair lacks digest-scoped closure proof, or the round is otherwise invalid. Increment it by one only when the round is valid, `verifiedNew = 0`, and its authored-state digest equals the immediately preceding clean round's digest.
12. Record `t_dry` only when the clean streak reaches `K = 2`.

Findings discovered while fixing do not bypass verification. They enter the next round as finder candidates or are recorded as ordinary remediation outside the campaign finding count.

Every raw finder candidate has exactly one lifecycle row. A deduplicated duplicate has no verifier; every deduplicated-new candidate has exactly one fresh verifier; `unverifiable` invalidates the round; and the fixer handoff set must equal the verified lifecycle set plus a surviving mutation's verified `test_oracle_gap`. Raw, lifecycle, deduplicated-new, verified, mutation, handoff, and closure-resolution IDs and counts reconcile before a round may be valid.

The append-only finding history owns globally unique canonical IDs and never discards a rejected, duplicate, unresolved, repaired, or recurrent finding. A separate active dedupe index is keyed by the exact authored-state digest. Any authored change clears that active index; only the history remains. A `fixed` history event names the post-fix digest, fresh verifier, reproduction evidence, and gates that closed it.

The schema-valid round object owns the complete inline finder, lifecycle, verifier, mutation, fixer, resolution, and gate records. It does not point to a second copied finder manifest. Exact model response bytes remain in the raw stream and each semantic event carries its byte reference. `provider-output-registry.json` is the exhaustive owner of model-facing schemas; the only separate cross-boundary artifact is the immutable verified-only fixer handoff.

## Fixed lenses and finder assignments

| Lens ID | File | Population |
| --- | --- | --- |
| `requirements` | `lenses/requirements.md` | Every atomic criterion, source section, table, enumeration, boundary, and named outcome |
| `database` | `lenses/database.md` | Requirements to models and columns, then authored schema back to requirements |
| `api` | `lenses/api.md` | Requests, responses, errors, auth, persistence effects, SDK, and operation ownership |
| `logic` | `lenses/logic.md` | Business rules, states, authorization, concurrency, transactions, integrity, security, and non-functional behavior |
| `tests` | `lenses/tests.md` | Requirements, operations, shapes, behaviors, negative paths, boundaries, and non-vacuous assertions |
| `frontend` | `lenses/frontend.md` | User-visible requirements, SDK access, routes, screens, forms, states, accessibility, and browser journeys |

| Finder assignment | Lenses |
| --- | --- |
| `F1-requirements-database` | `requirements`, `database` |
| `F2-api-logic` | `api`, `logic` |
| `F3-tests` | `tests` |
| `F4-frontend` | `frontend` |

Changing a lens, assignment, population, finder count, or K after a run starts creates a new protocol revision and invalidates affected cells.

## Harness-owned mutation probe

Each subject freezes a mutation population before the first run. A target names one critical acceptance criterion, authored file and syntax-aware mutation, expected failing gate, and byte-restoration procedure. Paired arms select the same criterion by sorting eligible target IDs and indexing with `SHA256(blockId + subject + replicate + round + mutationPopulationDigest)`, deliberately excluding arm.

The harness records target ID, path and source span, pre-mutation SHA-256, mutated SHA-256, command, expected and actual exit and diagnostic, restored SHA-256, and post-restore gate. Restoration requires the exact original bytes and `restoredSha256 = preMutationSha256`.

A mutation that survives its expected gate is a verified `test_oracle_gap`; a restoration mismatch invalidates the round and stops the cell. If repaired, the harness mutates the same target again and requires the expected failure before closing the finding. One selected target, its initial attempt, any required post-fix replay, and every exact restore together count as the round's one mutation probe episode.

## Authored-state digest

Build a path-independent manifest from the frozen include and exclusion rules. For each included entry, record the NFC-normalized POSIX relative path, entry kind, normalized executable bit, byte length, and SHA-256 of file bytes; for a symlink, hash the exact target bytes. Sort entries by UTF-8 path bytes, serialize the array with RFC 8785 canonical JSON, and SHA-256 the serialized bytes.

Timestamps, absolute roots, filesystem enumeration order, inode and hard-link identity, dependencies, caches, build and coverage output, Playwright artifacts, completeness ledgers, and regenerated outputs do not enter the digest. The round manifest records included and excluded counts and the ruleset digest.

Two clean rounds establish dryness only at the same authored-state digest. A repair or any other authored-state change resets the streak even when no later finder reports it.

## Finding taxonomy

| Class | Meaning |
| --- | --- |
| `requirement_omission` | An applicable atomic obligation has no implemented behavior |
| `partial_implementation` | Some required cases or surfaces exist but the full obligation does not |
| `semantic_defect` | Behavior exists but contradicts the obligation |
| `false_acknowledgement` | Traceability claims coverage while the required behavior is absent or wrong |
| `configuration_coverage` | The obligation is outside the configured evidence denominator |
| `test_oracle_gap` | A test exists but cannot detect the relevant missing or wrong behavior |
| `non_defect` | The candidate is satisfied, inapplicable, duplicate, or based on a false premise |

For issue #88 compatibility, `requirement_omission`, `partial_implementation`, and `false_acknowledgement` are reported separately and also rolled up into an omission-family total. A configuration gap is never relabelled as an in-denominator omission.

## Verification standard

A verified finding names the exact atomic clauses, exact artifact locations, expected behavior, observed behavior, and a deterministic reproduction or inspection path. A missing citation or weak test is not automatically a product defect. The verifier must establish the behavioral consequence. Fixer completion and green gates do not close a finding: closure requires a fresh post-fix verifier and reproduction on the exact after-fix authored digest.

`unverifiable` is not a rejection. It keeps the round from being clean until a replacement verifier can complete or the run becomes interrupted.

## Interruption and resumption

Every interruption preserves the raw streams, current manifest, checkpoint, workspace, bundle, candidate and verdict manifests, clean streak, outstanding fixer work, and observed cost. A deliberate harness pause may continue the same run ID only when the same live app-server process and lossless controller transport remain attached and a fixture proves no raw byte, response ID, usage notification, or turn changed during the pause.

App-server death, controller-transport loss, host failure, or provider interruption is terminal for a Codex `0.145.0` measured attempt because `thread/resume` disables experimental raw events. The harness verifies and seals that run as right-censored, invalidates the incomplete round for K=2, and starts any replacement from a new run ID, fresh workspace, and fresh thread. It never replays, stitches, or continues measured model turns under the old ID.
