# Backend Review

Apply the Review skill's review loop until dry to every file and relationship in the backend scope.

## Scope

The complete backend scope contains:

- every requirement under `docs/analysis/`;
- every schema under `packages/backend/prisma/schema/`;
- every authored API contract under `packages/api/src/structures/`;
- every authored and generated backend file under `packages/backend/src/`;
- every backend test under `packages/backend/test/`; and
- every API or backend configuration file that affects compilation, generation, persistence, or runtime behavior.

## Requirement Propagation

Read every requirement in full. Treat each individual requirement as a root and independently follow every applicable branch.

1. Propagate the requirement into the database.
   - Identify every concept, owner, field, unit, null meaning, relation, constraint, lifecycle state, history rule, deletion rule, ordering rule, concurrency rule, and atomic outcome it requires.
   - Verify that the schema represents all of them and represents nothing that contradicts them.
   - Verify that persistence constraints and transaction boundaries protect the rule rather than leaving it to one convenient call path.
2. Propagate the requirement into the API.
   - Identify every required operation, actor, authorization boundary, input, output, status, effect, refusal, default, pagination rule, ordering rule, and tie-break.
   - Verify that controllers and DTOs expose the whole requirement without omission, invention, or a different meaning.
   - Verify that an absent operation or deliberately unexposed value is actually permitted and that its real owner provides the required behavior.
3. Propagate the requirement into backend tests.
   - Identify every success, refusal, boundary, lifecycle transition, ownership isolation, persistent effect, and failure atomicity that must be observed.
   - Verify that tests exercise every applicable observation with concrete assertions.
   - Verify that each test would fail if the named requirement disappeared or changed incorrectly.

Complete all branches for one requirement before treating that requirement as reviewed. Similar or adjacent requirements never share credit.

## Database Propagation

Read every schema in full. Treat each model, enum, field, relation, key, index, constraint, default, and deletion action as a root.

1. Propagate it into API operations.
   - Find every operation that creates, reads, changes, deletes, lists, aggregates, or authorizes the data.
   - Verify that each operation preserves ownership, lifecycle, constraints, ordering, atomicity, and visibility.
2. Propagate it into DTOs.
   - Match every stored or derived value to the accepting and returning DTO properties.
   - Verify type, unit, optionality, null meaning, validation, ownership, derivation, and lifecycle exposure.
3. Propagate it into backend behavior and tests.
   - Verify that every relevant implementation branch uses the intended relation and constraint.
   - Verify that tests observe database effects, refusals, rollbacks, cascades, ordering, and concurrency boundaries.

Reject a database, API, DTO, implementation, and test design when all layers consistently copied the same mistake instead of matching the requirement.

## API Propagation

Read every authored controller and DTO and every generated SDK contract in full. Treat each operation and DTO property as a root.

1. Propagate the operation into backend behavior.
   - Trace the controller entry through authorization, validation, provider logic, database reads and writes, transactions, side effects, and returned values.
   - Inspect every success, refusal, error, retry, idempotency, and concurrent path promised by the contract.
2. Propagate the operation into backend tests.
   - Find every test that claims to exercise it.
   - Compare the actual actor, request, response, status, database effect, authorization effect, and refusal with the contract.
   - Record a finding when any promised branch lacks proof or a test passes without observing the named behavior.
3. Propagate every DTO property backward to its requirement and database source and forward to its implementation and test values.

Generated contracts may reveal drift but do not own the correction. Fix the authored schema, controller, or DTO and regenerate.

## Operation And Test Closure

Before evaluating test coverage, build one complete sorted manifest of every product API operation. Derive it from authored controllers and cross-check it against the generated SDK and Swagger document. Infrastructure health is not a product operation; every other public operation needs its own disposition.

For each operation in manifest order, read every complete test source that calls it and classify each call:

- **Primary:** the one operation whose business behavior the exported test exists to prove.
- **Dependency:** a public call that authenticates an actor, creates a parent, or establishes ownership, membership, grade, or lifecycle state needed by the primary call.
- **Follow-up:** a public call used after the primary call to observe its effect.

Dependency and follow-up calls earn no primary coverage. A generic journey or mega-test that has no single primary operation earns none either.

Every exported test has exactly one primary operation. Credit an operation only when tests naming it as their sole primary operation prove at least two semantically distinct business scenarios. Different random values or names do not make a new scenario. Each credited scenario must state its business preconditions and expected outcome or refusal, then prove a publicly observable business effect through the primary response or a public follow-up with a concrete business assertion. Shape, non-null, status-only, and input-echo checks are insufficient.

Use public SDK dependency and follow-up operations in the required order; direct database setup does not prove the API. Do not write or retain malformed-input or generic HTTP 400 scenarios already enforced by the typed SDK or runtime validator. Assert an exact status or server code only when the requirement or public contract states it; otherwise prove the required refusal without inventing an oracle.

Before crediting coverage, compare the operation-scenario gate with the committed workspace baseline. Coverage work may change feature tests and `test/OperationScenarioRegistry.ts`; it must not weaken or bypass `test/helpers/TestOperationScenario.ts`, `TestAutomation.ts`, `test/index.ts`, `writeProductSwagger.ts`, backend `build:sdk` or `test` scripts, or generated `swagger.product.json`. Treat any such gate change as a finding, restore the baseline contract, and evaluate coverage from the authored feature tests and registry.

Retain one disposition per operation naming its primary tests, two distinct scenarios, dependencies, follow-ups, observations, and assertions. Zero, one, duplicated, weak, or unclassified scenarios are findings. Continue through the final operation before editing. After any correction, the next full round starts at the first requirement and its operation audit starts at the first operation.

## Implementation And Test Closure

Read every backend source and test file in full.

1. Treat every implementation behavior, branch, state, and deliberate omission as a claim.
   - Trace it backward to the exact requirement or necessary technical boundary that justifies it.
   - Trace it sideways to the database and API contracts it consumes or enforces.
   - Trace it forward to the test and observable effect that proves it.
2. Treat every test name as an unproven claim until its complete setup, action, and assertions establish it.
   - Trace the test backward to its requirement and API operation.
   - Verify actor identity, initial state, request, response, stored effects, emitted effects, refusal, rollback, cleanup, and isolation.
   - Verify boundary partitions rather than one representative happy path.
   - Verify that assertions observe meaning, not merely status, shape, non-null output, or the implementation's own mistaken convention.
3. Record over-implementation, invented restrictions, unrequired exposure, missing tests, and tests that preserve a defect as findings.

Names, types, compilation, internal consistency, and passing tests do not establish semantic correctness.

## Review Evidence Report

Report every round's file and operation manifests, findings, corrections, and final dry round. For every operation, name its primary tests and at least two credited scenarios with distinct preconditions, outcomes, and business assertions. Report totals with zero, one, and at least two credited scenarios, but never use those totals instead of the per-operation dispositions. If writing the report exposes a missing operation, unclassified call, weak or duplicate scenario, unsupported oracle, or post-edit gap, resume the review and report again after a new dry round.

## Final Checklist

- [ ] Review skill gate followed exactly, with no discretionary changes to scope, round boundaries, stopping conditions, or procedure.
- [ ] Literal full reading covered every required instruction and in-scope backend artifact.
- [ ] Every requirement propagated through database, API, behavior, and tests.
- [ ] Every schema element checked against operations, DTOs, behavior, effects, and tests.
- [ ] Every operation and DTO traced backward to requirements and storage and forward to behavior and tests.
- [ ] Every product operation has a source-backed disposition and at least two distinct scenarios where it is the test's sole primary operation.
- [ ] Dependency and follow-up calls received no primary credit; every credited scenario proves a requirement-backed business outcome.
- [ ] Operation-scenario helpers, automation, entrypoints, Swagger generation, scripts, and generated Swagger match the committed gate contract.
- [ ] Every backend source and test read across all success, refusal, boundary, lifecycle, ownership, atomicity, ordering, and concurrency paths.
- [ ] Report names every operation's credited scenarios and assertions; counts, manifests, searches, and passing gates did not substitute for that proof.
- [ ] Every finding followed through its full consequence surface.

Any unchecked or uncertain item leaves the Goal Mode completion conditions unmet. Repeat the literal full-reading Backend Review from the first requirement.
