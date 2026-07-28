# Testing

Read [SKILL.md](SKILL.md) first. The end-to-end suite is the only artifact that proves the product behaves as the requirements say.

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
export async function test_api_department_creation_subdepartment_nesting(
  connection: api.IConnection,
): Promise<void> {
  // Step 1: Register a new member
  const memberConnection: api.IConnection = { host: connection.host };
  await authorize_member_join(memberConnection, {});

  // Step 2: Create an organization, whose creator becomes its owner
  const organization = await generate_random_member_organizations_create(
    memberConnection,
    {},
  );
  typia.assert(organization);

  // Step 3: Create a top-level department
  const operations = await generate_random_member_organizations_departments_create(
    memberConnection,
    {
      body: { name: "Operations", parentId: null },
      params: { organizationId: organization.id },
    },
  );
  typia.assert(operations);

  // Step 4: Create a child department under it
  const logistics = await generate_random_member_organizations_departments_create(
    memberConnection,
    {
      body: { name: "Logistics", parentId: operations.id },
      params: { organizationId: organization.id },
    },
  );
  typia.assert(logistics);

  // Step 5: Assert the parent relation
  TestValidator.equals("logistics name", logistics.name, "Logistics");
  TestValidator.equals(
    "logistics parent id matches operations",
    logistics.parent!.id,
    operations.id,
  );
}
```

The numbered comments mirror the numbered steps in the JSDoc block, so a reader can follow either one and land in the same place.

## Connection Isolation

The `connection` parameter is a **base connection** carrying the host. Never call an operation with it directly.

Create one connection per actor from that host, authenticate it once, and reuse that same variable for every call by that actor.

```ts
const memberConnection: api.IConnection = { host: connection.host };
await authorize_member_join(memberConnection, {});
```

**The authorization helper does not touch headers, and neither do you.** The generated accessor for a lifecycle operation writes the issued token into the connection it was given, because its controller method declares that in JSDoc:

```ts
/**
 * @setHeader token.access Authorization
 */
```

So authenticating an actor means calling its authorize helper with that actor's connection. A connection created later and never passed to an authorize helper is anonymous, and the failure arrives as a 401 on a call that looks unrelated.

## Authorize Helpers

One per lifecycle operation, named for the actor and the operation.

```ts
export async function authorize_member_join(
  connection: api.IConnection,
  props: {
    body?: DeepPartial<IErpHrmMember.IJoin>;
  },
): Promise<IErpHrmMember.IAuthorized> {
  const joinInput = {
    email: props.body?.email ?? typia.random<string & tags.Format<"email">>(),
    password: props.body?.password ?? RandomGenerator.alphaNumeric(16),
    ip: props.body?.ip ?? typia.random<string & tags.Format<"ipv4">>(),
  } satisfies IErpHrmMember.IJoin;
  return await api.functional.erpHrm.auth.member.join(connection, {
    body: joinInput,
  });
}
```

`join`, `login`, and `refresh` each get their own helper. Nothing else belongs in this folder: creating an ordinary resource is a generate helper even when only an authenticated actor can do it.

Every field defaults through `??`, so a caller passing `{}` gets a valid actor and a caller pinning one field changes only that field.

## Prepare And Generate

**`prepare_random_*`** builds a creation body. It takes an optional partial, calls nothing, and is synchronous.

```ts
export function prepare_random_department(
  input?: DeepPartial<IErpHrmDepartment.ICreate> | undefined,
): IErpHrmDepartment.ICreate {
  return {
    name: input?.name ?? RandomGenerator.name(),
    description:
      input?.description !== undefined
        ? input.description
        : RandomGenerator.paragraph({ sentences: 3 }),
    parentId: input?.parentId !== undefined ? input.parentId : null,
  };
}
```

A nullable field checks `!== undefined` rather than using `??`, because `??` would replace a deliberate `null` with the random default and silently change what the test is testing.

**`generate_random_*`** performs one call and returns what it made. It takes the connection first and a props object carrying the body and the path parameters.

```ts
export async function generate_random_member_organizations_departments_create(
  connection: api.IConnection,
  props: {
    body?: DeepPartial<IErpHrmDepartment.ICreate> | undefined;
    params: { organizationId: string };
  },
): Promise<IErpHrmDepartment> {
  const prepared: IErpHrmDepartment.ICreate = prepare_random_department(
    props.body,
  );
  return await api.functional.erpHrm.member.organizations.departments.create(
    connection,
    { body: prepared, organizationId: props.params.organizationId },
  );
}
```

The name comes from the accessor path, joined with underscores. `props` is always present, `{}` when nothing is pinned. Path parameters are required in the type, because a fabricated identifier refers to no row.

Use an existing helper for the endpoint it owns, and call the SDK directly only where none covers it.

## The Scenario Comment Is Required

Every test carries a JSDoc block, and it is not a summary. It is the scenario, written so a reader knows what the test establishes and what it proves without reading the body.

```ts
/**
 * Validate that a department can be nested under another department.
 *
 * A department belongs to an organization, and a sub-department references
 * its parent by id. This test builds the organization and the parent, then
 * creates a child and confirms the parent link survives the response.
 *
 * 1. Register a member, who becomes the owner of what they create.
 * 2. Create an organization under that member.
 * 3. Create a top-level department with a null parent.
 * 4. Create a second department whose parent is the first.
 * 5. Assert the child's parent id equals the first department's id.
 */
```

A summary sentence, a blank line, topic paragraphs, then the numbered steps. The numbers match the `// Step N:` comments in the body.

Write the steps so someone could perform them by hand. A step that says "set up the data" is not a step.

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
TestValidator.equals("logistics parent id", logistics.parent!.id, operations.id);
TestValidator.predicate("parent is not null", logistics.parent !== null);
```

**Every test needs at least one business assertion.** A test that calls an operation and validates the response type proves the framework works.

## Rejections

Assert that the call was refused. Do not assert which status refused it.

```ts
await TestValidator.error("a non-owner cannot edit the department", async () => {
  await api.functional.erpHrm.member.organizations.departments.update(
    otherMemberConnection,
    { organizationId: organization.id, id: logistics.id, body },
  );
});
```

Whether a refusal arrives as 401, 403, 404, or 409 depends on which check the provider reaches first, and a provider that verifies existence before authority returns a not-found where you expected a forbidden. Both are correct, so pinning the code turns a legitimate reordering into a red suite.

Await both layers: the assertion and the call inside it.

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

## Prove Through The Public Surface

Use public operations for setup and assertions. Do not read the database as a fallback.

When neither the response nor any reachable follow-up read exposes the effect a requirement names, that is a finding about the API. An effect nobody can observe through the product is an effect the product does not deliver.

## Running

Run the backend test command from the workspace root and read the output. A suite that passes because it asserts nothing passes exactly as loudly as one that works.

If you are unsure a test proves its requirement, remove the behavior and confirm the test fails, then restore it.
