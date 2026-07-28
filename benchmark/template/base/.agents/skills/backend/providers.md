# Providers

Read [SKILL.md](SKILL.md) first. This document owns the business logic and every database access.

A provider is an exported namespace named for the entity it owns. Everything below is the shape it takes.

## Projections: `select` And `transform`

Each read shape is its own nested namespace holding exactly two exports.

```ts
export namespace ShoppingSaleProvider {
  export namespace summary {
    export const transform = async (
      input: Prisma.shopping_salesGetPayload<ReturnType<typeof select>>,
    ): Promise<IShoppingSale.ISummary> => {
      const snapshot = input.mv_last?.snapshot;
      if (!snapshot) throw ErrorProvider.internal("No snapshot found.");
      return {
        section: ShoppingSectionProvider.json.transform(input.section),
        seller: ShoppingSellerProvider.summary.transform(() =>
          ErrorProvider.internal("The sale has not been registered by seller."),
        )(input.sellerCustomer),
        created_at: input.created_at.toISOString(),
        updated_at: snapshot.created_at.toISOString(),
        opened_at: input.opened_at?.toISOString() ?? null,
        closed_at: input.closed_at?.toISOString() ?? null,
        ...(await ShoppingSaleSnapshotProvider.summary.transform(snapshot)),
      };
    };
    export const select = () =>
      ({
        include: {
          section: ShoppingSectionProvider.json.select(),
          sellerCustomer: ShoppingSellerProvider.invert.select(),
          mv_last: {
            include: {
              snapshot: ShoppingSaleSnapshotProvider.summary.select(),
            },
          },
        },
      }) satisfies Prisma.shopping_salesFindManyArgs;
  }

  export namespace json { /* the detail shape, same two exports */ }
}
```

Four things in that block are the convention rather than the example.

1. **`transform`'s parameter type is derived from `select`**, through `GetPayload<ReturnType<typeof select>>`. The two cannot drift: add a field to the DTO and it fails to compile until `select` fetches it; drop a relation from `select` and `transform` stops compiling. **Never widen that payload type by hand to clear an error.** That single edit is what breaks the guarantee, and nothing afterwards will catch it.
2. **`select` ends in `satisfies Prisma.<table>FindManyArgs`**, so a mistyped relation key fails at the selector rather than at runtime.
3. **`transform` composes other providers' transforms, and `select` composes their selects.** A nested projection stays owned by the provider that knows it, and the two halves compose in lockstep.
4. **One namespace per shape.** `summary` for the list item, `json` for the detail, `history` when a timeline needs a third. Do not parameterize one transform with a flag; the payload type is what makes each shape safe, and a flag erases it.

A relation that must exist but is nullable in the payload is checked once at the top of `transform` and turned into an internal error. Silently emitting a half-built DTO is worse than failing.

## Readers

A list endpoint is a call to the shared pagination helper with a where-clause builder and a sort mapper.

```ts
export const index = async (props: {
  actor: IShoppingActorEntity;
  input: IShoppingSale.IRequest;
}): Promise<IPage<IShoppingSale.ISummary>> =>
  PaginationUtil.paginate({
    schema: ShoppingGlobal.prisma.shopping_sales,
    payload: summary.select(),
    transform: summary.transform,
  })({
    where: {
      AND: [
        ...where(props.actor, true),
        ...(await search({ actor: props.actor, input: props.input.search })),
      ],
    },
    orderBy: props.input.sort?.length
      ? PaginationUtil.orderBy(orderBy)(props.input.sort)
      : [{ created_at: "desc" }],
  } satisfies Prisma.shopping_salesFindManyArgs)(props.input);
```

The helper takes the delegate, the payload, and the transformer, then the query, then the page request. It runs `count` and `findMany` against the same `where`, clamps the page into range, and returns the wrapper. The total comes from the count, never from the length of the rows.

A detail read uses the throwing finder so a missing row becomes a 404 without a hand-written branch, and it applies the same visibility clause as the list:

```ts
export const at = async (props: {
  actor: IShoppingActorEntity;
  id: string;
}): Promise<IShoppingSale> => {
  const record = await ShoppingGlobal.prisma.shopping_sales.findFirstOrThrow({
    where: { id: props.id, AND: where(props.actor, false) },
    ...json.select(),
  });
  return json.transform(record);
};
```

Reserve the non-throwing finder for states where absence is a valid business outcome.

## Visibility Belongs In One Clause

The rule that decides which rows an actor may see is a function, reused by every read of that entity.

```ts
const where = (actor: IShoppingActorEntity, strict: boolean) =>
  [
    { sellerCustomer: { shopping_channel_id: channelOf(actor).id } },
    ...(actor.type === "seller"
      ? [{ sellerCustomer: { member: { of_seller: { id: actor.id } } } }]
      : actor.type === "customer" && strict === true
        ? [
            {
              opened_at: { lte: new Date() },
              suspended_at: null,
              OR: [{ closed_at: null }, { closed_at: { gt: new Date() } }],
            },
          ]
        : []),
  ] satisfies Prisma.shopping_salesWhereInput["AND"];
```

This is where a per-actor requirement actually lives. A seller sees only their own rows; a customer sees only the operating ones. Writing that rule at each call site is how one endpoint ends up leaking another seller's data while every other endpoint is correct, and no happy-path test finds it.

The `strict` parameter exists because a detail read by id and a listing sometimes owe different visibility. Make that difference a named argument rather than two divergent clauses.

## Filters Are Spread-Conditional

Build optional search terms by spreading a conditional array, so an absent filter contributes nothing rather than a clause matching everything.

```ts
const search = async (props: {
  actor: IShoppingActorEntity;
  input: IShoppingSale.IRequest.ISearch | null | undefined;
}) =>
  [
    ...(props.input?.section_codes?.length
      ? [{ section: { code: { in: props.input.section_codes } } }]
      : []),
    ...(props.input?.show_paused === false ? [{ paused_at: null }] : []),
    ...(await ShoppingSaleSnapshotProvider.search({ input: props.input })).map(
      (snapshot) => ({ mv_last: { snapshot } }),
    ),
  ] satisfies Prisma.shopping_salesWhereInput["AND"];
```

Note the last entry. A filter that belongs to a related entity is built by that entity's provider and mapped into this one's relation path, so the same filter can be reused wherever that relation appears.

Check a boolean filter with `=== false` rather than falsiness, or an absent filter and an explicitly false one become the same query.

## Sorting Goes Through A Mapper

The request carries `"+field"` and `"-field"` tokens. A mapper turns each into a real ordering object and returns `null` for anything it does not recognize, which the helper drops.

```ts
const orderBy = (
  key: IShoppingSale.IRequest.SortableColumns,
  direction: "asc" | "desc",
) =>
  key === "sale.created_at"
    ? { created_at: direction }
    : key === "sale.updated_at"
      ? { mv_last: { snapshot: { created_at: direction } } }
      : key === "sale.opened_at"
        ? { opened_at: direction }
        : null;
```

Never feed a request string into an ordering clause. Always supply a static fallback when the sort is absent or every token was dropped, and verify the fallback column exists rather than assuming a creation timestamp.

## Writers

A create writes the row, its first snapshot, and the materialized current pointer in one nested insert, then reads back through the same selector it will return.

```ts
export const create = async (props: {
  seller: IShoppingSeller.IInvert;
  input: IShoppingSale.ICreate;
}): Promise<IShoppingSale> => {
  const section: IShoppingSection = await ShoppingSectionProvider.get(
    props.input.section_code,
  );
  const snapshot = await ShoppingSaleSnapshotProvider.collect({
    channel: props.seller.customer.channel,
    input: props.input,
  });
  const record = await ShoppingGlobal.prisma.shopping_sales.create({
    data: {
      id: v4(),
      section: { connect: { id: section.id } },
      sellerCustomer: { connect: { id: props.seller.customer.id } },
      snapshots: { create: [snapshot] },
      mv_last: { create: { snapshot: { connect: { id: snapshot.id } } } },
      created_at: new Date(),
      opened_at: props.input.opened_at,
      closed_at: props.input.closed_at,
    },
    ...json.select(),
  });
  return json.transform(record);
};
```

Read what that does. The identity row, its first snapshot, and the pointer to that snapshot are one atomic write, so no window exists where a sale has no history. The id is assigned by the application. A referenced entity is resolved first and connected by id, so a bad reference fails before anything is written. The response comes from the same `select` the DTO is built from, not from a narrower read.

An update creates a **new snapshot** and repoints the materialized pointer, rather than mutating the row:

```ts
export const update = async (props: {
  seller: IShoppingSeller.IInvert;
  id: string;
  input: IShoppingSale.IUpdate;
}): Promise<IShoppingSale> => {
  await ownership(props);
  const snapshot = await ShoppingGlobal.prisma.shopping_sale_snapshots.create({
    data: {
      ...(await ShoppingSaleSnapshotProvider.collect({
        channel: props.seller.customer.channel,
        input: props.input,
      })),
      sale: { connect: { id: props.id } },
    },
  });
  await ShoppingGlobal.prisma.mv_shopping_sale_last_snapshots.update({
    where: { shopping_sale_id: props.id },
    data: { snapshot: { connect: { id: snapshot.id } } },
  });
  return at({ actor: props.seller, id: props.id });
};
```

Three rules are visible here.

- **The ownership guard runs first**, before anything is read or written.
- **The materialized pointer is repointed in the same operation that created the row it points at.** A pointer repaired later is wrong in between, and nothing observes that window.
- **The response is re-read through `at`**, not assembled from the narrow write. A response built from the write does not contain the fields the DTO promises.

A field the requirements say is mutated in place, such as a state timestamp, is an ordinary update and does not create a snapshot. Decide from the requirement, not from convenience.

## Do Not Revalidate The Boundary

Never add runtime type or format checks on parameters. The generated validator already enforced every type, format, and length the DTO declares, so a repeated check is dead code that drifts from the contract. Delete duplicates you find.

Business-constraint validation is still yours: a quantity above a configured maximum, a transition the current state forbids, a duplicate the schema does not make unique.

## Errors

Throw through the shared helper, with the status the requirement implies.

```ts
throw ErrorProvider.forbidden("Only the owning seller may edit this sale.");
throw ErrorProvider.notFound("No such sale.");
throw ErrorProvider.unprocessable(diagnoses);
```

The helper wraps a string or a diagnosis list into a structured body, so the client receives something it can act on rather than a bare status. Never throw a plain `Error`.

Choose the status from the meaning, because the distinction is user-visible and the business rules usually state it: `403` when the actor lacks authority, `404` when the resource is invisible to that actor, `409` or `422` when the current state forbids it.

When several checks can fail, collect the diagnoses and throw once. One response listing three problems beats three round trips.

## Data Conversions

- Dates leave as ISO strings and arrive as `Date` objects: `input.created_at.toISOString()`, and `input.opened_at?.toISOString() ?? null` for a nullable one.
- Decimals leave as numbers.
- Every field you read must be selected. Do not read a relation only to recheck what the `where` already enforced.
- Row-level counts come from an aggregate, never from loading the collection and reducing it. That turns one page read into a scan of every related row.

## Prisma Traps

The most frequent defect is writing a table name where a relation property name belongs. `select`, `include`, and `create` use the property names declared in the schema, not the table names.

| Symptom | First thing to check |
| --- | --- |
| a field "does not exist" on a select or create input | wrong relation or column name; an abbreviated foreign-key guess is the usual cause |
| a property missing on a query result | it was not in `select`; add it as `true`, a nested select, or a count |
| an optional relation in a create input | `undefined` skips it, `null` is a type error |
| a null filter | write `where: { field: null }`, not an equality object |
| lowercase logical operators | they are uppercase |
| a relation filter given a bare id | it is an object; for a nullable relation, filter the foreign-key column directly |
| an upsert complaining about `data` | the shape is where, create, update |

Two that hide well. Narrowing with `!== undefined` does not eliminate `null`, so use `!= null` when a nullable input feeds a non-null column. And a filter object that is built but never passed is a silent no-op that changes nothing and fails nothing.

## Verification

Run the build and the lint stage, then the tests, and read the output. A build proves the shapes line up; only the tests prove the behavior. When something fails, decide which layer owns it before editing.
