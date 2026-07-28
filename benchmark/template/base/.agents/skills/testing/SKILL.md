---
name: testing
description: Defines end-to-end feature test structure, naming, the connection pool, and what a test must prove beyond its happy path. Use before writing or changing a test.
---

# Testing

## Shape

Tests are end-to-end. They start the server, call the generated SDK exactly as a client would, and assert on real responses. There are no mocks of the application's own layers, because a mocked provider proves the mock works.

Each test is one file under `packages/backend/test/features/api/`, mirroring the route it exercises, and exports exactly one function whose name matches the filename.

```ts
export const test_api_sale_create = async (
  pool: ConnectionPool,
): Promise<void> => {};
```

The name states what is asserted, in `test_api_<domain>_<action>` form. A file named for its subject and a function named for its assertion is how a failure report tells you what broke without opening the file.

## Composition

A test that needs a logged-in actor or an existing entity calls the test that creates it rather than duplicating the setup.

```ts
const seller = await test_api_actor_seller_join(pool);
const sale = await test_api_sale_create(pool, seller);
```

This is why a test returns what it created. The dependency chain doubles as the scenario: reading the calls at the top of a test tells you what state it assumes.

## Tools

Use `@nestia/e2e`:

- `TestValidator.equals` and its siblings for assertions that report the differing path rather than a boolean.
- `TestValidator.error` for a case that must fail. Assert the failure, not merely that something was thrown.
- `RandomGenerator` for input values, so a test does not depend on a fixture nobody maintains.
- `ArrayUtil.asyncMap` and `ArrayUtil.asyncRepeat` for building collections.

Call endpoints through the generated SDK's `functional` accessors, never by hand-writing a fetch. The SDK is what a consumer uses, and a hand-written call bypasses the validation the consumer would meet.

## Coverage, Not Happy Paths

A test that creates an entity and asserts the response is not null proves the route exists. It does not prove the requirement holds.

- **Assert the requirement, not the mechanism.** If a document says a coupon cannot stack with another of the same kind, the test stacks them and asserts the refusal.
- **Every positive case gets a negative twin.** Where a rule permits something, pin the adjacent case one property away where it must be refused. A rule that over-permits is invisible until the counter-example exists.
- **Cover the boundaries.** The empty list, the single element, the expired window, the exact threshold, the actor who owns the resource against the actor who does not.
- **Assert authorization explicitly.** A route that returns another seller's data still returns 200. Only a test that calls it as the wrong actor finds that.

## Running

```bash
pnpm --filter {{backendPackageName}} test
```

Read the output. A test run whose result you did not read is not a test run, and a suite that passes because it asserts nothing passes exactly as loudly as one that works.
