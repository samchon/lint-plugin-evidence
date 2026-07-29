---
name: review
description: Defines integrity review for plain-arm mappings, including full-scope rounds repeated without limit until one round finds no defect. Use during implementation and before every completion report.
---

# Review

## A Filled Row Is Not A True Row

An implementation may be said to realize a requirement, model, operation, or shape without the statement being accurate. A detailed-looking claim can still describe adjacent behavior or close a whole section with one partial implementation.

## Review The Triple

For every mapping, read three artifacts:

1. the mapping statement, including its exact source/artifact identities and reason;
2. the claiming code, test, schema, or screen;
3. the requirement, model, operation, DTO, or upstream artifact the row names.

The mapping is an index for this reading, never evidence that the reading passed. A reason is useful only when the current code can contradict it.

The claiming artifact can be wrong, the named source can be wrong, or one misreading can have propagated through both. `docs/analysis/**` is immutable specification; schema, contract, implementation, tests, and screens are authored outputs and may themselves require repair.

## Review Granularity And Absence

Review each H2 and H3 identity independently. A row for an H2 does not silently close its H3 descendants. If one artifact owns an entire subtree, enumerate every descendant responsibility in the review record.

A non-applicability, non-storage, non-exposure, or deliberate-omission row is a claim with the same burden as implementation. Confirm the exact source permits the absence, identify the actual owner or observable alternative, and state what would prove the decision wrong. "Not applicable," "future work," and "internal" are conclusions, not reasons.

## Review Behavioral Claims

A model, controller, provider, and test may all map to one behavioral requirement. Only an assertion that fails when the behavior disappears provides executable proof.

Read the test's setup, invoked operation, assertion, and negative path. Confirm it can fail for the named rule rather than merely for any error. Type-checking a DTO proves shape; calling an endpoint proves reachability; neither proves semantic behavior.

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

Record the finding before repair, identify every dependent claim as stale, fix the owning layer, regenerate outputs, rerun validation, and review the complete affected population. Never retain a dry or green verdict from the previous source.

Keep the review inventory in `.wiki/review.md`.
For every row record the exact source identity, claiming artifact and member, falsifiable reason, current source digest, and `pending`, `accepted`, or `stale` verdict.
Record findings before repair and retain stale rows until their replacements pass a later full round.

## Loop Until Dry

Run complete review rounds until one entire round is dry. This loop has no maximum round count.

Every round is an independent full review of the whole current project. Reread every H2 and H3 and walk each one through every applicable layer. Then enumerate and reverse-walk every authored model and column, DTO type and property, controller operation, provider branch and database access, meaningful test assertion, route, screen, hook, form, and browser journey. Recheck every state, permission, negative path, named boundary, generated output, `@todo`, and required build, lint, test, and browser gate.

Never divide a round by file, layer, lens, requirement subset, finding, or available time. Never carry a partial round forward as if its untouched remainder had passed. Every round starts from the complete current requirements and the complete current artifact population.

If a round finds even one missing, invented, stale, false, partial, or unverified mapping or behavior, that round is not dry. Record every finding, repair every confirmed defect at its owning layer, regenerate affected outputs, rerun every invalidated gate, and begin a new full round from the start on the changed source.

The only successful stopping condition is one full round that inspects the entire scope, finds zero actionable defects or omissions, and leaves every required gate current and green. An external interruption ends the loop only as an explicitly unfinished report, never as completion.

Complete this loop before every terminal completion report. Do not edit frozen instructions or lint configuration files.
