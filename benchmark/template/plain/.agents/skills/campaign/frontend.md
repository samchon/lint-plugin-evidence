# Frontend Campaign Dimension

Read [SKILL.md](SKILL.md) first. This mandatory dimension of the indivisible campaign round discharges `docs/analysis/ -> frontend`, `API -> frontend`, and the frontend's internal graph.

## Requirements To Screens

For every requirement describing something a user does or sees, name the screen under `packages/frontend/src/components/<domain>/` that delivers it.

A requirement is not realized because an endpoint exists. It is realized when a user can reach the behavior. An operation nothing calls is a requirement built but never delivered.

Walk each journey as the actor performing it: what appears before the action, while it is in flight, when it succeeds, and when it is refused. A screen that renders data but offers no path to the required action does not satisfy the requirement.

Then walk backward. Every screen names the requirement it serves. A screen with no requirement indicates either a missed requirement or an invented feature.

## Contract To Screens

For every SDK operation, name the screen that consumes it or record why none does.

Not every operation becomes a visible feature, but the decision must be recorded. Then walk backward from every data call to the generated accessor it uses. A hand-assembled request survives a contract change that should have broken it and is therefore a finding.

## The Frontend's Own Graph

Once folders take shape, the frontend grows internal obligations:

```
requirement     ->  screen
component       ->  screen
SDK operation   ->  screen
journey         ->  browser spec
screen          ->  browser spec
```

The artifact on the right owes an account of every applicable unit on the left.

- **Every component traces to a screen that uses it.** A component nothing renders is dead code that still costs review attention.
- **Every screen traces to the operations it consumes**, and every rendered field traces to a response property.
- **Every data call uses a generated accessor.** A handwritten wrapper between the screen and SDK can survive a contract change it should expose.

Record new internal relationships in the campaign ledger as soon as the frontend structure introduces them, and include them in every subsequent complete round. Do not edit the frozen campaign skill.

## Every State Is A Requirement

A screen is not only its success state.

For every screen, traverse loading, empty, error, retry, and post-mutation invalidation. Then traverse refusals: every contract rejection has a visible outcome a user can act on. A control, filter, pagination action, form, toggle, dialog, or retry path must cause the observable change its interface promises.

## Journeys To Specs, Both Directions

For every journey the documents give an actor, name the specification under `packages/frontend/tests/journeys/` that walks it. For every specification, name the journey. [verification.md](../frontend/verification.md) owns their implementation shape.

The third direction is screens. For every page component under `packages/frontend/src/components/<domain>/`, excluding the development gallery, name the specification that traverses it. Enumerate pages from the current files rather than memory.

A journey without a specification has never been performed as one actor. A specification without a journey is invented. A screen no specification traverses is a delivery no one has performed.

## Verify By Running It

The compiler cannot tell you that a control does nothing.

Run every flow at mobile, tablet, and desktop widths. Confirm every control causes an observable change and every state is reachable. SDK simulation can prove contract shape and client flow; integration against the live backend separately proves server behavior.

## Findings

Requirements findings and contract changes re-open this dimension in full. A logic change re-opens it when the response shape or refusal meaning changes.

A missing operation discovered while building a screen belongs to the API dimension, not a frontend-only workaround. Correct it upstream and accept that every downstream relationship re-opens.

Within the indivisible round owned by [SKILL.md](SKILL.md), this dimension is exhausted when every user-facing requirement has a screen or recorded omission, every operation has a consumer or recorded reason, every internal edge is accounted for, every screen handles every state, and every journey has been run rather than merely compiled.
