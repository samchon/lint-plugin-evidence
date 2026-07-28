# Verification

Read [SKILL.md](SKILL.md) first. This document owns what proves the frontend works.

## Compiling Is Not Working

The compiler cannot tell you that a button does nothing, that a filter returns the same rows for every value, that a form submits and the list never refreshes, or that a dialog opens over content the user still needs.

Every one of those ships from a green build. Browser verification is the only thing that finds them, and it is part of done-ness rather than a step after it.

## Two Programs, Two Meanings

Keep them separate and name them for what they prove.

**The simulation program** runs against the SDK's simulation mode with no server. It proves that accessors bundle, that typed responses render, that navigation works, and that screen states appear. It is deterministic, so it is what browser tests and screenshots run against without depending on backend uptime or random data.

**The live program** runs with simulation off, against the real host, with a prepared backend and real authentication. It is the only thing that proves persistence, sessions, authorization, refresh, and side effects.

Never point the live program at the simulated path. The name is what a later reader trusts, and a live-named program that quietly simulates is worse than having no live program at all.

Development happens against the simulation program and closes with the live one. Neither replaces the other.

## Keep The Frontend Program Frontend-Only

The frontend test program does not boot the backend, assert backend health, or check server state. Those belong to the live integration program, and mixing them makes a frontend failure indistinguishable from an environment failure.

## Run The Flows Yourself

Automation is not a substitute for using the product.

Each round, drive the main journeys in a browser and confirm:

- every control causes an observable change;
- search, sort, pagination, page size, toggles, dialogs, and forms actually work wherever they appear;
- the layout holds at mobile, tablet, and desktop widths;
- the copy says what it means.

Install browser automation rather than falling back to screenshots or raw API checks. Fall back only when automation genuinely is not available, and say so in the record.

## The Record

Verification that leaves no record cannot be trusted later, because a reader cannot tell whether a gap was checked and clean or never checked.

Keep a verification document in the project's notes with:

- the date it was verified and what was running;
- the automated checks that were run, by command name;
- the flows that were exercised, per viewport, in the order they were performed;
- what could not be verified and why.

Write the flows concretely enough to be repeated. "Verified the checkout flow" is not a record; the list of steps someone actually performed is.

```markdown
## Browser Flows

- Desktop 1440x900
  - opened the catalog
  - verified membership signup from the auto-created guest session
  - searched for a product and opened its detail
  - added it to the cart and created an order draft
  - completed identity verification, filled a shipping address, published
  - confirmed the order appeared as paid on the orders page
- Tablet 834x1112
  - verified catalog layout and category filtering
```

Update the record when the flows change. A verification document dated before the last three features is a record of a product that no longer exists.

## Preserve Failure Diagnostics, Not As Evidence

Keep traces and screenshots from failing runs while you diagnose them. They are diagnostics, not product evidence, and they do not belong in the repository as proof that something works.

## What Done Requires

The application starts. The core flows work when a person performs them. The interface is coherent at every width. The simulation program passes and the live program has been run against a real backend. Deliberate omissions are recorded with reasons. The verification document reflects what was actually run, including what could not be.

Passing a type check, a production build, or a seeded smoke test proves that the application mounts. It does not prove the product exists.
