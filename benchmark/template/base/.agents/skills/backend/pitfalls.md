# Pitfalls

This document owns the provider's boundary mechanics: what never gets re-checked, how a refusal leaves, the conversions at the client's edge, the client's traps, and the defects no checker sees.

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
