---
name: review
description: Defines integrity review for evidence claims: comparing every tag or exclusion with its host and source, reviewing broad scopes and residual edges, and invalidating verdicts after change. Use during implementation and the final review.
---

# Review

## Phase Scope

Read [Evidence Lint](../evidence/SKILL.md) before reviewing and apply the scope named by the current user turn.

- **Backend Phase.** Restore and review `schema-models`, `api-operations`, `backend-tests`, `dto-types`, and `dto-properties` across `packages/backend/lint.config.ts` and `packages/api/lint.config.ts`. Review every requirement for backend applicability and every API/backend host, source, provider edge, and test. Frontend obligations remain pending.
- **Frontend Phase.** Restore and review `frontend-screens` and `frontend-journeys` in `packages/frontend/lint.config.ts`, including SDK-operation-to-screen residual edges and live integration. If frontend work changes API or backend sources, invalidate the affected verdicts and re-pass the complete Backend Phase before resuming.
- **Overall Phase.** Restore all three configurations and all seven claims, then review the entire project without phase partitioning.

Reject a phase report when a claim in that phase remains commented, a population was narrowed, `evidence/graph` was disabled, or an evidence rule severity was lowered. Run that phase's complete lint, build, test, and runtime gates before reviewing graph integrity.

## Coverage Is Not Integrity

The graph establishes that every configured target received `@evidence` or `@evidenceExclude` from a selected host. It does not evaluate the reason or the implementation. A tag written after doing the work and a tag copied merely to clear a diagnostic are structurally identical.

## Review The Triple

For every acknowledgement, read three artifacts:

1. the exact tag target and reason;
2. the selected declaration hosting it and the code that declaration represents;
3. the requirement, Prisma unit, SDK operation, DTO type, or screen named by the target.

A checklist may index this work; it is never evidence that the review passed. A reason must state the specific responsibility the host fulfills and be falsifiable by the code.

The host can be wrong, the named source can be wrong, or one misreading can have propagated through both. `docs/analysis/**` is immutable specification; schema, contract, implementation, tests, and screens are authored outputs and may themselves require repair.

## Review Reverse Ownership

The graph requires every configured target to receive an acknowledgement, but it does not require every selected host to carry one and does not reject an authored artifact merely because it has no owner. Enumerate selected hosts, models and columns, DTO types and properties, controller operations, provider branches and database accesses, meaningful test assertions, routes, screens, hooks, forms, and browser journeys. Map every unit back to an exact requirement, upstream contract, invariant, or reviewed architectural reason, including hosts with no evidence tag.

An unowned artifact is invented behavior even when all forward targets are acknowledged. Record these reverse-owner verdicts at the current digest; do not infer them from graph green or from the number of selected hosts.

## Review Scope And Exclusions

For a leaf target, inspect that exact unit. For an ancestor H2, Prisma model, TypeScript type, or namespace target, enumerate every selected descendant the tag discharges and verify that the one host or decision owns all of them. A broad tag that is true for only one descendant is an omission disguised as coverage.

Review every exclusion with the same triple. Confirm that the tag sits on a declaration selected by the named claim, the target belongs to one of that claim's configured references, the claim truly does not own it, the reason identifies the actual owner or observable alternative, and the stated veto condition still holds. “Not applicable,” “future work,” “internal,” and “not implemented” are conclusions, not reasons.

Exclusions are claim-local. An exclusion accepted for `frontend-screens` says nothing about `backend-tests`, and an API-package exclusion cannot discharge a backend-package obligation.

Hierarchy and disjointness are part of the verdict. Enumerate every selected descendant discharged by an H2, Prisma model, TypeScript type, or namespace exclusion, and reject a broad exclusion if any descendant belongs to the claim. Reject overlapping evidence and exclusion scopes within one claim-reference obligation; exclusion does not override evidence.

Providers are residual implementation, not claim hosts. Reject every evidence tag placed under `src/providers/**`; when a provider is the actual owner named by an exclusion, the tag remains on a selected model, operation, DTO, test, screen, or journey host.

## Review Behavioral Claims

A model, controller, provider, and test may all truthfully mention one behavioral requirement. Only an assertion that fails when the behavior disappears provides executable proof.

Read the test's setup, invoked operation, assertion, and negative path. Confirm it can fail for the named behavior rather than merely for any error. Type-checking a DTO proves shape; calling an endpoint proves reachability; neither proves the semantic rule.

## Review Residual Edges

The graph has no provider claim and no SDK-operation-to-screen claim. Review the manual residual mappings directly:

- contract effects, requirement rules, and schema invariants against every provider path;
- product-facing SDK operations against consuming screens/journeys or requirement-backed omissions;
- every provider, screen, hook, and journey back to its owner.

A green graph verdict must never be copied into these rows.

Review provider residual edges during the Backend Phase and SDK-operation-to-screen residual edges during the Frontend Phase. Review both again during the Overall Phase.

## Invalidation

A claim is about a particular meaning at a particular digest. Changing a requirement interpretation, model, DTO, operation, provider, test, screen, or cited JSDoc invalidates every downstream review that depended on it.

Record the finding before repair, mark dependent verdicts stale, repair at the owning layer, regenerate outputs, rerun validation, and review the complete affected population. Never preserve a prior verdict because its tag text still parses.

Keep graph-integrity, reverse-owner, exclusion, and residual-edge verdicts in `.wiki/review.md`.
For every row record the exact target or source identity, claiming artifact and member, falsifiable reason, current source digest, and `pending`, `accepted`, or `stale` verdict.
Record findings before repair and retain stale rows until their replacements pass the next complete review.

Review every graph claim and residual edge in the active phase before its phase report. The Overall Phase must review the complete graph and every residual edge again. Do not edit frozen instructions, and do not weaken a lint configuration to make the review green.
