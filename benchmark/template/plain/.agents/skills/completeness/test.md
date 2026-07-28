# Test Check

Read [SKILL.md](SKILL.md) first. This check covers requirements, public operations, DTO shapes, and business behavior to executable tests, then every test back to the behavior it proves.

## Forward Walk

For every behavioral requirement, identify a test and the exact assertion that would fail if the behavior disappeared. Cover success, authorization, validation, absence, forbidden transitions, boundaries, and cross-actor journeys. For every public operation, exercise its method/path, request, response, and required failures. For every DTO shape, build and inspect the relevant values without casting around the contract.

A test that only calls an operation is reachability evidence, not behavioral proof. A type-check is shape evidence, not proof that runtime semantics hold.

## Reverse Walk

Enumerate tests under `packages/backend/test/features/**` and browser journeys under `packages/frontend/tests/journeys/**`. Map each meaningful assertion to a requirement, operation, shape, or invariant. Reject fixtures and assertions that merely encode invented behavior.

Read generated accessors to invoke the real public contract, but attribute ownership to the controller and authored DTO, not to generated source.
