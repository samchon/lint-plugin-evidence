# TypeScript And Typia

This document owns the type errors you will actually meet, because the same dozen recur and each has one correct fix.

The rule underneath all of them: **fix the artifact, do not silence the compiler.** No `any`, no `as unknown as`, no suppression comment. Each of those converts a compile error into a runtime defect, and the runtime defect surfaces somewhere unrelated.

## The Catalog

| Error | Cause | Fix |
| --- | --- | --- |
| tag-to-tag incompatibility on a `typia.tag` property | two tag intersections do not overlap | `value satisfies Base as Base`; nullable: `value satisfies T \| null as T \| null` |
| `Date` is not assignable to `string & Format<"date-time">` | the database client returns `Date` | `.toISOString()`; nullable target: `date?.toISOString() ?? null` |
| `Format<"uuid">` has no properties in common | the `tags.` prefix is missing | `string & tags.Format<"uuid">`, never a bare `Format<...>` |
| `X \| undefined` not assignable after a truthy check | `typia.assert(v)` does not narrow the original binding | assign it, or narrow in place with `typia.assertGuard(v!)` |
| `string` not assignable to a literal union | a widened string reaching a narrowed field | `typia.assert<"a" \| "b">(value)`, or index the consuming type |
| two types "have no overlap", or a property on `never` | an earlier guard already narrowed it | delete the redundant check |
| object possibly undefined on index access | unchecked indexed access | guard it, or inline the fallback |
| `.map` on a possibly-undefined array | the optional chain stops at the array | `(items ?? []).map(...)` when empty means none |
| cannot redeclare a block-scoped variable in a `switch` | every `case` shares one block scope | wrap each case body in its own braces |
| the error persists after a `!== undefined` check | the type has three states | check both, or use `!= null` |
| literal-to-literal mismatch between two domains | two different vocabularies | an exhaustive `Record<From, To>`, never a cast |
| `boolean \| undefined` used as a condition | optional chaining before a predicate | compare `=== true`, or coalesce `?? false` |
| decimal not assignable to number | a decimal column | `Number(value)` |
| a ternary sort direction widens to `string` | literal widening across branches | `"asc" as const` |

## `satisfies X as X`, Not A Cast

When two tag intersections conflict but the underlying value is genuinely fine, strip the tags without lying about the runtime shape.

```ts
const page: number & tags.Type<"int32"> = getValue();
const usable = page satisfies number as number;
```

`satisfies` proves the value really is that base type before the assertion removes the refinement, so the pair cannot claim something false. A bare `as` can. Prefer this over `typia.assert`, which adds a runtime check you do not need when the value already came from a validated source.

## The Three States Mean Three Things

`T | null | undefined` is not one nullish case. In a request body the convention is:

- `undefined` means **do not change this**;
- `null` means **clear it**;
- a value means **set it**.

So `!== undefined` does not eliminate `null`, and a check that treats them alike implements a different feature than the contract describes. Use `!= null` when both are the ignore case, and branch explicitly when they are not.

The direction of a conversion follows the consuming signature, never habit. An optional property takes `value ?? undefined`. A nullable property keeps `value ?? null`. Read the interface before choosing.

## A Wrong Default Is Worse Than A Compile Error

This is the most dangerous item here, because it type-checks and inverts behavior.

```ts
// WRONG: this means "already expired"
expiredAt: (row.expired_at ?? new Date()).toISOString(),

// RIGHT, when null means "no expiration"
expiredAt: (row.expired_at ?? new Date("9999-12-31T23:59:59.999Z")).toISOString(),
```

A default must encode what null means **for that field**, and the schema comment is where that meaning was written down. Go read it rather than reaching for whatever satisfies the type.

A field that needs a default in order to compile is often a field whose DTO should have been nullable. Check that before inventing a value: a nullable source into a required target is usually a contract mistake, not a conversion problem.

## `assert` Returns, `assertGuard` Narrows

```ts
const item: IItem | undefined = items.find((i) => i.id === id);

const safe = typia.assert(item!);   // use the return value
typia.assertGuard(item!);           // returns void, narrows `item` itself
```

Picking the wrong one produces an error that looks like the check did not happen, because it did not narrow anything.

## `never` Means You Already Checked

```ts
if (record.deleted_at !== null) throw ErrorUtil.forbidden("Deleted.");
// from here down, deleted_at is null on every path
```

A later branch testing it again is unreachable, and the compiler says `never`. The fix is to delete the second check, not to cast around it. A `never` error is the compiler reporting that your code disagrees with itself.

## Deletion Is Also A Fix

Some diagnostics are repaired by removing code.

**Runtime type and format validation on validated parameters.** The boundary already proved every type, format, and length the DTO declares. A `typeof` check, a trimmed-length check, or a format regex on such a parameter is dead code that will drift from the contract.

**A standalone object or array literal.** `({ where: { id } });` binds nothing and does nothing, and the compiler does not flag it. If a filter or a data object seems to have no effect, look for one of these first.

## When It Keeps Coming Back

If the same diagnostic signature recurs across a file, stop patching lines and re-derive the function from its contract. A repeated error usually means one wrong assumption expressed a dozen times, and fixing it once at the source resolves the whole class.
