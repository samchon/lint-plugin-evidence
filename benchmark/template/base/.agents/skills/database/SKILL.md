---
name: database
description: Defines Prisma schema organization, table and column naming, documentation comments, and the snapshot, soft-delete, and materialization patterns this project uses. Use before adding or changing a model.
---

# Database

## Schema Organization

The schema lives in `packages/backend/prisma/schema/` and is split by domain across numbered files, with `main.prisma` holding the datasource and the generators.

```
prisma/schema/
  main.prisma
  schema-01-<domain>.prisma
  schema-02-<domain>.prisma
```

The numeric prefix orders the domains from foundational to dependent so a reader meets a table before the tables that reference it. Prisma parses the folder as one schema, so a model may reference a model declared in another file.

Add a new domain as a new numbered file rather than appending to an unrelated one.

## Naming

- **Tables are snake_case and plural**, prefixed with the project's entity family: `shopping_sales`, `shopping_sale_snapshots`. The prefix keeps names unambiguous once the schema is large.
- **Columns are snake_case.** A foreign key is named for the table it points at plus `_id`: `shopping_section_id`.
- **Timestamps are past-participle verbs plus `_at`**: `created_at`, `opened_at`, `closed_at`, `paused_at`. The name says what happened, not what the column stores.
- **Primary keys are `id String @id`**, assigned as UUIDs by the application rather than by the database.

## Documentation Comments Are Part Of The Schema

Every model and every column carries a `///` comment. These reach the generated client types and the ERD document, so they are published documentation rather than internal notes.

```prisma
/// Seller **sales** products.
///
/// `shopping_sales` is an entity that embodies product sales information
/// registered by the {@link shopping_sellers seller}.
///
/// @namespace Sales
/// @author <author>
model shopping_sales {
  /// Primary Key.
  id String @id

  /// Belonged section's {@link shopping_sections.id}
  shopping_section_id String
}
```

Rules that matter:

- **`///` documents; `//` does not.** A `//` comment is discarded by Prisma and never reaches the generated types or the ERD. Use `///` for anything a reader of the schema needs.
- **Reference other models with `{@link table_name}`.** The ERD generator turns these into links, and a reader following the data model needs them.
- **A column comment states meaning, not type.** `created_at DateTime` does not need "the creation time as a DateTime"; it needs to say how it differs from `opened_at`.
- **State what `null` means** on every nullable column. A nullable timestamp whose absence is unexplained is a question every future reader has to re-answer.

## Patterns

- **Snapshots preserve history.** When an entity's content can change after another entity references it, keep the identity row stable and record each revision as a snapshot row. An order that references a sale must still show what was bought after the seller edits the sale.
- **Soft deletion is a `deleted_at` timestamp**, not a row removal, wherever history matters. Every query over such a table filters it.
- **Materialize what the read path cannot afford to compute.** A denormalized column exists to make a listing query possible; it is written on the same transaction that changes its source, never repaired lazily.

Use each pattern where the requirements need it. Applying all three to every table produces a schema nobody can read.

## After Changing The Schema

Regenerate the Prisma client before anything that imports it compiles:

```bash
pnpm --filter {{backendPackageName}} build:prisma
```

A change to the schema is not complete until the models it adds are reachable from a provider and covered by a test.
