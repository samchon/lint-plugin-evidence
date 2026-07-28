# Database

Read [SKILL.md](SKILL.md) first. This document owns the schema.

## Organization

The schema lives in `packages/backend/prisma/schema/`, split by domain across numbered files, with `main.prisma` holding the datasource and the generators.

```
prisma/schema/
  main.prisma
  schema-01-<domain>.prisma
  schema-02-<domain>.prisma
```

The numeric prefix orders domains from foundational to dependent, so a reader meets a table before the tables that reference it. Prisma parses the folder as one schema, so a model may reference a model in another file and a model name is unique across the whole folder. Add a new domain as a new numbered file.

`main.prisma` declares two generators: the Prisma client, and `prisma-markdown`, which writes `docs/ERD.md`. That second generator is why schema comments are published documentation.

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
- Columns are snake_case. A foreign key is the target table's name plus `_id`.
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

## Relations

Foreign keys flow child to parent. Parent tables do not store child ids. Declare both sides, because the back-reference is what lets a provider's `select` traverse the relation.

A tenant or scope has exactly one storage owner per entity graph. The table the scope directly owns carries the scope id; every descendant reaches the scope through its required parent chain. A second direct scope foreign key on a descendant gives that row two ancestor paths and a route shape that differs table by table.

## Uniqueness And Indexes

A business rule that says something is unique belongs in the schema as `@@unique`, not only in a provider check. Only the schema holds under concurrency.

Index what the requirements say you filter and sort by. A listing endpoint whose requirement names an ordering needs that ordering to be indexable.

## Snapshots And Retained State

A live foreign key to a mutable row is never as-of evidence. A snapshot made only of parent keys, timestamps, and version markers is incomplete: copy enough business state to reconstruct the point-in-time meaning even after the source is edited or deleted.

When a retained concept is named, copy every requirement-scoped field of it unless the requirements narrow the subset. Lists introduced by "including" or "such as" are not exhaustive. A snapshot column copies the source field's optionality.

Before-and-after change tracking needs the changed field, previous value, new value, timestamp, and actor. A previous-only record does not satisfy it. Visible action or review history needs the five-part tuple: actor, target, action, outcome or reason, and time.

The inverse boundary matters as much. Carts, wishlists, drafts, and browsing lists display current source values. Do not copy a display value unless the requirements explicitly lock, reserve, quote, or honor it later.

## Anchoring

Anchor every record to an entity that exists when the record is created. A required foreign key may only point at something that must already exist at creation time.

If an attempt or an external result can be stored before its final parent exists, give it a pre-success anchor such as an actor, a session, or a request row. A nullable final-parent foreign key alone strands every failed or retried row.

## Ownership Guard

Before adding a field or a convenience foreign key, check whether an existing table already owns that fact. A second writable copy desynchronizes silently.

The test is whether a later edit to the source must change what this row means. If it must, reference the owner. If it must not, the captured value is retained evidence and belongs here. Posting-time currency and exchange rate are the standard example: the rate table owns current rates, and the posted row owns the rate honored at posting.

Keep one current store per actor and scope for role, grade, or title state. History tables preserve change over time and never replace the current store.

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
