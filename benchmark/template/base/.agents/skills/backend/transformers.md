# Transformers

Read [SKILL.md](SKILL.md) first. A transformer owns one DTO's read side: the Prisma selection and the row-to-DTO mapping. Providers call it; they do not reimplement it.

## Structure

One namespace per DTO, three members in this order.

```ts
export namespace ShoppingSaleTransformer {
  export type Payload = PrismaModels.shopping_salesGetPayload<
    ReturnType<typeof select>
  >;

  export function select() {
    return {
      select: {
        id: true,
        name: true,
        created_at: true,
        category: ShoppingCategoryTransformer.select(),
      },
    } satisfies PrismaModels.shopping_salesFindManyArgs;
  }

  export async function transform(input: Payload): Promise<IShoppingSale> {
    return {
      id: input.id,
      name: input.name,
      createdAt: input.created_at.toISOString(),
      category: await ShoppingCategoryTransformer.transform(input.category),
    };
  }
}
```

`Payload` is derived from `select`, which makes the selection the single source of truth and lets the compiler enforce that the two agree.

Name the namespace from the DTO: split on `.`, drop the `I`, join with `At`, append `Transformer`. `IShoppingSale.ISummary` becomes `ShoppingSaleAtSummaryTransformer`.

## The Rules That Keep Inference Alive

Four mechanics decide whether `Payload` means anything, and each failure is quiet or catastrophic.

**Give `select()` no return type annotation.** An annotation widens the literal type and destroys payload inference. `satisfies ...FindManyArgs` validates without widening, which is why it is the only check on that expression.

**Use literal `true` for scalars and `{ select: {...} }` for relations.** A `null` anywhere inside a select collapses `Payload` to `never`, and one such line produces dozens to hundreds of cascading errors elsewhere. When the errors look unrelated to anything you changed, look for that first.

**Use nested `select`, never `include`.** A selection lists what it reads; an include pulls everything and hides the over-fetch.

**Apply exactly one outermost `satisfies`.** Inner relations stay plain `{ select }` or a neighbor's `select()`.

Select keys are relation property names, not table names. Foreign key columns are ordinary scalars selected with `true`, written in full rather than abbreviated.

## Neighbor Reuse Is Paired And Mandatory

A nested DTO belongs to the transformer that owns it. Never reimplement one.

`Neighbor.select()` in the selection implies `await Neighbor.transform(input.rel)` in the mapping, and the transform call implies the matching selection. The pair moves together or the payload type stops matching.

Assign `Neighbor.select()` directly. Writing `Neighbor.select().select` strips the wrapper and breaks the typing.

A join table with no DTO of its own maps inline, and still reuses the neighbor for the inner relation at every depth:

```ts
articleTags: { select: { tag: TagTransformer.select() } },
```

```ts
tags: await ArrayUtil.asyncMap(input.articleTags, (at) =>
  TagTransformer.transform(at.tag),
),
```

## Alignment Is Bidirectional

`transform` returns every DTO property. Every field it reads is selected, and **every selected entry is consumed**. A selected relation the mapping never reads is dead over-fetch, and it costs on every row of every listing.

Null handling follows the DTO signature rather than the column. An optional property takes `input.x ?? undefined`; a nullable property takes `input.x ? ... : null`. A nullable column feeding a required property takes a fallback whose meaning is correct for that field.

A string column feeding a literal-union property narrows through the DTO's own indexed access:

```ts
status: input.status as IReport["status"],
```

Read the DTO's field type before mapping a relation. An id-string property takes `input.rel?.id`; a summary property takes the neighbor's transform. An optional relation arrives as `T | null`, so guard it: throw when the property is required, and use `?.x ?? null` when it is nullable.

## Computed Fields

A computed property is not a column. Selecting one is a type error; select the sources and derive.

**Counts come from `_count`, including filtered ones.**

```ts
_count: { select: { subscriptions: { where: { state: "Active" } } } },
```

```ts
subscriberCount: input._count.subscriptions,
```

Loading the collection and measuring its length scans every related row for every transformed row, which turns one page read into a table scan.

**Never query inside `transform`.** A `prisma` call there runs once per row, which is the N+1 in its purest form. When the model has a relation to the source, select the minimal scalars and reduce them in the mapping.

**Verify the direction before deriving.** Records an entity produced and records it received often live in similarly named relations, and choosing the wrong side yields a plausible number that is wrong.

**Read the current snapshot through the materialized pointer.**

```ts
mvLast: { select: { snapshot: SnapshotTransformer.select() } },
```

```ts
lastSnapshot: input.mvLast
  ? await SnapshotTransformer.transform(input.mvLast.snapshot)
  : null,
```

The pointer already resolves the latest snapshot deterministically, so ordering the history by time and taking the first row is both slower and less certain. It is a nullable relation; guard it.

A retained snapshot of a _different_ entity, such as an order item's captured product, is reached through that entity's own relation rather than through this one's pointer.

## Recursive DTOs

A selection cannot nest a recursive relation indefinitely, so do not try.

Select the lookup keys instead: the parent foreign key for a parent reference, `id` for a children reference, both when the DTO has both, and leave the recursive relation itself unselected. Resolve the property afterwards through an id-keyed cache that loads each node once and is safe against cycles.

Guard a nullable parent before reading through it. At a depth beyond what the contract promises, return a bounded shape such as an empty children array, as long as it still satisfies the DTO.
