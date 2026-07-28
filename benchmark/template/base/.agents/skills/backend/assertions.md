# Assertions

This document owns what a test proves: the minimum each kind of operation owes, what may be asserted, what must never be, and the proof standard a green suite does not supply on its own.

## What Each Kind Of Operation Owes

A scenario proves one distinct observable behavior, and the kind of operation under test fixes the minimum it owes.

| The operation | Owes |
| --- | --- |
| a public read | one success, proved in the response |
| a persisted mutation | one success, plus the effect observed somewhere |
| a list or search | a collection-query proof: the filter selects, the sort orders, the page bounds |
| a create whose body carries a value under a single-column unique constraint | one duplicate rejection, submitting that same value again as the same owner |
| a grade-restricted operation | a positive proof at a sufficient grade, and a negative at an insufficient one where that grade is reachable |

**The duplicate obligation is narrow, and its boundary is the point.** It applies when the caller supplies the value that collides. It does not apply to a value the server generates, to a composite unique index a client cannot steer into a collision, or to login and refresh, which are not creations. Writing a duplicate case for any of those tests the database rather than the requirement.

## A Grade Must Be Reachable Before It Can Be Proved

**Join establishes the default grade and nothing else.** Any higher grade in a test comes from calling the operation that grants it, as that grade's holder, exactly as a user would.

The promoted actor keeps the connection it already had. Grades are loaded per request rather than carried in the token, so a grant takes effect on the next call and re-authenticating after one proves nothing. If a test only passes after a second login, the grade is being read from the wrong place.

That makes the negative case conditional. Write it when an insufficient grade is publicly reachable, using the correct actor at a grade the operation does not accept, with otherwise valid input. Skip it when the actor has no grades, when every declared grade satisfies the gate, or when no insufficient grade can be reached at all.

**When no public operation can establish a sufficient grade, the scenario is currently impossible, and that is the finding.** Record it and repair the API. Do not invent setup, write to the database, or let the caller assign their own authority to get the test running: a test that reaches a grade by a route no user has proves a behavior the product does not offer. [controllers.md](controllers.md) owns the grant and removal routes this depends on.

## Do Not Assert What The Contract Does Not Expose

Token claims are not part of the contract unless a response DTO carries them. Do not decode a token to assert an expiry, a subject, or an address.

Expiry cannot be manufactured without the server's secret, and tampering with an issued token proves only that a bad token is rejected. One such rejection is enough for the suite; there is no separate expired, forged, and malformed case a client can actually steer into distinct outcomes.

**Refresh-token reuse is provable only where the contract exposes revocation or rotation.** When a refresh extends the same session and the previously issued token is self-contained, that older token stays valid by design, so a test asserting it is now rejected asserts a behavior the design does not have. Check what the contract says before writing that case.

An operation that returns nothing needs a public follow-up read to prove its effect. Without one, the test can prove the call succeeded and can prove its rejections, and it cannot claim the state changed.

## Assertions

```ts
typia.assert(response);
```

That validates the whole response: every property, type, format, and constraint. **Never add checks after it.** A pattern test on an identifier or a `typeof` comparison is redundant.

Then assert the business fact, with the title first so a failure names the assertion:

```ts
TestValidator.equals("unit belongs to the sale", unit.saleId, sale.id);
TestValidator.predicate("the sale lists the unit", detail.units.some((u) => u.id === unit.id));
```

**Every test needs at least one business assertion.** A test that calls an operation and validates the response type proves the framework works.

## Rejections

Assert that the call was refused. Do not assert which status refused it.

```ts
await TestValidator.error("another seller cannot edit this sale", async () => {
  await api.functional.shopping.seller.section.sale.update(
    otherSellerConnection,
    { sectionId: section.id, id: sale.id, body },
  );
});
```

Whether a refusal arrives as 401, 403, 404, or 409 depends on which check the provider reaches first, and a provider that verifies existence before authority returns a not-found where you expected a forbidden. Both are correct, so pinning the code turns a legitimate reordering into a red suite. **The status is the server's choice and is not part of the contract.**

Two spellings are the reflex, and neither belongs in this suite:

```ts
// Both forbidden: the code is not what the test is about.
await TestValidator.httpError("not found", 404, async () => { ... });
TestValidator.equals("status", error.status, 403);
```

`TestValidator.error` is the only rejection assertion here. It says the call was refused, which is the requirement, and says nothing about how, which is not.

Await both layers: the assertion and the call inside it. A synchronous callback takes no `await` on the outer call; an async one takes it on both.

## Never Test Type Errors

A deliberately wrong type is a compile error, not a test. The boundary already validates types, formats, and lengths.

Positive paths stay clean: valid bodies, a qualified caller, no manufactured failure. The one sanctioned exception is an authority negative, where the inputs remain valid and only the caller's grade is insufficient.

## What A Test Must Prove

- **The requirement, not the mechanism.** If a rule says two coupons of the same kind cannot stack, stack them and assert the refusal.
- **A negative twin for every positive.** Where a rule permits something, pin the adjacent case one property away where it must be refused.
- **The boundaries.** Empty list, single element, expired window, the threshold on both sides, first page and last.
- **Authorization explicitly.** A route that leaks another actor's data returns 200 and looks correct in every test written as the owner.
- **The state after the effect.** An operation whose requirement says it also closes something is not proven by a 200.
- **History.** Where the schema keeps snapshots, create, reference, mutate the source, then read the reference and assert it still shows what it showed before.
- **Recovery, end to end.** Where a delete has a restore, delete and then restore, and assert the row came back with its content and its owner intact. A delete test alone passes against an implementation that empties the row on the way out, and the loss surfaces only when someone restores.

## Prove Through The Public Surface

Use public operations for setup and assertions. Do not read the database as a fallback.

When neither the response nor any reachable follow-up read exposes the effect a requirement names, that is a finding about the API. An effect nobody can observe through the product is an effect the product does not deliver.
