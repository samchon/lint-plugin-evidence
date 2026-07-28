# Providers

This document owns the business logic and every database access.

A provider is an exported namespace named for the entity it owns. There is no dependency injection: a provider is a namespace of functions, and callers import it.

Every function takes a single object named `props`. Positional parameters are not used, including in the private helpers a provider keeps for itself.

**The caller arrives as a payload**, the small `{ id, session_id, type }` object the authorize provider returned. [authorization.md](authorization.md) owns the payload and where it comes from.

The parameter's type says who may reach the function, and it takes one of two shapes.

**One actor: name the parameter for it.** `seller: SellerPayload` on a function only a seller calls. The type is the documentation, and nothing inside has to ask who the caller is.

**Several actors: take the union, and call it `actor`.** `actor: SellerPayload | CustomerPayload` on a read that both reach. Narrow on `type` where the rule differs, which is what turns a per-actor requirement into a branch a reviewer can check against the document.

```ts
props.actor.type === "seller"
  ? [{ shopping_seller_id: props.actor.id }]
  : [{ opened_at: { lte: new Date() } }]
```

Widening the union past the actors that may actually call it is the mistake to avoid. Every caller the type admits is a caller you have to have thought about, and one nobody thought about reaches the query with no branch of its own and gets whatever the fallback happens to be.

**Grade is checked here too, and it is a separate question from the actor.** The payload carries no grade, so a grade-restricted function loads the current one and refuses through the same error helper as any other business rule. Being the right kind of actor, holding the required grade, and owning the particular row are three checks, and passing one says nothing about the others.

The provider composes rather than maps. The selection and the row-to-DTO mapping belong to the [transformer](transformers.md); the creation payload belongs to the [collector](collectors.md). What is left here is the business logic: which rows this caller may see, what a write means, what is refused.

## Readers

A list endpoint builds one where clause, then runs the count and the page against it.

```ts
export const index = async (props: {
  actor: SellerPayload | CustomerPayload;
  input: IShoppingSale.IRequest;
}): Promise<IPage<IShoppingSale.ISummary>> => {
  const where = {
    AND: [
      ...visibility({ actor: props.actor, strict: true }),
      ...(await search({ input: props.input.search })),
    ],
  } satisfies Prisma.shopping_salesWhereInput;

  const current: number = props.input.page ?? 1;
  const limit: number = props.input.limit ?? 100;

  const [records, rows] = await Promise.all([
    MyGlobal.prisma.shopping_sales.count({ where }),
    MyGlobal.prisma.shopping_sales.findMany({
      where,
      orderBy: orderBy({ sort: props.input.sort }),
      skip: (current - 1) * limit,
      take: limit,
      ...ShoppingSaleAtSummaryTransformer.select(),
    }),
  ]);

  return {
    pagination: {
      current,
      limit,
      records,
      pages: Math.ceil(records / limit),
    },
    data: await Promise.all(rows.map(ShoppingSaleAtSummaryTransformer.transform)),
  };
};
```

**The count and the page share one `where` object.** Building the filter twice is how a total stops matching the rows it counts, and the symptom is a last page that is empty or a count that never lets the caller reach the end.

**The total comes from the count query**, never from the length of the returned rows. Those agree only on the final page.

`skip` and `take` come from the request with explicit defaults, so a caller who omits both gets a bounded response rather than the whole table.

A detail read uses the throwing finder so a missing row becomes a 404 without a hand-written branch, and it applies the same visibility clause as the list:

```ts
export const at = async (props: {
  actor: SellerPayload | CustomerPayload;
  id: string;
}): Promise<IShoppingSale> => {
  const record = await MyGlobal.prisma.shopping_sales.findFirstOrThrow({
    where: { id: props.id, AND: visibility({ actor: props.actor, strict: false }) },
    ...ShoppingSaleTransformer.select(),
  });
  return ShoppingSaleTransformer.transform(record);
};
```

Reserve the non-throwing finder for states where absence is a valid business outcome.

**That 404 is not automatic.** It comes from the database-error mapper registered at bootstrap, which the [wiring topic](wiring.md) owns.

Without that registration the throwing finder produces a `500`, and the raw client message reaches the caller. That message interpolates the table, the column, and the offending value, so the schema becomes readable from outside.

## Visibility Belongs In One Clause

The rule that decides which rows an actor may see is a function, reused by every read of that entity.

```ts
const visibility = (props: {
  actor: SellerPayload | CustomerPayload;
  strict: boolean;
}) =>
  [
    { deleted_at: null },
    ...(props.actor.type === "seller"
      ? [{ shopping_seller_id: props.actor.id }]
      : props.actor.type === "customer" && props.strict === true
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
  input: IShoppingSale.IRequest.ISearch | null | undefined;
}) =>
  [
    ...(props.input?.section_codes?.length
      ? [{ section: { code: { in: props.input.section_codes } } }]
      : []),
    ...(props.input?.show_paused === false ? [{ paused_at: null }] : []),
    ...(await ShoppingSaleSnapshotProvider.search({ input: props.input })).map((snapshot) => ({
      mv_last: { snapshot },
    })),
  ] satisfies Prisma.shopping_salesWhereInput["AND"];
```

Note the last entry. A filter that belongs to a related entity is built by that entity's provider and mapped into this one's relation path, so the same filter can be reused wherever that relation appears.

Check a boolean filter with `=== false` rather than falsiness, or an absent filter and an explicitly false one become the same query.

## Sorting Goes Through A Mapper

The request carries `"+field"` and `"-field"` tokens. One function turns the whole array into ordering objects, dropping anything it does not recognize and falling back when nothing survives.

```ts
const COLUMNS = {
  "sale.created_at": (direction) => ({ created_at: direction }),
  "sale.updated_at": (direction) => ({
    mv_last: { snapshot: { created_at: direction } },
  }),
  "sale.opened_at": (direction) => ({ opened_at: direction }),
} satisfies Record<
  IShoppingSale.IRequest.SortableColumns,
  (direction: "asc" | "desc") => Prisma.shopping_salesOrderByWithRelationInput
>;

const orderBy = (props: {
  sort: IShoppingSale.IRequest["sort"];
}): Prisma.shopping_salesOrderByWithRelationInput[] => {
  const parsed = (props.sort ?? [])
    .map((token) => {
      const column = COLUMNS[token.slice(1) as keyof typeof COLUMNS];
      return column?.(token[0] === "+" ? "asc" : "desc") ?? null;
    })
    .filter((elem) => elem !== null);
  return parsed.length !== 0 ? parsed : [{ created_at: "desc" }];
};
```

**A request string never reaches an ordering clause.** The map is the whitelist: a token outside it produces nothing rather than a query against a column that may not exist.

**The fallback is explicit and its column is real.** A listing whose sort is absent, or whose every token was unrecognized, still returns a defined order. Verify the fallback column exists rather than assuming a creation timestamp is there.

## Writers

The payload comes from the collector, the response from the transformer. What the provider owns is the guard, the ordering, and the transaction boundary.

```ts
export const create = async (props: {
  seller: SellerPayload;
  body: IShoppingSale.ICreate;
}): Promise<IShoppingSale> => {
  const record = await MyGlobal.prisma.shopping_sales.create({
    data: await ShoppingSaleCollector.collect({
      body: props.body,
      seller: props.seller,
    }),
    ...ShoppingSaleTransformer.select(),
  });
  return ShoppingSaleTransformer.transform(record);
};
```

Read what that does. The collector assembles the identity row, its first snapshot, and the pointer to that snapshot as one nested create, so the write is atomic and no window exists where a sale has no history. The response is read back through the same selection the DTO is built from, not from a narrower read.

**This call is where the actor narrows.** The provider holds a `SellerPayload` and the collector's parameter is `IEntity`, so passing it through hands the collector the identifier and nothing else. That is deliberate and it type-checks without a cast, because a payload carries an `id`. [authorization.md](authorization.md) has the whole path an actor takes through the layers, and this is the step where it stops being an identity and becomes a reference.

**Never assemble a creation payload inline here.** The collector is the one place that knows the assembly, and a second copy diverges the moment either side gains a field.

An update creates a **new snapshot** and repoints the materialized pointer, rather than mutating the row:

```ts
export const update = async (props: {
  seller: SellerPayload;
  id: string;
  body: IShoppingSale.IUpdate;
}): Promise<IShoppingSale> => {
  await ownership({ seller: props.seller, id: props.id });
  await MyGlobal.prisma.$transaction(async (tx) => {
    const snapshot = await tx.shopping_sale_snapshots.create({
      data: await ShoppingSaleSnapshotCollector.collect({
        body: props.body,
        sale: { id: props.id },
      }),
    });
    await tx.mv_shopping_sale_last_snapshots.update({
      where: { shopping_sale_id: props.id },
      data: { snapshot: { connect: { id: snapshot.id } } },
    });
  });
  return at({ actor: props.seller, id: props.id });
};
```

Four rules are visible here.

- **The ownership guard runs first**, before anything is read or written.
- **The snapshot and the pointer move inside one transaction.** Between the two writes the pointer names the previous revision, and a failure between them leaves it there permanently. A pointer repaired later is wrong in between and nothing observes that window.
- **The payload comes from the snapshot's collector**, not from an inline object assembled here.
- **The response is re-read through `at`**, not assembled from the narrow write. A response built from the write does not carry the fields the DTO promises.

A field the requirements say is mutated in place, such as a state timestamp, is an ordinary update and does not create a snapshot. Decide from the requirement, not from convenience.

## Deletion Is One Of Two Shapes, And They Are Not Alike

The schema decides which. **A model carrying a deletion marker is soft-deleted; one without it is physically deleted.** A resource that also exposes a recovery operation is always the first, because nothing can restore a row that is gone.

**A physical delete removes the target row and nothing else.**

```ts
await MyGlobal.prisma.shopping_sales.delete({ where: { id: props.id } });
```

The declared `onDelete: Cascade` removes the dependents. Deleting children by hand first is not extra safety: it is a second deletion order that the schema does not know about, and it drifts the moment a relation is added.

**A soft delete sets the marker on the target row, and changes nothing else.**

```ts
await MyGlobal.prisma.shopping_sales.update({
  where: { id: props.id },
  data: { deleted_at: new Date() },
});
```

Everything else about the row survives: the owner foreign key, the content, the payload. That is not laziness, and the reasons are load-bearing.

- **Restore has to have something to restore.** Clearing or anonymizing the content on delete makes the recovery operation return an empty row, and no test written against delete alone will show it.
- **Authorization still runs against the deleted row.** The owner check that decides who may restore it reads the owner foreign key, so nulling that column locks the owner out of their own recovery.
- **"Is it deleted" reads the marker.** Never "the owner is null" or "the content is empty", because those are states an ordinary row can also reach.

Do not cascade a soft delete to children either. If a child should disappear with its parent, that belongs in the read filter, where it is reversible, rather than in the write, where it is not.

## Nullable On One Side Is Not Nullable On The Other

A column and the DTO field that carries it disagree about nullability more often than they agree, and each direction has its own repair.

**A non-null column behind a nullable field takes a default, never `null`.** The field is nullable because the caller may omit it, and the column is not because the row always has one. Supply the value the requirement states.

```ts
// column: expired_at DateTime, field: expiredAt?: string | null
expired_at: props.body.expiredAt
  ? new Date(props.body.expiredAt)
  : refreshHorizon(),
```

**That column cannot be filtered for null either.** `{ equals: null }` against a non-null column is a type error, and the question being asked is almost always temporal or value-based instead.

```ts
where: { expired_at: { gt: new Date() } }, // not yet expired
```

**A nullable value feeding a non-null column needs a guard, not a coercion.** When the session's scope or the caller's optional reference may be absent, decide what its absence means and refuse there, rather than passing an empty string or the current time and writing a row that means something nobody asked for.

## Stance Decides What A Write May Do

The kind a table was given in the schema is not a label. It governs which operations a provider may perform on it.

| Stance | Permitted |
| --- | --- |
| `primary`, `subsidiary`, `actor`, `session` | anything the business logic requires |
| `snapshot` | reads and inserts only, because it is immutable history |
| `material` | reads only, except the current pointer a provider maintains beside a snapshot append |

An update or a delete against a snapshot row is a defect regardless of what the code needs, because the row is the evidence something else depends on. When a snapshot appears to need editing, the entity needs a new snapshot instead.

The one write a `material` table accepts is the maintained current pointer, upserted in the same transaction as the snapshot it points at.

## Scheduled Work Is An Operation

The backend owns no scheduler. There is no timer, no queue, and no jobs directory, and the bootstrap only creates the application and listens.

A requirement that says something runs nightly, at a period boundary, or when a queue drains is realized as **an ordinary operation that performs one run**. Recurrence belongs to whatever already schedules work in the deployment: a platform cron entry, a CI workflow, an operator command calling that endpoint.

An in-process timer would have no operation, no test, and no requirement owner, so the requirement stays reported as unrealized while the code runs unproven. The operation gives it a contract, a body, a scenario, and a coverage owner, and it preserves the on-demand rerun such a process always turns out to need.

**Make the run idempotent per period.** Key the run row on its scope and period, guard it with a unique constraint, and reject or no-op a period already completed rather than executing it twice.

```prisma
@@unique([organization_id, period_started_at])
```

A retried cron, an operator rerun, and a redelivered queue message all arrive as a second call, and without the key each posts the work again. Assert that with a second call in the test.

Record the trigger in the operation's own documentation and in the requirement it serves. Omitting both silently turns a scheduled obligation into a manual endpoint nobody knows to schedule.

## Do Not Revalidate The Boundary

Never add runtime type or format checks on parameters. The generated validator already enforced every type, format, and length the DTO declares, so a repeated check is dead code that drifts from the contract. Delete duplicates you find.

Business-constraint validation is still yours: a quantity above a configured maximum, a transition the current state forbids, a duplicate the schema does not make unique.

## Errors

Throw through the shared helper, with the status the requirement implies.

```ts
throw ErrorUtil.forbidden("Only the owning seller may edit this sale.");
throw ErrorUtil.notFound("No such sale.");
throw ErrorUtil.unprocessable(diagnoses);
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

## The Datasource Is SQLite

The datasource is SQLite so that anyone can clone this repository and run it with nothing installed and nothing configured. That is worth more here than any capability a server database would add, so do not reach for one.

It also means the generated client offers less than a server datasource would, and the gaps surface either as a compile error or as a filter that silently matches nothing.

- **There is no case-insensitive filter mode.** `mode: "insensitive"` and `Prisma.QueryMode` are the two spellings to know, because both are the reflex from a server datasource and neither exists on this client. A search that must ignore case normalizes the value on the way in and compares against a stored normalized column, rather than asking the query to fold case.
- **Prefer a comparison the datasource can index.** A prefix match is a range; a contains match is a scan, and on a listing that scan runs for every page.

When a requirement genuinely cannot be satisfied on this datasource, report it. Adding an external dependency the benchmark cannot assume is not the repair.

## The Defects That Survive Every Checker

This is where the compiler stops helping and most real defects live, because a type-correct value can invert the behavior. Each of these compiles, passes review by a reader skimming for correctness, and returns something plausible.

- **A default that means the opposite of unset.** A fallback to the current time on an expiry field means "already expired", not "no expiry".
- **An aggregate over the wrong side of a relation.** It returns a number, and the number is wrong.
- **A guard that checks the wrong thing.** Checking a membership table alone denies the legitimate owner, who holds the permission inherently.
- **An effect implemented in one path and not its sibling.** Create writes the history row; update does not.
- **A filter omitted on one of eleven reads** of a soft-deleted table.

After any substantial piece of work, ask four questions against the requirement's meaning rather than the signature: what does null mean for each field here, which direction does each relation aggregate, which effects does each consumer expect, and what does the code do in the case the requirement calls out.

## Verification

Run the build and the lint stage, then the tests, and read the output. A build proves the shapes line up; only the tests prove the behavior. When something fails, decide which layer owns it before editing.
