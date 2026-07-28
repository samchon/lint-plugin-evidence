# Testing

Read [SKILL.md](SKILL.md) first. This document owns the end-to-end tests, which are the only artifact that proves the product behaves as the requirements say.

## Shape

Tests are end to end. They start the server, call the generated SDK exactly as a client would, and assert against a real database. Nothing in this application's own layers is mocked, because a mocked provider proves the mock works.

Each test is one file under `packages/backend/test/features/api/`, mirroring the route it exercises, exporting exactly one function whose name matches the filename.

## The Four File Kinds

A feature area has four kinds of file, and mixing them is what makes a suite unmaintainable.

```
test/features/api/shoppings/sales/
  test_api_shopping_sale_create.ts          the scenario
  internal/prepare_random_sale.ts           builds a request body
  internal/generate_random_sale.ts          performs one creation, returns the entity
  internal/validate_sale_at.ts              asserts a property across every actor
```

- **`test_api_*`** is a scenario. It arranges, acts, and delegates its assertions.
- **`prepare_*`** returns a creation body with overridable fields and performs no call.
- **`generate_*`** performs exactly one creation through the SDK and returns what it made.
- **`validate_*`** takes what was made and asserts something about it, usually across several actors.

## A Scenario Reads As A Story

```ts
export const test_api_shopping_sale_create = async (
  pool: ConnectionPool,
): Promise<void> => {
  await test_api_shopping_actor_admin_login(pool);
  await test_api_shopping_actor_customer_create(pool);
  await test_api_shopping_actor_seller_join(pool);

  const sale: IShoppingSale = await generate_random_sale(pool);
  await validate_sale_at({ pool, sale, visibleToCustomer: true });
  await validate_sale_index({ pool, sales: [sale], visibleInCustomer: true });
};
```

The first three lines are the state this scenario assumes, expressed by calling the tests that establish it rather than by repeating their bodies. A change to the join flow propagates to every dependent scenario instead of to forty copies. This is why a test returns what it created.

The last two lines are the point. The scenario itself asserts nothing inline; it hands the created entity to validators that know what must be true about it.

## Builders And Generators

```ts
export const generate_random_sale = async (
  pool: ConnectionPool,
  input?: Partial<IShoppingSale.ICreate>,
): Promise<IShoppingSale> =>
  api.functional.shoppings.sellers.sales.create(
    pool.seller,
    await prepare_random_sale(pool, input),
  );
```

The `Partial<...ICreate>` override is what lets one generator serve a dozen scenarios. A scenario that needs a closed sale passes `{ closed_at }`; it does not fork the generator.

Randomize a resource's own data. Path parameters and foreign keys come from prior responses, because a fabricated id refers to no row. A fabricated id is correct only in an explicit not-found case.

## Validators Assert Across Actors

This is where the per-actor requirements are actually proven.

```ts
export const validate_sale_at = async (props: {
  pool: ConnectionPool;
  sale: IShoppingSale;
  visibleToCustomer: boolean;
}): Promise<void> => {
  await validate(
    (id) => api.functional.shoppings.sellers.sales.at(props.pool.seller, id),
    props.sale,
  );
  await validate(
    (id) => api.functional.shoppings.admins.sales.at(props.pool.admin, id),
    props.sale,
  );

  if (props.visibleToCustomer)
    await validate(
      (id) => api.functional.shoppings.customers.sales.at(props.pool.customer, id),
      props.sale,
    );
  else
    await TestValidator.error("customer cannot see the sale", async () => {
      await api.functional.shoppings.customers.sales.at(
        props.pool.customer,
        props.sale.id,
      );
    });
};
```

Read what that proves. The same entity is fetched through the seller route, the admin route, and the customer route, and the customer branch flips on a flag the scenario supplies. A sale that should be invisible is asserted invisible, not merely left unfetched.

## Assert The Rejection, Not The Status Code

This is the rule most often gotten wrong, and getting it wrong produces a test that fails on a correct change.

```ts
// Right: the call is refused.
await TestValidator.error("a non-owner cannot edit", async () => {
  await api.functional.shoppings.sellers.sales.update(otherSeller, id, body);
});

// Wrong: which 4xx the server returns is not part of the contract.
await TestValidator.httpError("a non-owner cannot edit", 403, async () => {});
```

Whether a refusal arrives as 401, 403, 404, or 409 depends on which check the provider reaches first. A provider that verifies existence before authority returns a not-found where you expected a forbidden, and both are correct. Pinning the code turns a legitimate reordering into a red suite, so the assertion pins the fact that matters: the call was refused.

Assert the status only when the class of status is itself part of the requirement, and then as a set rather than a single value.

## Connections

Each actor gets one connection on the pool, authenticated once, reused for every call that actor makes.

Creating a fresh connection object from the host is anonymous: the token lives in the headers of the connection the authorization helper mutated, and the SDK copies it nowhere else. This produces a confusing failure on the second call rather than the first.

Switching actors means using that actor's connection. That is what makes an authorization test cheap enough to write for every route.

## Prove Through The Public Surface

Use public operations for setup and for assertions, and do not read the database as a fallback.

When neither the response nor any reachable follow-up read exposes the effect a requirement names, that is a finding about the API. An effect nobody can observe through the product is an effect the product does not deliver. Go back to the operation contract.

A test may call a provider directly to arrange state the API deliberately never exposes, such as seeding the first administrator. Arrange with the provider; assert through the SDK.

Use only properties the DTOs declare. A missing property is a contract question, not permission to invent a field or cast around the compiler.

## Coverage, Not Happy Paths

A test that creates an entity and asserts the response is not null proves the route exists. A test that only asserts the response validates against its type proves the framework works. Neither proves a requirement.

At least one assertion per scenario must prove the business behavior it names.

- **Assert the requirement, not the mechanism.** If a rule says two coupons of the same kind cannot stack, the test stacks them and asserts the refusal. Checking that a valid coupon applies leaves the rule unproven.
- **Every positive gets a negative twin.** Where a rule permits something, pin the adjacent case one property away where it must be refused.
- **Cover the boundaries.** Empty list, single element, expired window, the exact threshold on both sides, first page and last, owner against non-owner.
- **Assert authorization explicitly.** A route that leaks another seller's data returns 200 and looks correct in every test that calls it as the owner.
- **Assert the state after the effect.** An operation whose requirement says it also closes something is not proven by a 200. Read the thing that should have closed.

## History Is A Requirement

Where the schema keeps snapshots, the requirements usually say the earlier value must stay readable. Test it: create, reference, mutate the source, then read the reference and assert it still shows what it showed before.

This is the class of requirement that passes every structural check and is almost never actually built.

## Idioms

- `TestValidator.equals("title", actual, expected)` reports the differing property path. Title first, so a failure identifies the assertion.
- `TestValidator.error` for a business rejection, awaiting both the assertion and the call inside it. This is the default; see the section above.
- `RandomGenerator` for human-readable values; the type-driven random generator for format-constrained ones. A hardcoded value makes a test pass for the wrong reason.
- Await every call. A missing await turns a failure into unhandled-rejection noise that reports as a pass.
- Never suppress the compiler with an ignore comment, `any`, or a double cast. A missing required property usually means an omitted prerequisite whose response should have supplied the value.

## Before Considering A Test Done

Check what the compiler cannot: every call uses the right actor's connection; every id came from a prior response except in an explicit not-found case; the positive path contains no manufactured failure; at least one assertion proves the stated goal; every declared step is exercised.

If you are unsure a test proves its requirement, remove the behavior and confirm the test fails. Then put it back. A test that passes either way proves nothing about the requirement it names.

## Running

Run the backend test command from the workspace root and read the output. A suite that passes because it asserts nothing passes exactly as loudly as one that works.
