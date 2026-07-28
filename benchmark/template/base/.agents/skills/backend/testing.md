# Testing

Read [SKILL.md](SKILL.md) first. The end-to-end suite is the only artifact that proves the product behaves as the requirements say.

## Shape

A test is one exported async function taking a connection. It creates the actors it needs, calls the generated SDK exactly as a client would, and asserts against real responses from a real database.

```ts
export async function test_api_shopping_sale_create(
  connection: api.IConnection,
): Promise<void> {}
```

Nothing in this application's own layers is mocked, because a mocked provider proves the mock works.

One file, one function, and the filename matches the function name. The name states what the test asserts, in `test_api_<domain>_<action>` form.

## Connection Isolation

The `connection` parameter is a **base connection**, carrying the host and nothing else. Never call an operation with it directly.

Create one connection per actor, authenticate it once, and reuse that same variable for every call by that actor.

```ts
export async function test_api_shopping_sale_create(
  connection: api.IConnection,
): Promise<void> {
  const sellerConnection: api.IConnection = { host: connection.host };
  await authorize_seller_join(sellerConnection, {
    body: {
      email: typia.random<string & tags.Format<"email">>(),
      password: "1234",
    } satisfies IShoppingSeller.IJoin,
  });

  const customerConnection: api.IConnection = { host: connection.host };
  await authorize_customer_create(customerConnection, { body: {} });

  const sale: IShoppingSale = await generate_random_sale(sellerConnection, {});
  typia.assert(sale);
}
```

**One connection per actor, not per step.** The authorization helper mutates the headers of the connection it is given, and the SDK copies the token nowhere else. A fresh `{ host: connection.host }` object created for a later call is anonymous, and the failure arrives as a confusing 401 on the second call rather than the first.

## Helpers

Two kinds, and both take the connection first.

**`authorize_*`** performs one join, login, or refresh and leaves its connection authenticated:

```ts
export async function authorize_seller_join(
  connection: api.IConnection,
  props: { body: IShoppingSeller.IJoin },
): Promise<IShoppingSeller.IAuthorized> {
  const authorized: IShoppingSeller.IAuthorized =
    await api.functional.shoppings.sellers.authenticate.join(
      connection,
      props.body,
    );
  typia.assert(authorized);

  connection.headers ??= {};
  connection.headers.Authorization = `Bearer ${authorized.token.access}`;
  return authorized;
}
```

The header assignment is the whole point. A helper that returns the authorization response and stops leaves every later call anonymous. Mutate only the connection it was given, never another actor's.

**`generate_random_*`** performs one creation and returns what it made:

```ts
export async function generate_random_sale(
  connection: api.IConnection,
  props: { body?: Partial<IShoppingSale.ICreate> },
): Promise<IShoppingSale> {
  const sale: IShoppingSale = await api.functional.shoppings.sellers.sales.create(
    connection,
    {
      section_code: "general",
      title: RandomGenerator.paragraph({ sentences: 3 }),
      ...props.body,
    } satisfies IShoppingSale.ICreate,
  );
  typia.assert(sale);
  return sale;
}
```

`props` is always present, even when empty. When the operation has path parameters, `props.params` carries them, sourced from a prior response.

Use an existing helper for the endpoint it owns, and call the SDK directly only where none covers it.

## Take Accessors From The Generated SDK

Never derive an accessor name from a path, a verb, or a guess. If the one you expect does not exist, find the operation whose method and path match and use the accessor generated for it.

Never cast a namespace to reach a missing member. If neither an accessor nor a helper covers an endpoint, the contract is what needs repairing.

## Random Data

Use the type-driven generator for anything with a format or a numeric constraint, and the text generator for human-readable strings.

```ts
typia.random<string & tags.Format<"email">>();
typia.random<number & tags.Type<"uint32"> & tags.Minimum<1>>();
RandomGenerator.paragraph({ sentences: 3 });
RandomGenerator.pick(["pending", "paid"] as const);
```

Randomize a resource's own data. **Path parameters and foreign keys come from prior responses**, because a fabricated identifier refers to no row and fails with a not-found for the wrong reason. Fabricate one only in an explicit not-found test.

## Assertions

```ts
typia.assert(response);
```

That validates the entire response: every property, type, format, and constraint. **Never add checks after it.** A regular-expression test on an identifier or a `typeof` comparison is redundant and reads as distrust of the validator.

Then assert the business fact:

```ts
TestValidator.equals("sale belongs to the seller", sale.seller.id, seller.id);
```

Title first, so a failure names the assertion rather than a line number.

**Every test needs at least one business assertion.** A test that calls an operation and validates the response type proves the framework works.

## Rejections

Assert that the call was refused. Do not assert which status it was refused with.

```ts
await TestValidator.error("a non-owner cannot edit the sale", async () => {
  await api.functional.shoppings.sellers.sales.update(
    otherSellerConnection,
    sale.id,
    { title: "hijacked" } satisfies IShoppingSale.IUpdate,
  );
});
```

Whether a refusal arrives as 401, 403, 404, or 409 depends on which check the provider reaches first, and a provider that verifies existence before authority returns a not-found where you expected a forbidden. Both are correct, so pinning the code turns a legitimate reordering into a red suite.

Await both layers: the assertion and the call inside it.

## Never Test Type Errors

A deliberately wrong type is a compile error, not a test. The boundary already validates types, formats, and lengths, and proving that is not this suite's job.

```ts
// A business rejection, with valid types throughout.
body: { email: existingEmail } satisfies IShoppingMember.IJoin;
```

If a scenario asks for input validation, ignore that part of it.

Positive paths stay clean: valid bodies, a qualified caller, no manufactured failure. The one sanctioned exception is an authority negative, where the inputs remain valid and only the caller's grade is insufficient.

## Code Discipline

- `const` throughout, with ternaries for conditional values.
- Declare a request body with bare `satisfies`, without a widening annotation.
- Await every call. A missing await turns a failure into unhandled-rejection noise that reports as a pass.
- Never suppress the compiler with an ignore comment, `any`, or a double cast. A missing required property usually means a prerequisite call was omitted, and its response is what supplies the value.
- Use only properties the DTOs declare. A missing property is a contract question.

## What A Test Must Prove

At least one business assertion per test, and beyond the happy path:

- **The requirement, not the mechanism.** If a rule says two coupons of the same kind cannot stack, stack them and assert the refusal.
- **A negative twin for every positive.** Where a rule permits something, pin the adjacent case one property away where it must be refused.
- **The boundaries.** Empty list, single element, expired window, the threshold on both sides, first page and last.
- **Authorization explicitly.** A route that leaks another seller's data returns 200 and looks correct in every test written as the owner. Only a call from the wrong actor finds it.
- **The state after the effect.** An operation whose requirement says it also closes something is not proven by a 200. Read the thing that should have closed.
- **History.** Where the schema keeps snapshots, create, reference, mutate the source, then read the reference and assert it still shows what it showed before. This is the class of requirement that passes every structural check and is almost never built.

## Prove Through The Public Surface

Use public operations for setup and assertions. Do not read the database as a fallback.

When neither the response nor any reachable follow-up read exposes the effect a requirement names, that is a finding about the API. An effect nobody can observe through the product is an effect the product does not deliver.

## Documentation

Every test carries a JSDoc block: a summary sentence, a blank line, topic paragraphs, then the numbered scenario steps. Number the steps in the body with comments that match.

```ts
/**
 * Test that a seller can register a sale and that a customer can see it.
 *
 * Validates the registration flow and the visibility rule that separates
 * an operating sale from an unopened one.
 *
 * 1. Seller joins and authenticates.
 * 2. Seller registers a sale with an opening time in the past.
 * 3. Customer reads the sale and sees the registered content.
 */
```

## Running

Run the backend test command from the workspace root and read the output. A suite that passes because it asserts nothing passes exactly as loudly as one that works.

If you are unsure a test proves its requirement, remove the behavior and confirm the test fails, then restore it.
