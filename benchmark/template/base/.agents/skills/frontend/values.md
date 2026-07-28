# Values

This document owns the gap between what the contract carries and what a person reads. The shared formatters live in `src/lib/utils.ts`.

Every value crosses the wire in a form chosen for machines: an instant as an ISO string, money as a number beside a currency code, an enum as a lowercase literal. None of those is what goes on the screen, and the conversion is where a product quietly lies about its own data.

## Money Keeps Its Scale

**A monetary amount is a number and its currency, and they are rendered together.** The DTO exposes the code as its own property because the amount alone cannot be formatted, and picking a symbol from the user's locale shows dollars for a row posted in won.

**Format at the scale the DTO's description states.** [dtos.md](../backend/dtos.md) requires that description precisely because exactness stops at the contract boundary: storage and the provider keep it, the wire carries a number, and the screen has to know how many places are meaningful. Rounding to two by habit turns a three-place tax rate into a wrong number that looks tidy.

**Never do arithmetic the server already did.** A total, a subtotal, a tax, and a discount are computed where the rule lives. A screen that adds line items to show a total will disagree with the server the first time a rule the interface does not know about applies, and the user believes the screen.

Summing for display where no server total exists is a finding against the contract, not a licence to compute one.

## An Instant Is Not A Date

The wire carries an ISO 8601 string. What to render depends on what the value means, and the schema comment said which.

| The value means | Render as |
| --- | --- |
| an instant something happened | date and time, in the reader's zone |
| a calendar date the business fixed | the date part only, never shifted into a local zone |
| a deadline or a window boundary | date and time, plus what it is relative to now |

**A stored calendar date crosses as a date-time at UTC midnight**, and rendering it in a local zone moves it a day for half the world. Take the date part as it is; do not construct a local date object from it first.

Never show a raw ISO string to a user. It is a transport format, and it reads as a leak.

## Absence Is Information

A nullable property is nullable because the requirement said the value can be absent, and the requirement usually said what the absence means.

```
openedAt: null    →  "Not opened yet"
closedAt: null    →  "Runs indefinitely"
deletedAt: null   →  nothing at all; the row is simply live
```

**Rendering a dash for all three throws that away.** So does inventing a value: a summary that omits a timestamp is not a reason to display the creation time in its place, and [screens.md](screens.md) covers saying a value is unavailable rather than fabricating one.

## Enums Are Rendered, Not Displayed

A status arrives as the literal the contract declares. `"partially_refunded"` is a correct value and unacceptable copy.

Map every literal to a phrase, in one place per union, and make the map exhaustive so a new member of the union is a compile error rather than a raw identifier appearing on screen.

The phrase comes from the requirements, which is where the state was named for a person in the first place. Inventing a friendlier word than the documents use makes the interface disagree with the support article about the same state.

## Formatting Lives In One Place

`lib/utils.ts` holds the formatters and every screen calls them. Two components formatting a date inline will differ, and the difference reads as a bug in the data rather than in the code.

A formatter does not fetch, does not read a global, and does not decide whether the value should be shown at all: that is the screen's decision, and mixing the two is how a formatter grows a special case for one caller.
