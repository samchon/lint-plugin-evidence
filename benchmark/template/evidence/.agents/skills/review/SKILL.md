---
name: review
description: Defines integrity review for active evidence claims: restoring their configuration, comparing every acknowledgement with its host and source, checking broad scopes and exclusions, and rerunning affected gates after a correction. Use during implementation and before an evidence-arm phase report.
---

# Review

## Phase Scope

Read [Evidence Lint](../evidence/SKILL.md) before reviewing and apply the phase named by the current user turn.

- **Backend Phase.** Restore and review `schema-models`, `api-operations`, `backend-tests`, `dto-types`, and `dto-properties` across `packages/backend/lint.config.ts` and `packages/api/lint.config.ts`. Frontend claims remain pending.
- **Frontend Phase.** Restore and review `frontend-screens` and `frontend-journeys` in `packages/frontend/lint.config.ts`. If frontend work changed API or backend sources, restore the affected claims and re-pass the Backend Phase gates first.
- **Overall Phase.** Restore all three configurations and review all seven claims.

Reject a phase report when an active-phase claim remains commented, a population was narrowed, `evidence/graph` was disabled, an evidence rule severity was lowered, or a configuration-only environment bypass replaced an ordinary gate.

The base layer skills and executable tests own general implementation correctness. This review owns the configured Evidence Graph and the truth of the declarations used to satisfy it. Do not add a Plain-style census of every unselected artifact, provider branch, database access, SDK consumer, or residual edge.

## Coverage Is Not Integrity

The graph establishes that every configured target received `@evidence` from a selected ownership host or `@evidenceExclude` from an eligible carrier in a matching claim file. It does not decide whether the reason is true. A tag copied merely to clear a diagnostic and a tag written after doing the work are structurally identical.

## Review Every Acknowledgement

For every `@evidence` and `@evidenceExclude` acknowledgement in the active claims, read three artifacts:

1. the exact target and reason;
2. the selected declaration hosting the tag and the code that declaration represents;
3. the requirement, Prisma unit, SDK operation, DTO type, or screen named by the target.

Confirm that the host belongs to the claim, the target belongs to that claim's configured reference, and the reason states a specific responsibility or omission that the current code can falsify. A checklist may index this work; it is not proof by itself.

## Broad Scopes And Exclusions

For a leaf target, inspect that unit. For an H2, Prisma model, TypeScript type, or namespace target, enumerate the selected descendants discharged by the acknowledgement and confirm the same reason is true for all of them. Use a narrower target when one host does not own the entire selected subtree.

Review an exclusion with the same triple. The reason names the actual owner or observable alternative and a condition that would veto the omission. "Not applicable," "future work," "internal," and "not implemented" are conclusions, not reasons.

Exclusions are claim-local. Keep evidence and exclusion scopes disjoint within each claim-reference obligation. An acknowledgement in one claim never discharges another claim.

Providers are not selected hosts. Reject evidence tags under `src/providers/**`; when a provider is the actual owner named by an exclusion, the tag remains on a declaration selected by that claim.

## Behavioral Evidence

When a test function claims a behavioral requirement, read its setup, invoked operation, assertion, and negative path. The assertion must fail when the named behavior disappears. Type-checking a DTO proves shape, and calling an endpoint proves reachability; neither proves a semantic rule.

## Invalidation

A verdict belongs to one meaning at one source digest. Changing a tag, its host, its target, its reason, or the represented contract invalidates the affected acknowledgement.

Record the finding, repair its owning artifact, regenerate affected output after the authored contract settles, rerun the affected graph and package gates, and review the changed acknowledgement again. Do not invalidate unrelated graph claims or start a Plain-style whole-phase campaign unless the change actually altered their configured sources or targets.

Keep a concise review record in `.wiki/review.md`: the source digest, confirmed findings, repairs, restored claim inventory, and exact gate results. Do not create a per-artifact ledger outside the graph's selected acknowledgements.

## Completion

An Evidence phase is complete when:

- every phase claim is restored with its original population and `error` severity;
- the graph reports no diagnostic;
- every active acknowledgement has passed the host-target-reason review above;
- every affected package, test, and live gate is current and green; and
- no phase-owned `@todo` remains.

One successful pass over the active acknowledgements at the current digest is sufficient. Do not repeat an unlimited full-project review after these conditions hold. Do not edit frozen instructions or narrow a lint configuration to manufacture completion.
