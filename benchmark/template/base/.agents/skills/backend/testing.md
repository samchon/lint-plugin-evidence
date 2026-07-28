# Testing

The end-to-end suite is the only artifact that proves the product behaves as the requirements say.

## Read Three Things Before Writing One Test

A test is written from three sources, and skipping any of them produces a test that compiles and proves the wrong thing.

| Source | Answers |
| --- | --- |
| `docs/analysis/` | what must be true, and what must be refused |
| `packages/api/src/functional/**` | which accessor to call, and what it takes |
| `packages/api/src/structures/**` | what a body must contain, and what a response carries |

**The structures are the half most often skipped**, and skipping them is what produces a test asserting a property no DTO declares or building a body from fields someone assumed. Read the type and its JSDoc, including each property's, before writing the object literal. If a property you expect is absent, it is absent: the contract is the fact, and inventing around it makes a test that proves a product nobody shipped.

The requirements half is what the other two cannot supply. The SDK tells you what the product can do; only the documents tell you what it must do, and a suite written from the SDK alone proves the endpoints exist.

## Layout

```
test/
  features/api/<domain>/test_api_<domain>_<action>.ts
  authorize/authorize_<actor>_<join|login|refresh>.ts
  prepare/prepare_random_<entity>.ts
  generate/generate_random_<accessor_path>.ts
```

Each folder holds one kind of thing, and the kinds do not mix.

- **`features/`** holds the tests. One file, one exported function, filename matching the function name.
- **`authorize/`** holds one helper per authentication lifecycle operation, and nothing else.
- **`prepare/`** holds synchronous body builders that call nothing.
- **`generate/`** holds helpers that perform one call and return what it made.

## A Test

```ts
export async function test_api_sale_unit_belongs_to_its_sale(
  connection: api.IConnection,
): Promise<void> {
  // Step 1: Register an administrator, who may open a section
  const adminConnection: api.IConnection = { host: connection.host };
  await authorize_admin_join(adminConnection, {});

  // Step 2: Open the section the sale will belong to
  const section = await generate_random_shopping_admin_section_create(
    adminConnection,
    {},
  );
  typia.assert(section);

  // Step 3: Register a seller, who becomes the owner of what they register
  const sellerConnection: api.IConnection = { host: connection.host };
  await authorize_seller_join(sellerConnection, {});

  // Step 4: Register a sale in that section
  const sale = await generate_random_shopping_seller_section_sale_create(
    sellerConnection,
    { params: { sectionId: section.id } },
  );
  typia.assert(sale);

  // Step 5: Add a unit to the sale
  const unit = await generate_random_shopping_seller_section_sale_saleUnit_create(
    sellerConnection,
    {
      body: { name: "Standard", primary: true },
      params: { sectionId: section.id, saleId: sale.id },
    },
  );
  typia.assert(unit);

  // Step 6: Assert the unit belongs to the sale it was created under
  TestValidator.equals("unit name", unit.name, "Standard");
  TestValidator.equals("unit is primary", unit.primary, true);
  TestValidator.predicate(
    "the sale now lists the unit",
    (
      await api.functional.shopping.seller.section.sale.at(sellerConnection, {
        sectionId: section.id,
        id: sale.id,
      })
    ).units.some((u) => u.id === unit.id),
  );
}
```

The numbered comments mirror the numbered steps in the JSDoc block, so a reader can follow either one and land in the same place.

**Two actors, two connections, and the switch is visible in the order.** The administrator opens the section because that is who may; the seller registers the sale because that is who may. A test that did both on one connection would pass only against a backend that had stopped checking.

**The final assertion reads the effect back through a public operation.** The creation response already carries the unit, so asserting against it proves the response echoed its input. Reading the sale afterwards proves the row was written and is reachable the way a caller would reach it.

## Connection Isolation

The `connection` parameter is a **base connection** carrying the host. Never call an operation with it directly.

Create one connection per actor from that host, authenticate it once, and reuse that same variable for every call by that actor.

```ts
const sellerConnection: api.IConnection = { host: connection.host };
await authorize_seller_join(sellerConnection, {});
```

**The authorization helper does not touch headers, and neither do you.** A lifecycle accessor writes the issued token into the connection it was given, which [the API skill](../api/SKILL.md) covers along with the rest of the connection contract. Nothing here needs to open a controller to know that: the accessor is the contract a test consumes.

So authenticating an actor means calling its authorize helper with that actor's connection. A connection created later and never passed to an authorize helper is anonymous, and the failure arrives as a 401 on a call that looks unrelated.

## Authorize Helpers

One per lifecycle operation, named for the actor and the operation.

```ts
export async function authorize_seller_join(
  connection: api.IConnection,
  props: {
    body?: DeepPartial<IShoppingSeller.IJoin>;
  },
): Promise<IShoppingSeller.IAuthorized> {
  const joinInput = {
    email: props.body?.email ?? typia.random<string & tags.Format<"email">>(),
    password: props.body?.password ?? RandomGenerator.alphaNumeric(16),
    ip: props.body?.ip ?? typia.random<string & tags.Format<"ipv4">>(),
  } satisfies IShoppingSeller.IJoin;
  return await api.functional.shopping.auth.seller.join(connection, {
    body: joinInput,
  });
}
```

`join`, `login`, and `refresh` each get their own helper. Nothing else belongs in this folder: creating an ordinary resource is a generate helper even when only an authenticated actor can do it.

Every field defaults through `??`, so a caller passing `{}` gets a valid actor and a caller pinning one field changes only that field.

## Prepare And Generate

**`prepare_random_*`** builds a creation body. It takes an optional partial, calls nothing, and is synchronous.

```ts
export function prepare_random_sale_unit(
  input?: DeepPartial<IShoppingSaleUnit.ICreate> | undefined,
): IShoppingSaleUnit.ICreate {
  return {
    name: input?.name ?? RandomGenerator.name(),
    primary: input?.primary ?? true,
    description:
      input?.description !== undefined
        ? input.description
        : RandomGenerator.paragraph({ sentences: 3 }),
  };
}
```

A nullable field checks `!== undefined` rather than using `??`, because `??` would replace a deliberate `null` with the random default and silently change what the test is testing.

**`generate_random_*`** performs one call and returns what it made. It takes the connection first and a props object carrying the body and the path parameters.

```ts
export async function generate_random_shopping_seller_section_sale_saleUnit_create(
  connection: api.IConnection,
  props: {
    body?: DeepPartial<IShoppingSaleUnit.ICreate> | undefined;
    params: { sectionId: string; saleId: string };
  },
): Promise<IShoppingSaleUnit> {
  const prepared: IShoppingSaleUnit.ICreate = prepare_random_sale_unit(
    props.body,
  );
  return await api.functional.shopping.seller.section.sale.saleUnit.create(
    connection,
    {
      body: prepared,
      sectionId: props.params.sectionId,
      saleId: props.params.saleId,
    },
  );
}
```

The name comes from the accessor path, joined with underscores. `props` is always present, `{}` when nothing is pinned. Path parameters are required in the type, because a fabricated identifier refers to no row.

Use an existing helper for the endpoint it owns, and call the SDK directly only where none covers it.

## The Scenario Comment Is Required

Every test carries a JSDoc block, and it is not a summary. It is the scenario, written so a reader knows what the test establishes and what it proves without reading the body.

```ts
/**
 * Validate that a unit created under a sale belongs to that sale.
 *
 * A sale lives in a section an administrator opens, and a seller registers
 * the sale and its units. This test builds the section as an administrator
 * and the sale as a seller, adds a unit, then reads the sale back and
 * confirms the unit is reachable through it rather than only echoed by the
 * creation response.
 *
 * 1. Register an administrator, who may open a section.
 * 2. Open the section the sale will belong to.
 * 3. Register a seller, who owns what they register.
 * 4. Register a sale in that section, as the seller.
 * 5. Add a unit to the sale.
 * 6. Read the sale and assert it lists the unit.
 */
```

A summary sentence, a blank line, topic paragraphs, then the numbered steps. The numbers match the `// Step N:` comments in the body.

Write the steps so someone could perform them by hand. A step that says "set up the data" is not a step.

## The Database Is Shared

**The runner does not reset the database between tests.** Tests in one invocation see each other's writes, and a repeated local run sees the previous run's rows.

That makes a whole class of assertion wrong even though it passes the first time you write it.

```ts
// Wrong: passes on an empty database and never again.
TestValidator.equals("no sales yet", page.data.length, 0);
TestValidator.equals("exactly three", page.pagination.records, 3);

// Right: scoped to what this test created.
const mine = page.data.filter((s) => s.id === sale.id);
TestValidator.equals("this seller's sale is listed once", mine.length, 1);
```

Prove against what the scenario controls: the ids it created, a filter it owns, a state transition it caused, a stable business predicate. Never against a global count, a global emptiness, or a position in an unscoped list.

## What Each Kind Of Operation Owes

A scenario proves one distinct observable behavior, and the kind of operation under test fixes the minimum it owes.

| The operation | Owes |
| --- | --- |
| a public read | one success, proved in the response |
| a persisted mutation | one success, plus the effect observed somewhere |
| a list or search | a collection-query proof: the filter selects, the sort orders, the page bounds |
| a create whose body carries a value under a single-column unique constraint | one duplicate rejection, submitting that same value again as the same owner |
| a grade-restricted operation | a positive proof at a sufficient grade, and a negative at an insufficient one where that grade is reachable |

**The duplicate obligation is narrow, and its boundary is the point.** It applies when the caller supplies the value that collides. It does not apply to a value the server generates, to a composite unique index a client cannot steer into a collision, or to login and refresh, which are not creations. Writing a duplicate case for any of those tests the database rather than the requirement.

## Setup Uses Join, And Does Not Repeat Side Effects

Use the join operation for ordinary authenticated setup. It registers the account and returns the authorization in one call, so a second login for the same actor buys nothing.

The lifecycle operations are the exception, because there the lifecycle is the subject.

- **A join test** has no prior identity setup. That is the whole point of it.
- **A login test** joins first to create an account with credentials it keeps, then calls login on a **fresh, unauthenticated connection**. Reusing the joined connection proves nothing, because that connection already carries a token.
- **A refresh test** joins, then passes the issued refresh value through the refresh operation's own request DTO.

## Setup Order Is The Scenario

The setup calls are the scenario's structure, so write them as an ordered list before writing any of them.

1. Authenticate the actor that performs the next protected step.
2. Create parents before children.
3. Establish the membership, ownership, approval, or grade through the public operation that grants it.
4. Switch actors only after the previous actor's setup is finished.
5. Then call the target.

**Every actor switch is visible in that order.** An administrator joins, the administrator creates a product, a customer joins, the customer orders it: four steps, two connections, and a reader can see which call runs as whom.

**The target is not one of its own prerequisites**, and one method-and-path appears once in one scenario. Needing it twice means either the scenario proves two things, or the second call is the target.

**Read what a prerequisite already does before adding the next call.** A create operation whose contract says the creator becomes the owner and is auto-subscribed has already established that state. Subscribing again is a duplicate that the provider correctly rejects, and the failure looks like a defect in the operation under test rather than in the setup.

Derive each actor's setup from the contract rather than by copying another actor's. Two actors with similar names often need different steps.

## Naming

`test_api_<feature>_<action>_<context>`, globally unique across the suite, because each name owns one file and one exported function.

Differentiate variants by input condition or expected outcome: `test_api_user_registration_when_username_taken`. A negative authority case names the grade it was refused for: `test_api_sale_registration_forbidden_for_unapproved_seller`.

Renaming duplicate behavior does not make it distinct. If two names would prove the same thing, there is one test.

## A Grade Must Be Reachable Before It Can Be Proved

**Join establishes the default grade and nothing else.** Any higher grade in a test comes from calling the operation that grants it, as that grade's holder, exactly as a user would.

The promoted actor keeps the connection it already had. Grades are loaded per request rather than carried in the token, so a grant takes effect on the next call and re-authenticating after one proves nothing. If a test only passes after a second login, the grade is being read from the wrong place.

That makes the negative case conditional. Write it when an insufficient grade is publicly reachable, using the correct actor at a grade the operation does not accept, with otherwise valid input. Skip it when the actor has no grades, when every declared grade satisfies the gate, or when no insufficient grade can be reached at all.

**When no public operation can establish a sufficient grade, the scenario is currently impossible, and that is the finding.** Record it and repair the API. Do not invent setup, write to the database, or let the caller assign their own authority to get the test running: a test that reaches a grade by a route no user has proves a behavior the product does not offer. [controllers.md](controllers.md) owns the grant and removal routes this depends on.

## Do Not Assert What The Contract Does Not Expose

Token claims are not part of the contract unless a response DTO carries them. Do not decode a token to assert an expiry, a subject, or an address.

Expiry cannot be manufactured without the server's secret, and tampering with an issued token proves only that a bad token is rejected. One such rejection is enough for the suite; there is no separate expired, forged, and malformed case a client can actually steer into distinct outcomes.

**Refresh-token reuse is provable only where the contract exposes revocation or rotation.** When a refresh extends the same session and the previously issued token is self-contained, that older token stays valid by design, so a test asserting it is now rejected asserts a behavior the design does not have. Check what the contract says before writing that case.

An operation that returns nothing needs a public follow-up read to prove its effect. Without one, the test can prove the call succeeded and can prove its rejections, and it cannot claim the state changed.

## Take Accessors From The Generated SDK

Never derive an accessor name from a path, a verb, or a guess. If the one you expect does not exist, find the operation whose method and path match and use the accessor generated for it.

Never cast a namespace to reach a missing member. If neither an accessor nor a helper covers an endpoint, the contract is what needs repairing.

## Random Data

```ts
typia.random<string & tags.Format<"email">>();
typia.random<number & tags.Type<"uint32"> & tags.Minimum<1>>();
RandomGenerator.name();
RandomGenerator.paragraph({ sentences: 3 });
RandomGenerator.alphaNumeric(16);
```

Use the type-driven generator for anything with a format or a numeric constraint, and the text generator for human-readable strings.

Randomize a resource's own data. **Path parameters and foreign keys come from prior responses.** A fabricated identifier refers to no row and fails with a not-found for the wrong reason. Fabricate one only in an explicit not-found test.

## Assertions

```ts
typia.assert(response);
```

That validates the whole response: every property, type, format, and constraint. **Never add checks after it.** A pattern test on an identifier or a `typeof` comparison is redundant.

Then assert the business fact, with the title first so a failure names the assertion:

```ts
TestValidator.equals("unit belongs to the sale", unit.saleId, sale.id);
TestValidator.predicate("the sale lists the unit", detail.units.some((u) => u.id === unit.id));
```

**Every test needs at least one business assertion.** A test that calls an operation and validates the response type proves the framework works.

## Rejections

Assert that the call was refused. Do not assert which status refused it.

```ts
await TestValidator.error("another seller cannot edit this sale", async () => {
  await api.functional.shopping.seller.section.sale.update(
    otherSellerConnection,
    { sectionId: section.id, id: sale.id, body },
  );
});
```

Whether a refusal arrives as 401, 403, 404, or 409 depends on which check the provider reaches first, and a provider that verifies existence before authority returns a not-found where you expected a forbidden. Both are correct, so pinning the code turns a legitimate reordering into a red suite. **The status is the server's choice and is not part of the contract.**

Two spellings are the reflex, and neither belongs in this suite:

```ts
// Both forbidden: the code is not what the test is about.
await TestValidator.httpError("not found", 404, async () => { ... });
TestValidator.equals("status", error.status, 403);
```

`TestValidator.error` is the only rejection assertion here. It says the call was refused, which is the requirement, and says nothing about how, which is not.

Await both layers: the assertion and the call inside it. A synchronous callback takes no `await` on the outer call; an async one takes it on both.

## Never Test Type Errors

A deliberately wrong type is a compile error, not a test. The boundary already validates types, formats, and lengths.

Positive paths stay clean: valid bodies, a qualified caller, no manufactured failure. The one sanctioned exception is an authority negative, where the inputs remain valid and only the caller's grade is insufficient.

## Code Discipline

- `const` throughout, with ternaries for conditional values.
- Declare a body with bare `satisfies`, without a widening annotation.
- Await every call. A missing await turns a failure into unhandled-rejection noise that reports as a pass.
- Never suppress the compiler with an ignore comment, `any`, or a double cast. A missing required property usually means a prerequisite call was omitted, and its response supplies the value.
- Use only properties the DTOs declare.

## What A Test Must Prove

- **The requirement, not the mechanism.** If a rule says two coupons of the same kind cannot stack, stack them and assert the refusal.
- **A negative twin for every positive.** Where a rule permits something, pin the adjacent case one property away where it must be refused.
- **The boundaries.** Empty list, single element, expired window, the threshold on both sides, first page and last.
- **Authorization explicitly.** A route that leaks another actor's data returns 200 and looks correct in every test written as the owner.
- **The state after the effect.** An operation whose requirement says it also closes something is not proven by a 200.
- **History.** Where the schema keeps snapshots, create, reference, mutate the source, then read the reference and assert it still shows what it showed before.
- **Recovery, end to end.** Where a delete has a restore, delete and then restore, and assert the row came back with its content and its owner intact. A delete test alone passes against an implementation that empties the row on the way out, and the loss surfaces only when someone restores.

## Prove Through The Public Surface

Use public operations for setup and assertions. Do not read the database as a fallback.

When neither the response nor any reachable follow-up read exposes the effect a requirement names, that is a finding about the API. An effect nobody can observe through the product is an effect the product does not deliver.

## Running

Run the backend test command from the workspace root and read the output. The runner boots the application itself against the SQLite file, runs every exported test function, and closes it, so nothing needs to be started beforehand. A suite that passes because it asserts nothing passes exactly as loudly as one that works.

If you are unsure a test proves its requirement, remove the behavior and confirm the test fails, then restore it.
