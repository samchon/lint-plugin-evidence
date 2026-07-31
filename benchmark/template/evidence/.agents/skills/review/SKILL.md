---
name: review
description: Defines integrity review for populated evidence claims: enumerating every current host, comparing acknowledgements with their hosts and sources, detecting required hosts hidden by an inactive population, completing common residual reviews, and restarting invalidated work. Read after the Evidence skill at the start of every Evidence review and final objective.
---

# Review

## Phase Scope

Read [Evidence Lint](../evidence/SKILL.md) in full before every review and apply the phase named by the current user turn. An earlier objective's read or verdict never substitutes for this fresh read.

- **Backend Phase.** Review `schema-models`, `api-operations`, `backend-tests`, `dto-types`, and `dto-properties` in `packages/backend/lint.config.ts`. Confirm every backend command uses the single root `tsconfig.json` and only `pnpm lint` loads the root lint configuration.
- **Frontend Phase.** Confirm all seven claims remain configured, then review `frontend-screens` and `frontend-journeys`. If frontend work changed API or backend sources, re-pass the affected Backend Phase gates first; otherwise retain the current-digest backend verdict.
- **Overall Phase.** Confirm both canonical configurations and the single backend Program are unchanged, then review all seven claims.

Reject a phase report when a canonical configuration or the single backend Program differs from the template, `evidence/graph` did not run at `error` severity in an ordinary gate, or a configuration-only environment bypass replaced that gate.

The base layer skills and executable tests own general implementation correctness, including their complete provider and SDK-consumption populations. Perform those common reviews in both benchmark arms. This review owns the configured Evidence Graph and the truth of the declarations used to satisfy it; do not expand the graph to unselected artifacts or repeat a common population as a second Evidence-only census.

## Coverage Is Not Integrity

The graph establishes that every configured target received `@evidence` from a selected ownership host or `@evidenceExclude` from an eligible carrier in a matching claim file. It does not decide whether the reason is true. A tag copied merely to clear a diagnostic and a tag written after doing the work are structurally identical.

A TypeScript claim with zero selected exported hosts is inactive and therefore silent. That silence proves only that the population is empty. The base phase review must still establish whether the requirements demand an operation, DTO, test, screen, or journey; a required missing host blocks completion even though the graph correctly emitted no diagnostic.

## Review Every Current Host

The graph checks target-to-host coverage. It cannot report a selected host that carries no acknowledgement, so review the reverse direction from the current files rather than from tags or a prior inventory.

For the active phase, enumerate every authored Prisma model and column, DTO type and property, controller operation, feature-test function, production page, and browser-journey function in the claim populations. Trace each one to the applicable source:

- a model and column to the requirement that makes the stored fact necessary;
- a DTO type and property to the requirement and model, column, or named derivation it represents;
- an operation to the requirement and persistent model or explicit non-persistent boundary it exposes;
- a test to the requirement, operation, and exchanged DTO shape it proves;
- a page to the user-visible requirement it delivers; and
- a browser journey to the requirement and pages it performs.

An artifact with no such source is invented, and a necessary exception must name the requirement-backed boundary that makes it necessary. Do not create a second per-artifact ledger; the review record keeps findings and the current-digest result.

This host census is one continuous active-phase traversal. A finding, correction, or population change invalidates it. Restart at the first current host and repeat until one complete census reaches the end with zero findings.

## Review Every Acknowledgement

For every `@evidence` and `@evidenceExclude` acknowledgement in the populated phase claims, read three artifacts:

1. the exact target and reason;
2. for `@evidence`, the selected ownership declaration and the code it represents; for `@evidenceExclude`, the eligible carrier and the actual owner or observable alternative named by its reason;
3. the requirement, Prisma unit, SDK operation, DTO type, or screen named by the target.

Confirm that ownership uses a selected claim host or an exclusion uses an eligible carrier in a matching claim file, the target belongs to that claim's configured reference, and the reason states a specific responsibility or omission that the current code can falsify. A checklist may index this work; it is not proof by itself.

For every cited Markdown H2/H3, apply the Requirements skill's fact extraction. Across the acknowledgements and exclusions for that claim, account for every applicable actor, circumstance, required behavior, observable result, named value, negative case, and cross-reference in the section. Structural coverage of the heading is not integrity proof for facts the reason and implementation omit.

## Broad Scopes And Exclusions

For a leaf target, inspect that unit. For an H2, Prisma model, TypeScript type, or namespace target, enumerate the selected descendants discharged by the acknowledgement. Ownership must be true of the entire subtree; an exclusion's omission reason and veto condition must be true of the entire subtree. Use a narrower target when either decision fails for one descendant.

Review an exclusion with the same triple. The reason names the actual owner or observable alternative and a condition that would veto the omission. "Not applicable," "future work," "internal," and "not implemented" are conclusions, not reasons.

Exclusions are claim-local. Keep ownership and exclusion scopes disjoint within each claim-reference obligation. An acknowledgement in one claim never discharges another claim.

Providers are not selected hosts or eligible carriers. Reject `@evidence` tags under `src/providers/**`; when a provider is the actual owner named by an exclusion, keep the tag on an eligible exclusion carrier in a matching claim file.

## Behavioral Proof

When a test function claims a behavioral requirement, read its setup, invoked operation, assertion, and negative path. The assertion must fail when the named behavior disappears. Type-checking a DTO proves shape, and calling an endpoint proves reachability; neither proves a semantic rule.

Complete the common mutation calibration owned by [the base Testing skill](../backend/testing.md) before beginning the candidate clean review.

## Invalidation

A verdict belongs to one meaning at one source digest. Changing a tag, its host, its target, its reason, or the represented contract invalidates the affected acknowledgement.

Record the finding, repair its owning artifact, regenerate affected output after the authored contract settles, and rerun the affected graph and package gates. Affected-claim checks are repair feedback, not a phase verdict.

Any finding, correction, generated-output change, formatting change, failed gate, or population change invalidates the candidate active-phase review. After resolving it, restart at the first current host and repeat the complete host census, every active acknowledgement review, every common residual population, and the phase gates against the resulting source digest. Do not carry unchanged acknowledgements or reads from before the invalidating event into the qualifying review.

Keep a concise review record in `wiki/review.md`: the source digest, confirmed findings, repairs, configured claim inventory, populated and inactive TypeScript claims, and exact gate results. Do not create a per-artifact ledger outside the graph's selected acknowledgements.

## Completion

Before a phase report, run the source-scoped search for that phase and require no matches:

- **Backend:** `rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'`
- **Frontend:** `rg --hidden -n -F '@todo' packages/frontend --glob '*.ts' --glob '*.tsx'`
- **Overall:** `rg --hidden -n -F '@todo' packages --glob '*.ts' --glob '*.tsx'`

These searches exclude the Evidence instruction files that teach the tag.

An Evidence phase is complete when:

- every canonical claim remains configured with its original population and `error` severity;
- every inactive TypeScript claim has been checked against the requirements and contains no missing required host;
- the graph reports no diagnostic;
- one complete current-state host census has found zero defects;
- every current acknowledgement has passed the host-target-reason review above;
- every base-owned complete provider, SDK-consumption, and component-consumption review in the active phase is current;
- every affected package, test, and live gate is current and green; and
- no phase-owned `@todo` remains.

The successful current-digest host census and acknowledgement pass must both begin after the last invalidating event and run against the same unchanged source digest. One such complete pass is sufficient; do not require a second clean pass. A matching digest, green graph, inventory count, source-scoped search, or inactive claim does not substitute for the host and acknowledgement review. Do not edit frozen instructions or alter a lint configuration to manufacture completion.
