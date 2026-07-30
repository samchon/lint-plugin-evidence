---
name: review
description: Defines whole-population integrity review, including full-scope rounds repeated until one round finds no defect. Use during implementation and before every completion report.
---

# Review

## Phase Scope

Apply the scope named by the current user turn.

- **Backend Phase.** Review every requirement for API and backend applicability and review the complete current schema, DTO, controller, provider, database-access, backend-test, and generated-contract population. Frontend obligations remain pending rather than accepted.
- **Frontend Phase.** Review every requirement for user-facing and integration applicability and review every route, screen, component, hook, form, state, omission, browser journey, and SDK consumption path. If a finding proves a backend defect, repair it and re-pass the complete Backend Phase before resuming.
- **Overall Phase.** Review every requirement and every artifact across all layers without phase partitioning.

Each round covers the entire active phase scope. The phase boundary is prescribed by the user turn; never subdivide that scope by file, package, lens, requirement subset, finding, or available time.

## Frozen Requirement Input

Treat `docs/analysis/**` as opaque, immutable benchmark input. Read the files exactly as supplied to derive obligations and compare the authored project against them. Never edit, rewrite, normalize, rename, reformat, synthesize, or repair a requirement file.

Do not turn the review into a separate assessment of the requirement corpus's format, heading scheme, completeness, or internal quality. Follow its literal content, preserve its bytes, and direct every implementation finding to an authored project artifact. An ambiguity or contradiction in the supplied text may be recorded as a limitation on the resulting interpretation, but it never authorizes changing the input.

## A Filled Row Is Not A True Row

An implementation may be said to realize a requirement, model, operation, or shape without the statement being accurate. A detailed-looking claim can still describe adjacent behavior or close a whole section with one partial implementation.

## Review The Triple

For every mapping, read three artifacts:

1. the mapping statement, including its exact source and artifact identities and reason;
2. the claiming code, test, schema, or screen;
3. the requirement, model, operation, DTO, or upstream artifact the row names.

The mapping is an index for this reading, never proof that the reading passed. A reason is useful only when the current code can contradict it.

The claiming artifact can be wrong, the mapping can name an unrelated source, or one misreading can have propagated through multiple authored outputs. `docs/analysis/**` remains the authoritative frozen input; schema, contract, implementation, tests, and screens are authored outputs and may themselves require repair.

## Review Granularity And Absence

Review each H2 and H3 identity independently. A row for an H2 does not silently close its H3 descendants. If one artifact owns an entire subtree, enumerate every descendant responsibility in the review record.

A non-applicability, non-storage, non-exposure, or deliberate-omission row is a claim with the same burden as implementation. Confirm the exact source permits the absence, identify the actual owner or observable alternative, and state what would prove the decision wrong. "Not applicable," "future work," and "internal" are conclusions, not reasons.

## Review Behavioral Claims

A model, controller, provider, and test may all map to one behavioral requirement. Only an assertion that fails when the behavior disappears provides executable proof.

Read the test's setup, invoked operation, assertion, and negative path. Confirm it can fail for the named rule rather than merely for any error. Type-checking a DTO proves shape; calling an endpoint proves reachability; neither proves semantic behavior.

## Reverse Ownership

Review the backward populations as seriously as requirement coverage:

- every model and column;
- every authored DTO type and property and every controller operation;
- every provider branch and database access;
- every meaningful test assertion;
- every route, screen, hook, form, and browser journey.

Each needs a requirement, upstream contract, invariant, or reasoned architectural owner. An unowned artifact is invented behavior even when all forward rows are full.

## Cross-Layer Closure

An inventory is not coverage. Review the relationships between every applicable unit without representative sampling:

- trace each requirement through every layer it binds: schema facts and constraints, API operations and DTO properties, backend behavior, executable tests, reachable screens, and browser journeys;
- trace each model and column to every operation and DTO that creates, reads, changes, exposes, or deliberately hides it, then to the provider paths and tests that prove those decisions;
- trace each API operation, parameter, response field, and error contract to its backend realization, positive and negative tests, and every required frontend consumer or requirement-backed non-user-facing decision;
- trace each frontend route, screen, form control, state, mutation, error path, and navigation to its requirement, SDK operation, DTO field, and journey interaction, including cache invalidation, refresh, authorization, and persisted effects; and
- trace each test assertion back to the exact requirement and behavior it proves, rejecting calls, snapshots, type checks, or generic failures that cannot fail for the named obligation.

Completing one endpoint, DTO, test, or screen does not close adjacent units. Counts, generated output, route reachability, and a green build are discovery aids rather than substitutes for reading each relationship.

## Invalidation

A verdict belongs to one meaning at one digest. Changing a requirement interpretation, model, DTO, operation, provider, test, screen, or mapping reason invalidates every downstream verdict that depended on it.

Record the finding before repair, identify every dependent claim as stale, fix the owning layer, regenerate outputs, rerun validation, and review the complete affected population. Never retain a dry or green verdict from the previous source.

Keep the review inventory in `.wiki/review.md`. For every row record the exact source identity, claiming artifact and member, falsifiable reason, current source digest, and `pending`, `accepted`, or `stale` verdict. Record findings before repair and retain stale rows until their replacements pass a later full round.

## Current Digest And Handoff

Review may begin during implementation. A complete dry round remains valid when the later review turn sees the same source digest, the same active-phase population, and current green gates. Verify that record and reuse it; do not repeat a proven current-digest round merely because the user turn changed.

A partial round, a round from an older digest, a summary with no full population record, or a dry claim contradicted by the current source is not reusable. Continue from the current complete scope rather than accepting the claim.

## Loop Until Dry

Run complete review rounds over the active phase scope until one entire round is dry. This loop has no maximum round count.

Every round is an independent full review of the whole active phase scope. Reread every H2 and H3 and walk each one through every layer applicable to that phase. Then enumerate and reverse-walk every authored artifact and every cross-layer relationship in that phase. Recheck every state, permission, negative path, named boundary, generated output, `@todo`, and required phase gate.

Never divide a round below the prescribed phase boundary. Never carry a partial round forward as if its untouched remainder had passed. Every round starts from the complete current requirements and the complete current artifact population for that phase.

If a round finds even one missing, invented, stale, false, partial, or unverified mapping or behavior, that round is not dry. Record every finding, repair every confirmed defect at its owning layer, regenerate affected outputs, rerun every invalidated gate, and begin a new full round from the start on the changed source.

The successful stopping condition is one full round at the current digest that inspects the entire active phase scope, finds zero actionable defects or omissions, and leaves every required phase gate current and green. One such dry round is sufficient; do not require two consecutive dry rounds. An external interruption ends the loop only as an explicitly unfinished report, never as completion.

Complete this loop before every phase report, either in the current turn or through a reusable current-digest dry round from an earlier turn. The Overall Phase repeats it over the whole project. Do not edit frozen instructions or lint configuration files.
