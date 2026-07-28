---
name: database
description: Defines Prisma schema organization, naming, the documentation-comment contract that reaches the generated types and the ERD, and the snapshot, soft-delete, and materialization patterns. Use before adding or changing a model.
---

# Database

## Schema Organization

The schema lives in `packages/backend/prisma/schema/`, split by domain across numbered files, with `main.prisma` holding the datasource and the generators.

```
prisma/schema/
  main.prisma
  schema-01-<domain>.prisma
  schema-02-<domain>.prisma
```

The numeric prefix orders domains from foundational to dependent, so a reader meets a table before the tables that reference it. Prisma parses the folder as one schema, so a model may reference a model declared in another file, and a model name is unique across the whole folder.

Add a new domain as a new numbered file rather than appending to an unrelated one.

`main.prisma` declares two generators: the Prisma client, and `prisma-markdown`, which writes `docs/ERD.md`. That second generator is why schema comments are published documentation rather than internal notes.

## Naming

- **Tables are snake_case and plural**, prefixed with the project's entity family: `shopping_sales`, `shopping_sale_snapshots`. The prefix keeps names unambiguous once the schema is large and makes a join readable at a glance.
- **Columns are snake_case.** A foreign key is named for the table it points at plus `_id`: `shopping_section_id`.
- **Timestamps are a past-participle verb plus `_at`**: `created_at`, `opened_at`, `closed_at`, `paused_at`, `deleted_at`. The name states what happened, not what the column stores.
- **Primary keys are `id String @id`**, assigned as UUIDs by the application rather than by the database, so an entity has its identity before it is written.

## The Documentation Comment Contract

Every model and every column carries a `///` comment. These reach the generated client types and `docs/ERD.md`, so a reader who never opens the schema still reads them.

```prisma
/// Seller **sales** products.
///
/// `shopping_sales` is an entity that embodies product sales information
/// registered by the {@link shopping_sellers seller}. The main information
/// is recorded in the sub {@link shopping_sale_snapshots}, not here. When a
/// seller changes a registered item, the existing record is not changed and
/// a new snapshot record is created.
///
/// This preserves the {@link shopping_customers customer}'s purchase history
/// after a purchase, even if the seller later changes the components or the
/// price.
///
/// @namespace Sales
/// @erd Systematic
/// @author <author>
model shopping_sales {
  /// Primary Key.
  id String @id

  /// Belonged section's {@link shopping_sections.id}
  shopping_section_id String

  /// Opening time of sale.
  ///
  /// If `null` value assigned, it means not opened yet.
  opened_at DateTime?
}
```

Rules that decide whether the comment survives:

- **`///` documents and `//` does not.** A `//` comment is discarded by Prisma and never reaches the generated types or the ERD.
- **A blank `///` line separates the summary from the body.** The first line becomes the short description; the rest is detail.
- **Reference other models with `{@link table_name}`**, and a column with `{@link table.column}`. The ERD generator turns these into links, and a reader following the data model needs them.
- **`@namespace` groups the model in the ERD**, and a model may appear in more than one group with `@erd`.

What a comment must say:

- **A model comment states the business concept**, not the storage. Say what it is in the product's own vocabulary and why it is separate from its neighbors.
- **A column comment states meaning, not type.** `created_at DateTime` does not need "the creation time as a DateTime"; it needs to say how it differs from `opened_at`.
- **Every nullable column states what `null` means.** An unexplained nullable timestamp is a question every future reader re-answers, usually differently.

## Patterns

Use each where the requirements need it. Applying all three everywhere produces a schema nobody can read.

**Snapshots preserve history.** When an entity's content can change after another entity references it, keep the identity row stable and record each revision as a snapshot row. An order that references a sale must still show what was bought after the seller edits the sale. The identity table holds what does not change; the snapshot table holds what does; the referencing entity points at the snapshot.

**Soft deletion is a `deleted_at` timestamp**, not a row removal, wherever history or referential meaning matters. Every query over such a table filters it, and forgetting the filter in one provider is the defect this pattern trades for.

**Materialize what the read path cannot afford to compute.** A denormalized column exists to make a listing query possible. Write it in the same transaction that changes its source; a value repaired lazily is a value that is wrong between the change and the repair.

## Relations

Declare both sides. Prisma needs the back-reference, and its presence is what lets a provider's `select` traverse the relation.

Index what you filter and sort by. A listing endpoint whose requirement names an ordering needs that ordering to be indexable, and a unique business constraint belongs in the schema as `@@unique` rather than only in a provider's check, because only the schema holds under concurrency.

## After Changing The Schema

Regenerate before anything that imports the client compiles, and regenerate again if you change a comment, because the ERD is generated from the same run.

A schema change is not complete until the models it adds are reachable from a provider, exposed where a requirement asks for them, and covered by a test.
