---
name: review
description: Defines integrity review for evidence claims: comparing every tag or exclusion with its host and source, reviewing broad scopes and residual edges, and invalidating verdicts after change. Use during the Phase One final pass and within each runner-activated Phase Two global round.
---

# Review

## Coverage Is Not Integrity

The graph establishes that every configured target received `@evidence` or `@evidenceExclude` from a selected host. It does not evaluate the reason or the implementation. A tag written after doing the work and a tag copied merely to clear a diagnostic are structurally identical.

[The completeness skill](../completeness/SKILL.md) owns configured claims, residual edges, Phase boundaries, and the ledger. This skill owns whether each recorded claim is true.

## Review The Triple

For every acknowledgement, read three artifacts:

1. the exact tag target and reason;
2. the selected declaration hosting it and the code that declaration represents;
3. the requirement, Prisma unit, SDK operation, DTO type, or screen named by the target.

The ledger indexes this work; it is never evidence that it passed. A reason must state the specific responsibility the host fulfills and be falsifiable by the code.

The host can be wrong, the named source can be wrong, or one misreading can have propagated through both. `docs/analysis/**` is immutable specification; schema, contract, implementation, tests, and screens are authored outputs and may themselves require repair.

## Review Scope And Exclusions

For a leaf target, inspect that exact unit. For an ancestor H2, Prisma model, TypeScript type, or namespace target, enumerate every selected descendant the tag discharges and verify that the one host or decision owns all of them. A broad tag that is true for only one descendant is an omission disguised as coverage.

Review every exclusion with the same triple. Confirm that the named claim truly does not own the target, identify the actual owner or observable alternative, and test the veto condition against the requirement. “Not applicable,” “future work,” and “internal” are conclusions, not reasons.

Exclusions are claim-local. An exclusion accepted for `frontend-screens` says nothing about `backend-tests`, and an API-package exclusion cannot discharge a backend-package obligation.

## Review Behavioral Claims

A model, controller, provider, and test may all truthfully mention one behavioral requirement. Only an assertion that fails when the behavior disappears provides executable proof.

Read the test's setup, invoked operation, assertion, and negative path. Confirm it can fail for the named behavior rather than merely for any error. Type-checking a DTO proves shape; calling an endpoint proves reachability; neither proves the semantic rule.

The benchmark's destructive check frequency is not chosen here. [phase-two.md](../completeness/phase-two.md) requires exactly one mutation check per global Phase Two round in both arms, with byte-for-byte restoration. Do not add evidence-only mutation passes during Phase One.

## Review Residual Edges

The graph has no provider claim and no SDK-operation-to-screen claim. Review the manual residual mappings directly:

- contract effects, requirement rules, and schema invariants against every provider path;
- product-facing SDK operations against consuming screens/journeys or requirement-backed omissions;
- every provider, screen, hook, and journey back to its owner.

A green graph verdict must never be copied into these rows.

## Invalidation

A claim is about a particular meaning at a particular digest. Changing a requirement interpretation, model, DTO, operation, provider, test, screen, or cited JSDoc invalidates every downstream review that depended on it.

Record the finding before repair, mark dependent verdicts stale, repair at the owning layer, regenerate outputs, rerun validation, and review the complete affected population. Never preserve a prior verdict because its tag text still parses.

## Phase Boundaries

Phase One performs one exhaustive integrity and residual pass at the current digest before the first terminal completion report. It does not run the shared two-clean-round campaign early.

Only the benchmark runner's separate activation turn starts Phase Two. During that phase, follow the identical global-round and stopping rules in [phase-two.md](../completeness/phase-two.md), without editing frozen method or lint configuration files.
