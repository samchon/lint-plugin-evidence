# Collectors

Read [SKILL.md](SKILL.md) first. A collector owns one creation DTO's write side: it assembles the Prisma creation payload. Providers call it; they do not build payloads inline.

The read side and the write side are independent. A missing helper on one never forces manual code on the other.

## Structure

```ts
export namespace ShoppingSaleCollector {
  export async function collect(props: {
    body: IShoppingSale.ICreate;
    seller: IEntity;
  }) {
    return {
      id: v4(),
      name: props.body.name,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
      seller: { connect: { id: props.seller.id } },
      category: { connect: { id: props.body.categoryId } },
      parent: props.body.parentId
        ? { connect: { id: props.body.parentId } }
        : undefined,
      tags: props.body.tags.length
        ? {
            create: await ArrayUtil.asyncMap(props.body.tags, (tag, i) =>
              ShoppingSaleTagCollector.collect({ body: tag, sequence: i }),
            ),
          }
        : undefined,
    } satisfies PrismaModels.shopping_salesCreateInput;
  }
}
```

The payload includes the identifier and the timestamps. `satisfies ...CreateInput` is what proves the shape before it reaches the database.

## Relations Connect

Relations go through `connect`. Assigning a foreign key column directly is a type error against a checked creation input, and the keys are relation property names rather than table names.

**The absent branch of an optional relation is `undefined`, never `null`.** `undefined` skips the field; `null` is a nullable scalar value and is rejected for a relation. Guard every nullable reference, including a self-referential parent, before connecting.

## Identifiers

Generate `id: v4()` at collect time. When nested rows must reference it, bind it to a local first and use that local in both places, so the parent and its children agree on one value.

## Nested Creation

**Reuse the child's collector** through an async map. Inlining a child payload when a collector exists forks the assembly logic, and the fork is discovered when one side gains a field.

**Omit the parent connect for a child created through the parent's nested create.** The nesting supplies it. A child created standalone connects its non-null parent explicitly.

**For a many-to-many creation that must deduplicate**, map the join rows inline and use `connectOrCreate` for the inner entity, keyed on its unique value, reusing that entity's collector in the create branch.

**For a snapshot-versioned entity**, append the initial snapshot as a nested create on the snapshot relation and reuse the snapshot's collector. The identity row and its first revision are then one write, so no window exists where the entity has no history.

## Resolving A Column The Body Does Not Carry

In this order:

1. the exact declared body property, by its API name rather than the column name;
2. a declared reference or actor entity;
3. a declared external scalar input;
4. an indirect reference, by querying a related row for the missing key, remembering that the result exposes only what was selected;
5. a semantic fallback.

Use a fallback only where its meaning is correct for that field:

| Field kind | Fallback |
| --- | --- |
| creation timestamp | the current time |
| nullable event timestamp such as a deletion or completion time | `null` |
| status boolean | `false` |
| nullable field | `null` |
| non-nullable number | `0` |
| non-nullable string | `""` |

The nullable-event-timestamp rule stops at nullable. A session row's expiry is non-null and takes the refresh horizon at issue or refresh; the authorization topic owns that.

Never pretend the body carries a field it does not. If a required column has no source in any of the five steps, the contract or the schema is wrong, and the fix belongs there.

## What Never Goes In

**Computed properties.** A total, a count, or an average is derived on the read side. Writing one fabricates a column that does not exist.

**Plaintext credentials.** Derive them inside the assembly:

```ts
password_hash: await BcryptUtil.hash(props.body.password),
```

Do not accept a pre-hashed value as a parameter. The collector is the only place that knows the storage form, and moving that knowledge outward is how two call sites end up hashing differently.
