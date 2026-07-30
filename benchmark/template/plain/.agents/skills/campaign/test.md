# Test Campaign Dimension

Read [SKILL.md](SKILL.md) first. This mandatory dimension of the indivisible campaign round discharges `docs/analysis/ -> tests`, `API -> tests`, and `DTO type -> tests` for the suite under `packages/backend/test/features/`.

## Why Three Edges

Each denominator finds gaps the other two cannot.

**The API edge** checks every operation's paths. Alone, it can prove endpoints exist while missing cross-operation behavior.

**The requirements edge** checks product rules, journeys, constraints, and interactions that span operations.

**The DTO edge** checks whether every exchanged shape is exercised end to end. The compiler does not prove that any test builds or reads a given variant.

## Requirements To Tests

For every requirement in the inventory, name the test that would fail if the behavior stopped holding.

- A permitted action needs a test exercising it.
- A prohibited action needs a test attempting it and asserting the refusal.
- A threshold needs tests at its stated boundaries.
- A visibility rule needs calls from actors who may and may not see the result.
- A retention rule needs a test that mutates the source and reads the retained value afterward.

Then walk backward. Every test names the requirement it proves. A test that only checks whether a response conforms to a type proves no business behavior and must gain a meaningful assertion or be removed.

## Contract To Tests

For every operation, name tests for success, every stated refusal, and every authorization boundary.

Inspect what each test actually asserts. Verify effects beyond the immediate response—membership, history, state transitions, visibility, and other observable consequences—through public operations.

## Shapes To Tests

Enumerate every root DTO type and the request, response, or nested variants that current operations actually exchange.

For each applicable variant, name the test that constructs or reads it. Do not demand a response proof for an input-only type or a request proof for a response-only type. An exchanged shape no test reaches indicates either an untested operation or an invented type, and the owning dimension must correct it.

## Test Correctness Versus Coverage

[The testing topic](../backend/testing.md) owns how tests are written and which shortcuts produce false confidence.

A missing test is a coverage finding. A test that pins an incidental constant, fabricates an invalid identity, or asserts nothing beyond structural conformance is a defect in an existing test. Record and correct the right class instead of counting a weak test as coverage.

## Findings

Requirements, contract, and logic changes re-open this dimension in full. A failing or insufficient test may reveal an implementation, contract, or schema defect; correct the owning layer and propagate its consequences rather than weakening the assertion.

Never weaken an assertion merely to make the suite green.

Within the indivisible round owned by [SKILL.md](SKILL.md), this dimension is exhausted when every requirement names a test that would fail without it, every accessor has success and stated refusal paths covered, every applicable exchanged DTO variant is constructed or read, and every test names the requirement it proves. A green suite proves only the assertions that exist.
