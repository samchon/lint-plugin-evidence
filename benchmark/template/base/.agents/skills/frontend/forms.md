# Forms

This document owns everything between a user typing and a row existing: validation, submission, failure, and what the screen does with each.

## The DTO Is The Schema

**Never write a second validation schema.** The request DTO already declares every rule: `tags.Format<"email">`, `tags.MinLength<8>`, `tags.Type<"uint32">`, the nullability, the required set. Restating those in a form library's schema produces two definitions of one contract, and the copy drifts the moment either side changes.

Validate against the DTO itself:

```ts
const result: IValidation<IShoppingMember.IJoin> =
  typia.validate<IShoppingMember.IJoin>(input);
if (result.success === false) setDiagnoses(toDiagnoses(result.errors));
```

That is the whole client-side rule set, derived from the type a moment before the call, and it cannot disagree with what the server enforces because it is the same declaration.

A rule the DTO cannot express, such as "these two fields must match" or "this date must be after that one", is a business rule. It belongs in `packages/api/src/diagnosers` so the server applies the identical function, not in the form.

## A Failure Names Its Field, From Either Side

`typia` reports a path and the API reports an accessor, and they line up on purpose.

```ts
const toDiagnoses = (errors: IValidation.IError[]): IDiagnosis[] =>
  errors.map((error) => ({
    accessor: error.path.replace(/^\$input\./, ""),
    message: `Expected ${error.expected}.`,
  }));
```

The server's rejections arrive as `IDiagnosis[]` already. So one renderer handles both, and a field looks up its own message by accessor rather than the form guessing which failure belongs to it.

```tsx
<Input aria-invalid={fieldError("email") !== undefined} {...} />
{fieldError("email") && <FieldMessage>{fieldError("email")}</FieldMessage>}
```

**Never show a validation failure only as a banner.** A form with six fields and a message at the top makes the user hunt. The accessor exists so that the message lands where the value is, and a diagnosis whose accessor is `"unknown"` is the only one that belongs at the top.

## Submission Is A State, Not An Event

A submit handler has four outcomes and the screen owes something for each.

| Outcome | What the screen does |
| --- | --- |
| submitting | disables submit, keeps every field readable, shows that work is happening |
| client-side invalid | renders per-field messages, focuses the first failing field, calls nothing |
| server rejection | renders per-field messages from the response, **keeps everything the user typed** |
| success | invalidates every query the write changed, then navigates or closes |

**The rejection row is the one that gets skipped.** A form that clears itself on failure makes the user retype work the server already saw, and the second attempt usually fails the same way because they retyped the same thing.

**Disable on submit, and mean it.** Without that, a double-click is two orders. The mutation being in flight is the condition, not a flag you maintain beside it.

## After A Write, Invalidate Everything It Changed

A successful mutation leaves the cache describing the world before it. [architecture.md](architecture.md) owns the query keys and the invalidation pattern; the part that belongs to a form is deciding the full set.

Ask what a reader would now see differently: the list the row joins, the detail of its parent, the counter in the header, the actor's own summary. Invalidating only the obvious one leaves a screen that says the write did not happen.

## What A Form Must Not Do

**Do not send a field the DTO does not declare.** It is dropped at the boundary, and the user's intent goes with it.

**Do not fabricate a value to satisfy a required field.** An empty string for an absent optional is a value, and the server stores it. Omit the property instead, which is what `?: null | T` exists to allow.

**Do not disable a control to express a rule the server owns.** Hiding an unavailable action is good usability, and it is not enforcement; the denial path stays reachable because a session can go stale between render and click. [screens.md](screens.md) owns that distinction.

**Do not re-check formats the boundary already checks.** After `typia.validate` passes, the value satisfies every tag the DTO declares, and a regex beside it is a second rule that will drift.
