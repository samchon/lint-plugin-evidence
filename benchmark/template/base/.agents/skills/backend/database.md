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

`main.prisma` holds the datasource and both generators, and nothing else:

```prisma
datasource db {
  provider = "sqlite"
}

generator client {
  provider     = "prisma-client"
  output       = "../../src/prisma"
  moduleFormat = "cjs"
}

generator markdown {
  provider = "prisma-markdown"
  title    = "{{name}}"
  output   = "../../docs/ERD.md"
}
```

The second generator is why schema comments are published documentation rather than internal notes: they become `docs/ERD.md`, which a reader sees without opening the schema.

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

  /// Registering seller's {@link shopping_customers.id}
  shopping_seller_customer_id String

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
  sellerCustomer shopping_customers @relation(fields: [shopping_seller_customer_id], references: [id], onDelete: Cascade)

  /// Every revision of this sale.
  snapshots shopping_sale_snapshots[]

  /// Pointer to the current revision.
  mv_last mv_shopping_sale_last_snapshots?

  @@index([shopping_section_id])
  @@index([shopping_seller_customer_id])
  @@index([created_at])
}
```

Read what the shape encodes. The foreign key column and its relation are separate declarations: the column stores the value, the relation names how code traverses it. The relation name is camelCase and says which side it is, so `sellerCustomer` reads as the seller's customer row rather than as a bag of customers.

## Relations

Foreign keys flow child to parent. Parent tables do not store child ids, because a pointer in both directions has two places to be wrong.

**Declare both sides.** The back-reference is what lets a provider's `select` traverse the relation, and without it the relation exists in the database and not in the generated client.

**Name the inverse for the direction it represents.** `authoredArticles` and `submittedRequests` say what the rows are; a bare `articles` reads as "rows about this row" and invites aggregating the wrong side. A one-to-many inverse is plural, a one-to-one inverse is singular and optional.

**Several foreign keys to the same table each need a distinct semantic name**, on both the column and the relation. Two columns named `user_id` on one table is an error, and two relations named `user` is worse because it compiles.

A tenant or scope has exactly one storage owner per entity graph. The table the scope directly owns carries the scope id; every descendant reaches it through its required parent chain. A second direct scope foreign key on a descendant gives that row two ancestor paths, and the public route shape then differs table by table.

## Composition Or Association

Every foreign key is one of two things, and the choice decides how the child is created.

**Association** is the ordinary link. The child has its own lifecycle and its own creation path.

**Composition** means the child belongs to the parent's lifecycle and is written through the parent's create surface. A composition foreign key is **non-null**, because an existing child cannot detach from the parent that owns it, and the child must be a kind of row a user can create. A snapshot, a projection, an account, or a session is created by its own lifecycle, so it is always an association.

An actor's profile is a required one-to-one composition. Line items on an order are a required one-to-many composition. A thumbnail on an article is an optional one-to-one composition: the parent may omit it, and any thumbnail row still requires its article.

## One-To-One Is A Table, Not A Cluster Of Nullable Columns

```prisma
// Wrong: the answer's fields live on the question, all nullable.
model support_questions {
  answer_title String?
  answer_body  String?
  agent_id     String?
}

// Right: the answer is its own row, unique on the question.
model support_question_answers {
  id                  String @id
  support_question_id String
  agent_id            String
  title               String
  body                String

  question support_questions @relation(fields: [support_question_id], references: [id], onDelete: Cascade)

  @@unique([support_question_id])
}
```

The nullable cluster cannot express "answered" as a state. Every reader has to decide which combination of three nulls means what, and they decide differently.

## Several Owner Kinds Means Subtypes, Not Nullable Keys

```prisma
// Wrong: one nullable foreign key per possible owner.
model content_reports {
  member_id    String?
  moderator_id String?
}

// Right: the main row, plus one subtype row per owner kind.
model content_reports {
  id         String @id
  actor_type String
  @@index([actor_type])
}

model content_report_of_members {
  id                String @id
  content_report_id String
  member_id         String
  @@unique([content_report_id])
}
```

Every report then references exactly one owner, and no reader has to work out which of several nullable columns is the authoritative one.

**A row that points at several kinds of target takes the same shape**, for the same reasons plus one more. A vote, a report, or a bookmark that can attach to a post or a comment gets a discriminator on the main row and one subtype row per target kind, each carrying a real foreign key.

The extra reason is that a bare `target_id` column with no foreign key behind it is unreachable from the target's side. The database cannot cascade it, cannot keep it referentially honest, and no read can reach it through a relation, so every count and every aggregate over it becomes a separate query. With subtype rows the target has an ordinary relation and those reads are ordinary selections.

When the target is single-type, it is an ordinary foreign key with no discriminator at all.

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

## Shapes To Correct On Sight

Each row is a design that compiles and is wrong. Recognizing them is faster than rediscovering why.

| Wrong shape | Preferred design |
| --- | --- |
| a counter or aggregate column on a base table | compute it in the query, or give it an explicit `mv_*` table |
| a current value derived from history rows and also stored | store the history and calculate the current value |
| a description saying "query output" beside a column that stores it | drop the column and its indexes |
| several nullable actor foreign keys for "one of these owns it" | subtype ownership tables |
| a cluster of nullable fields forming a one-to-one detail | a dependent table with a unique foreign key |
| a unique and a plain index on the same fields | keep the unique one |
| an index that is a subset of a composite index | keep the superset |
| a circular foreign key between two tables | one direction only; the child references the parent, and the selected state lives on the child |
| a domain-named primary key such as `review_id` | `id`; keep the business key as an ordinary field with a unique index |
| a target-only unique on a submitted record such as a vote or a report | include the submitting actor in the unique index |
| a unique foreign key on repeatable history or snapshot rows | a plain indexed foreign key; unique only for a genuine one-to-one |
| a boolean selector inside a unique index, standing in for a partial unique | an ordinary index, with the one-default rule in provider logic |
| a nullable composition foreign key | make the composition non-null, or downgrade it to an association |
| a snake_case or duplicated relation name | camelCase and unique per target: `customerOrders` beside `sellerOrders` |
| JSON or an array stuffed into a string column | key-value child tables, unless the requirements genuinely demand an opaque document |
| a frozen value held as a live foreign key | copy the retained values onto the event or snapshot that owns them |
| a permanent child referencing a hard-deletable master | soft-delete the master, retain a copy, or model an explicit unlink |
| `updated_at` on append-only history | `created_at` only |

The target-only unique is the one worth reading twice. A unique index on a report's target alone means **exactly one actor in the entire system can ever report that target**, and the second person to try is refused for a reason nobody will guess.

## Three Lenses Before Finishing A Model

- **Traceability.** Every requirement fact is stored, referenced, or deliberately left as query output, and every field traces back to a requirement.
- **Ownership.** No field or foreign key duplicates a fact another table owns.
- **Lifecycle.** The temporal fields, the nullability, the deletion decision, the retained copies, the repeatable history, the stance, and the indexes all match the lifecycle the requirements describe.

## After Changing The Schema

Regenerate the client, and regenerate again after a comment change, because the ERD comes from the same run. A schema change is not complete until the models it adds are reachable from a provider, exposed where a requirement asks for them, and covered by a test.
