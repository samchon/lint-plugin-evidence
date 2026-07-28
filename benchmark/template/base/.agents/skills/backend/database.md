# Database

This document owns the schema.

## Organization

The schema lives in `packages/backend/prisma/schema/`, split by domain across numbered files, with `main.prisma` holding the datasource and the generators.

```
prisma/schema/
  main.prisma
  schema-01-<domain>.prisma
  schema-02-<domain>.prisma
```

The numeric prefix orders domains from foundational to dependent, so a reader meets a table before the tables that reference it. Prisma parses the folder as one schema, so a model may reference a model in another file and a model name is unique across the whole folder. Add a new domain as a new numbered file.

`main.prisma` holds the datasource and both generators, and nothing else. **It declares the provider and not the connection**, which lives in `prisma.config.ts` beside the package and is owned by [wiring.md](wiring.md). It declares the SQLite provider, the client generator with its output path, and `prisma-markdown`, which is why schema comments are published documentation rather than internal notes: they become `docs/ERD.md`, which a reader sees without opening the schema.

## Field Types

The vocabulary is closed. There is no JSON, object, or array type, and structure that needs querying is normalized into a child table instead.

| Use        | For                                                             |
| ---------- | --------------------------------------------------------------- |
| `String`   | text, and every semantic string below                           |
| `Int`      | counts, ordinals                                                |
| `Float`    | approximate measurements: ratings, ratios, scores               |
| `Decimal`  | money, tax, fees, balances, anything requiring exact arithmetic |
| `Boolean`  | a flag whose absence has no third meaning                       |
| `DateTime` | instants, and calendar dates normalized to UTC midnight         |
| `Bytes`    | opaque binary, rarely                                           |

**Pick the most specific meaning, and record it in the comment.** A column holding an email, a URL, a UUID, or an IP address is still `String` at the database level, but the DTO derives its format from what the schema says it is. A semantic column documented only as text produces a DTO property with no format, and every consumer then accepts anything.

**Use `Decimal` for money and `Float` for nothing that is added up.** Floating arithmetic on a ledger drifts, and the drift appears as a balance that is wrong by a cent after a thousand rows.

**A money column is an amount plus its currency.** Store the currency code beside the amount whenever it can vary. A row posted outside its scope's base currency also stores the rate used at posting and the converted amount, because the rate table owns current rates and this row owns the rate that was honored.

Every primary key is named `id` and is a UUID assigned by the application. Never a domain-specific name: relations reference `[id]`, so renaming it breaks every inbound relation. If the old key is business-meaningful, keep it as an ordinary field with a unique index. Every foreign key is a UUID too, matching what it points at.

## Stance

Decide what kind of table this is before designing it, because the decision drives what the API may expose over it.

| Stance | For | Exposure |
| --- | --- | --- |
| actor | an account with authentication | its own lifecycle operations |
| session | a login session row | read surfaces only |
| primary | an entity users independently create, search, and manage | create, search, detail, update, delete |
| subsidiary | a parent-scoped supporting table | managed through the parent |
| snapshot | an immutable point-in-time record | append-only or read-only |
| material | a read-only `mv_*` projection | read-only |

Ask whether users act on the entity through a standalone lifecycle or only inside its parent's lifecycle. That is the primary-versus-subsidiary question and it decides the whole route shape.

A snapshot is named as the `_snapshots` form of a base table and is never declared without that base. A figure a business event froze, such as a period-close total, is `subsidiary` under the event that froze it: `material` would recompute and erase it, and `primary` would ship update and delete surfaces over an immutable financial record.

## Naming

- Tables are snake_case and plural with the project's entity-family prefix: `shopping_sales`, `shopping_sale_snapshots`.
- Columns are snake_case. A foreign key is the target table's name, singularized, plus `_id`: `shopping_sections` is referenced as `shopping_section_id`.
- Timestamps are a past-participle verb plus `_at`: `created_at`, `opened_at`, `deleted_at`.
- Primary keys are `id String @id`, assigned as UUIDs by the application so an entity has identity before it is written.

## Stored Facts

Classify every candidate field before adding it. Only three kinds become columns: state this row owns, a point-in-time captured value, and an explicitly required materialized value in an `mv_*` table. Derived query output is not a column.

- Do not copy another table's fact for display convenience. Reference the owner.
- Do not store a transitively dependent fact. `comments.article_title` depends on the article, not the comment.
- Normalize structured or repeated data into child tables instead of hiding queryable JSON, arrays, or nullable field clusters in one row. A nullable `answer_title` and `answer_body` cluster becomes an answers table with a unique foreign key.
- Business-visible numbers, codes, references, and confirmation identifiers named by the requirements are stored facts. The internal UUID does not replace them.
- Any field the requirements allow to be absent must be nullable, so the valid unset state is representable.

Live aggregates such as counts, sums, and scores are query output, never cached base-table columns. Their only legal home is an `mv_*` table.

## Temporal Fields And Deletion

`created_at` is required and non-null on every model, including logs, snapshots, projections, and join tables. Even system rows need ordering and tracing.

Match the temporal set to the table kind:

| Table kind | Columns |
| --- | --- |
| mutable business entity | `created_at`, `updated_at`, optionally `deleted_at` |
| snapshot or immutable history | `created_at` only |
| audit or event log | `created_at` only |
| join table | usually `created_at` only |

`updated_at` on a snapshot falsely implies mutability. Omit it.

A calendar date that bounds a business rule is a stored fact of its own and is never read from `created_at`. Give it a datetime column normalized to 00:00:00 UTC and say in the comment that it is a calendar date, so comparisons stay date to date.

For a `primary` row, make the deletion decision explicit from the stated lifecycle: physical removal, a retained hidden row, an inactive flag, an audit-preserved row, or a reversible workflow. Choose `deleted_at` when retention is required for moderation, legal review, permanent child references, or a visible trash queue. When the requirements say removal, model removal.

A nullable foreign key does not protect a child that must outlive its parent, because a hard delete cascades and removes the child too. Protect survivors with soft delete on the parent or a retained copy on the child.

If a requirement names a restore, recover, or reactivate workflow, the schema must contain storage that can perform it. Otherwise a later layer has to invent the missing state.

## A Complete Model

This is the shape to copy. Columns first, then relations, each group under a banner comment, with the indexes last.

```prisma
/// Seller **sales** products.
///
/// The revisable content lives in {@link shopping_sale_snapshots}, not here.
/// When a seller edits a registered item this row does not change and a new
/// snapshot is created, so a customer's purchase history survives the edit.
///
/// @namespace Sales
model shopping_sales {
  //----
  // COLUMNS
  //----
  /// Primary Key.
  id String @id

  /// Belonged section's {@link shopping_sections.id}
  shopping_section_id String

  /// Registering seller's {@link shopping_sellers.id}
  shopping_seller_id String

  /// Creation time of record.
  created_at DateTime

  /// Opening time of sale.
  ///
  /// If `null`, the sale has not opened yet.
  opened_at DateTime?

  /// Closing time of sale.
  ///
  /// If `null`, the sale runs forever.
  closed_at DateTime?

  //----
  // RELATIONS
  //----
  /// Belonged section.
  section shopping_sections @relation(fields: [shopping_section_id], references: [id], onDelete: Cascade)

  /// Registering seller.
  seller shopping_sellers @relation(fields: [shopping_seller_id], references: [id], onDelete: Cascade)

  /// Every revision of this sale.
  snapshots shopping_sale_snapshots[]

  /// Pointer to the current revision.
  mvLast mv_shopping_sale_last_snapshots?

  @@index([shopping_section_id])
  @@index([shopping_seller_id])
  @@index([created_at])
}
```

Read what the shape encodes. The foreign key column and its relation are separate declarations: the column stores the value under the target table's name plus `_id`, and the relation names how code traverses it, in camelCase. A provider writes `{ shopping_seller_id: id }` in a filter and `seller: { connect: { id } }` in a creation, and both spellings are load-bearing in their own place.

## The Documentation Comment Contract

Every model and every column carries a `///` comment. These reach the generated client types and `docs/ERD.md`.

```prisma
/// Seller **sales** products.
///
/// The main information is recorded in the sub {@link shopping_sale_snapshots},
/// not here. When a seller changes a registered item, the existing record is
/// not changed and a new snapshot is created, so a customer's purchase history
/// survives a later edit.
///
/// @namespace Sales
model shopping_sales {
  /// Primary Key.
  id String @id

  /// Opening time of sale.
  ///
  /// If `null` value assigned, it means not opened yet.
  opened_at DateTime?
}
```

- `///` documents and `//` is discarded. A `//` comment reaches nothing.
- A blank `///` line separates the summary from the body.
- Reference another model with `{@link table_name}` and a column with `{@link table.column}`.
- `@namespace` groups the model in the ERD; `@erd` adds it to another group.
- A model comment states the business concept and why it is separate from its neighbors, not the storage.
- A column comment states meaning, not type.
- Every nullable column states what `null` means.

A description that claims a value is query output while the field list stores it, or the reverse, is a defect. Reconcile them before moving on.

## After Changing The Schema

Regenerate the client, and regenerate again after a comment change, because the ERD comes from the same run. A schema change is not complete until the models it adds are reachable from a provider, exposed where a requirement asks for them, and covered by a test.
