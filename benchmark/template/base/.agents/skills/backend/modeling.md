# Modeling

This document owns how tables relate and what a finished model must refuse: relations, composition, subtypes, retained state, ownership, and the review lenses a model passes before it counts as done.

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

## The Schema Admits Exactly The Allowed States

Run this test on every model before moving on, in both directions. It is the one schema question no compiler and no constraint can ask for you.

**Is there a state the requirements allow that this schema cannot hold?** A nullable field the requirements say is always present is harmless; a required field the requirements say may be absent means the valid unset state cannot be written at all, and the provider will invent a placeholder to get past it.

**Is there a state the requirements forbid that this schema still admits?** This is the direction people skip, and it is where the expensive defects live.

- Two rows collide where the design calls them distinct, because the uniqueness the requirement states is not in the schema.
- Two mutually exclusive facts coexist, because each is its own nullable column instead of one state the row can only hold once.
- A quantity the requirements bound is an unbounded `Int`, so the rule lives only in a provider and only where someone remembered it.

For each model, state which allowed states it holds and which forbidden ones it refuses. When you cannot answer the second half concretely, the schema is admitting something nobody decided it should.

## Nothing Exists Because It Seemed Likely

Every table traces to a requirement that asked for it, and a table that exists because a product like this usually has one is a defect that looks like foresight.

The stances make two over-designs easy to name. **A `material` projection nothing reads from** is a maintained cache with no reader. **A `snapshot` table nothing writes to** is a history nobody records. Both compile, both look complete in the ERD, and both are cost with no requirement behind them.

Delete them, and record why in the same pass, so the next reader does not add them back for the same reason you first did.

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

## Four Lenses Before Finishing A Model

- **Traceability.** Every requirement fact is stored, referenced, or deliberately left as query output, and every field traces back to a requirement. Nothing exists because a product like this usually has one.
- **Ownership.** No field or foreign key duplicates a fact another table owns.
- **Lifecycle.** The temporal fields, the nullability, the deletion decision, the retained copies, the repeatable history, the stance, and the indexes all match the lifecycle the requirements describe.
- **Representability.** The schema holds every state the requirements allow and refuses every state they forbid, in both directions, as above.
