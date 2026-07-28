---
name: testing
description: Defines end-to-end feature test structure, naming, composition through the connection pool, the assertion tools, and what a test must prove beyond its happy path. Use before writing or changing a test.
---

# Testing

## Shape

Tests are end-to-end. They start the server, call the generated SDK exactly as a client would, and assert on real responses against a real database. There are no mocks of this application's own layers, because a mocked provider proves the mock works.

Each test is one file under `packages/backend/test/features/api/`, mirroring the route it exercises, and exports exactly one function whose name matches the filename.

```ts
export const test_api_sale_create = async (
  pool: ConnectionPool,
): Promise<ISale> => {};
```

The name states what is asserted, in `test_api_<domain>_<action>` form. A file named for its subject and a function named for its assertion is how a failure report tells you what broke before you open anything.

## Composition Is The Scenario

A test that needs a logged-in actor or an existing entity calls the test that creates it, rather than duplicating the setup.

```ts
const seller: ISeller.IInvert = await test_api_actor_seller_join(pool);
const sale: ISale = await test_api_sale_create(pool, seller);
```

This is why a test returns what it created. Reading the calls at the top of a test tells you exactly what state it assumes, and a change to the join flow propagates to every test that depends on it instead of to forty copies.

The connection pool carries one connection per actor. Switching actors means using that actor's connection, not re-authenticating inside the test, and it is what makes an authorization test cheap to write.

Put reusable input builders in an `internal/` folder beside the tests as `prepare_*` functions returning a creation body with overridable fields.

## Tools

Use `@nestia/e2e`:

- `TestValidator.equals` and its siblings, which report the differing property path rather than a boolean.
- `TestValidator.error` for a case that must fail. Assert that it failed and that it failed for the stated reason, not merely that something threw.
- `RandomGenerator` for input values, so a test does not depend on a fixture nobody maintains and does not accidentally pass because of a hardcoded value.
- `ArrayUtil.asyncMap` and `ArrayUtil.asyncRepeat` for building collections.

Call endpoints through the generated SDK's `functional` accessors, never a hand-written fetch. The SDK is what a consumer uses, and a hand-written call bypasses the validation the consumer would meet.

A test may import a provider directly when it needs to arrange state the API deliberately does not expose, such as seeding an administrator. Arrange with the provider; assert through the SDK.

## Coverage, Not Happy Paths

A test that creates an entity and asserts the response is not null proves the route exists. It does not prove the requirement holds.

- **Assert the requirement, not the mechanism.** If a business rule says two coupons of the same kind cannot stack, the test stacks them and asserts the refusal. A test that only checks that a valid coupon applies leaves the entire rule unproven.
- **Every positive case gets a negative twin.** Where a rule permits something, pin the adjacent case one property away where it must be refused. A rule that over-permits is invisible until the counter-example exists.
- **Cover the boundaries.** The empty list, the single element, the expired window, the exact threshold on both sides, the first page and the last, the actor who owns the resource against the actor who does not.
- **Assert authorization explicitly.** A route that leaks another seller's data still returns 200 and still looks correct in every test that calls it as the owner. Only a call from the wrong actor finds it.
- **Assert the state after the effect**, not only the response. An operation whose requirement says it also closes something is not proven by a 200; read the thing that should have closed.
- **Assert the observable refusal, not just failure.** A rule that says a request is refused with a particular meaning is not satisfied by any error at all.

## Snapshots And History

Where the schema keeps history, the requirement usually says the history must remain readable. Test it: create, reference, mutate the source, then read the reference and assert it still shows what it showed before.

This is the class of requirement that passes every structural check and is almost never actually built.

## Running

Run the backend test command from the workspace root and read the output.

A suite that passes because it asserts nothing passes exactly as loudly as one that works. If you are unsure a test proves its requirement, remove the behavior and confirm the test fails; then put it back.
