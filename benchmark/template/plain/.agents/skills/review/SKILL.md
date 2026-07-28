---
name: review
description: Defines integrity review for plain-arm mappings: comparing every ledger claim with its artifact and source, reviewing non-applicability decisions, and invalidating verdicts after change. Use during the Phase One final pass and within each runner-activated Phase Two global round.
---

# Review

## A Filled Row Is Not A True Row

The manual ledger records that an artifact is said to realize a requirement, model, operation, or shape. It does not establish that the statement is accurate. A detailed-looking row can still describe adjacent behavior or close a whole section with one partial implementation.

[The completeness skill](../completeness/SKILL.md) owns populations, bidirectional walks, Phase boundaries, and the ledger. This skill owns whether each mapping is true.

## Review The Triple

For every mapping, read three artifacts:

1. the ledger statement, including its exact source/artifact identities and reason;
2. the claiming code, test, schema, or screen;
3. the requirement, model, operation, DTO, or upstream artifact the row names.

The ledger is an index for this reading, never evidence that the reading passed. A reason is useful only when the current code can contradict it.

The claiming artifact can be wrong, the named source can be wrong, or one misreading can have propagated through both. `docs/analysis/**` is immutable specification; schema, contract, implementation, tests, and screens are authored outputs and may themselves require repair.

## Review Granularity And Absence

Review each H2 and H3 identity independently. A row for an H2 does not silently close its H3 descendants. If one artifact owns an entire subtree, enumerate every descendant responsibility in the review record.

A non-applicability, non-storage, non-exposure, or deliberate-omission row is a claim with the same burden as implementation. Confirm the exact source permits the absence, identify the actual owner or observable alternative, and state what would prove the decision wrong. “Not applicable,” “future work,” and “internal” are conclusions, not reasons.

## Review Behavioral Claims

A model, controller, provider, and test may all map to one behavioral requirement. Only an assertion that fails when the behavior disappears provides executable proof.

Read the test's setup, invoked operation, assertion, and negative path. Confirm it can fail for the named rule rather than merely for any error. Type-checking a DTO proves shape; calling an endpoint proves reachability; neither proves semantic behavior.

The benchmark's destructive check frequency is not chosen here. [phase-two.md](../completeness/phase-two.md) requires exactly one mutation check per global Phase Two round in both arms, with byte-for-byte restoration. Do not add plain-only mutation passes during Phase One.

## Reverse Ownership

Review the backward populations as seriously as requirement coverage:

- every model and column;
- every authored DTO type/property and controller operation;
- every provider branch and database access;
- every meaningful test assertion;
- every route, screen, hook, form, and browser journey.

Each needs a requirement, upstream contract, invariant, or reasoned architectural owner. An unowned artifact is invented behavior even when all forward rows are full.

## Invalidation

A verdict belongs to one meaning at one digest. Changing a requirement interpretation, model, DTO, operation, provider, test, screen, or mapping reason invalidates every downstream verdict that depended on it.

Record the finding before repair, mark dependent rows stale, fix the owning layer, regenerate outputs, rerun validation, and review the complete affected population. Never retain a dry or green label from the previous digest.

## Phase Boundaries

Phase One performs one exhaustive truth pass over all current mappings before the first terminal completion report. It does not run the shared two-clean-round campaign early.

Only the benchmark runner's separate activation turn starts Phase Two. During that phase, follow the identical global-round and stopping rules in [phase-two.md](../completeness/phase-two.md), without editing frozen method or lint configuration files.
