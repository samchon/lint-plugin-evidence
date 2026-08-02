# Backend Testing

Tests under `packages/backend/test/` are executable proof of backend behavior. Read the requirements, generated accessors, and DTOs before writing a scenario. The SDK says what can be called; only the requirements say what must happen.

Keep the scaffold health test intact. It proves infrastructure, not a product requirement.

## Layout

```text
test/
  features/api/<domain>/test_api_<domain>_<behavior>.ts
  authorize/authorize_<actor>_<join|login|refresh>.ts
  prepare/prepare_random_<entity>.ts
  generate/generate_random_<accessor_path>.ts
```

- `features/`: one exported test function per file.
- `authorize/`: one helper per authentication lifecycle operation.
- `prepare/`: synchronous creation-body builders with no calls.
- `generate/`: one public SDK call that returns the created value.

Names match the exported function and describe the behavior or refusal being proved.

## Scenario Shape

Every test JSDoc states the behavior, why the scenario proves it, and numbered steps. The body repeats those steps as comments.

```ts
/**
 * Proves a sale unit remains reachable through its owning sale.
 *
 * 1. Join an administrator and create the required section.
 * 2. Join a seller and create a sale in that section.
 * 3. Add a unit to the sale.
 * 4. Read the sale and assert it contains the unit.
 */
export async function test_api_sale_unit_belongs_to_sale(
  connection: api.IConnection,
): Promise<void> {
  const admin: api.IConnection = { host: connection.host };
  await authorize_admin_join(admin, {});
  const section = await generate_random_admin_section_create(admin, {});

  const seller: api.IConnection = { host: connection.host };
  await authorize_seller_join(seller, {});
  const sale = await generate_random_seller_sale_create(seller, {
    params: { sectionId: section.id },
  });
  const unit = await generate_random_seller_sale_unit_create(seller, {
    params: { sectionId: section.id, saleId: sale.id },
    body: { name: "Standard", primary: true },
  });

  const detail = await api.functional.shopping.seller.sale.at(seller, {
    id: sale.id,
  });
  typia.assert(detail);
  TestValidator.predicate(
    "sale contains the created unit",
    detail.units.some((elem) => elem.id === unit.id),
  );
}
```

The final assertion observes the effect through a public read. Checking only the create response proves that the response echoed input, not that state persisted.

## Connections And Setup

The test's `connection` parameter supplies only the host. Create one connection per actor, authenticate it once through an authorize helper, and reuse it. Never write headers manually.

Setup uses public operations:

1. authenticate the actor for the next protected step;
2. create parents before children;
3. establish ownership, membership, grade, or approval through the operation that grants it;
4. switch actors explicitly; and
5. invoke the target behavior.

Do not seed the database directly. A required state that no public operation can establish is an API finding.

An external delivery channel is not product state and is the exception to public-only setup. Email, SMS, webhook, payment-provider, and comparable secrets or callbacks must never be added to a public response merely so a test can obtain them. Inject a fake outbound adapter, observe the value at that trust boundary, and then exercise the next step through the public API. Also prove that the unauthenticated public response does not disclose the value, distinguish account existence, or otherwise substitute for control of the external channel. This is a test double for a real dependency, not permission to read or seed Prisma.

The database is shared across tests and repeated runs. Assert against records and identifiers created by the scenario, never global emptiness, total row count, or an unscoped position.

## Helpers

Prepare helpers preserve deliberate `null`:

```ts
export function prepare_random_sale(
  input?: DeepPartial<IShoppingSale.ICreate>,
): IShoppingSale.ICreate {
  return {
    title: input?.title ?? RandomGenerator.name(),
    closedAt:
      input?.closedAt !== undefined
        ? input.closedAt
        : null,
  };
}
```

Generate helpers call one existing accessor. Path parameters and foreign keys come from earlier public responses; random identifiers are valid only in an explicit not-found test.

## Coverage

For every requirement, name a test that would fail if the behavior disappeared. For every operation, cover success and every stated refusal. For every exchanged DTO shape, construct or read it through an applicable operation.

Minimum behavioral cases:

| Contract | Proof |
| --- | --- |
| persisted mutation | successful response and observable follow-up state |
| list or search | filter, ordering, and pagination behavior |
| ownership or visibility | permitted and forbidden actors |
| threshold or window | both sides of the boundary |
| retained history | mutate the source, then read the retained value |
| delete with restore | content and ownership survive the full cycle |
| caller-controlled unique value | duplicate submission is refused |
| grade restriction | reachable sufficient and insufficient grades |

Do not invent negative cases the requirements or public contract do not state.

## Assertions

Use `typia.assert(response)` for the full response shape, then assert the business fact:

```ts
typia.assert(response);
TestValidator.equals("owner remains seller", response.seller.id, seller.id);
```

Every test needs a business assertion. Type validation alone proves only contract shape.

Assert the exact status or diagnosis when the public contract states it. Otherwise assert a generic refusal. Await both the refusal assertion and the SDK call inside it.

A deliberately malformed wire payload cannot pass through the typed SDK. When a requirement promises runtime boundary refusal, isolate the invalid payload in a raw-HTTP helper and assert the public response without weakening production types.

## Test Integrity

Never:

- cast to reach a missing accessor;
- use `any`, double casts, or suppression comments;
- read Prisma directly for setup or proof;
- decode token internals the DTO does not expose;
- expose an external-channel secret, proof, or callback payload through a public DTO for test convenience;
- weaken an assertion to make the suite pass; or
- run the same target method/path twice in one scenario unless the second call is the behavior under test.

Before a backend or overall review that may qualify as clean, temporarily remove one material behavior, run its test and require failure, restore the behavior exactly, then require success. Complete this mutation calibration before the qualifying review begins.

## Running

Before provider realization, tests should fail against random-answer controller stubs. A green suite while material stubs remain means the assertions are insufficient.

From `packages/backend`:

```bash
pnpm test
```

The command builds the API package, compiles the configured test Program, boots the application against SQLite, runs every exported test function, and closes it.
