# Backend Review

Apply the Review skill's review loop until dry to every file and relationship in the backend scope.

## Scope

The complete backend scope contains:

- every requirement under `docs/analysis/` and `docs/ERD.md` when present;
- every schema under `packages/backend/prisma/schema/`;
- every authored and generated API contract under `packages/api/src/`;
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
