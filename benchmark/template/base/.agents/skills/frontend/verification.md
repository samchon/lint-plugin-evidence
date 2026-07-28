# Verification

This document owns what proves the frontend works.

## Compiling Is Not Working

The compiler cannot tell you that a button does nothing, that a filter returns the same rows for every value, that a form submits and the list never refreshes, or that a dialog opens over content the user still needs.

Every one of those ships from a green build. Browser verification is the only thing that finds them, and it is part of done-ness rather than a step after it.

## Where The Programs Live

All browser programs live in `tests/` at the package root, one spec file per purpose, driven by one runner with a mode argument.

```
packages/frontend/
  playwright.config.ts
  scripts/run-playwright.mjs
  tests/
    journeys/            one spec per requirement journey
    ui-review.spec.ts    layout and interaction review across viewports
    readme.spec.ts       screenshots for the documentation
```

```json
"test:e2e": "node scripts/run-playwright.mjs e2e",
"ui:review": "node scripts/run-playwright.mjs ui-review",
"readme:screens": "node scripts/run-playwright.mjs readme",
"playwright:install": "pnpm exec playwright install chromium"
```

The runner serves the production build on a fixed local port and points the browser at it, so every closing mode tests what actually ships rather than the development server. Drive interim per-screen and gallery passes through the dev server, then require a production build, a repository-wide zero-`@todo` search, and the closing browser modes after the last screen is cracked. The `@todo` tags are a common textual ledger in both benchmark arms, not an arm-specific lint diagnostic. Take the port from the environment with a validated default, and fail loudly on a bad value rather than silently binding somewhere else.

Install the browser before the first run. In Linux CI the install needs its system dependencies explicitly, run from the frontend package directory.

## A Journey Is An Exported Function

Each spec under `tests/journeys/` exports one async function named `journey_<actor>_<flow>`, and one `test()` call wraps it.

```ts
export async function journey_customer_checkout(page: Page): Promise<void> {
  // walk the flow the requirement describes, end to end
}
test("customer checkout", ({ page }) => journey_customer_checkout(page));
```

The export is the point. A journey that exists only inside a `test()` callback cannot be named, counted, or pointed at, and the walk from the requirement documents to the specs needs something to land on. **Every journey the documents give an actor has a spec, and every spec names the journey it walks**: both directions, with the same discipline the backend suite gets.

The e2e mode runs everything under `journeys/`, first against simulation during development, then against the live backend to close.

## Two Meanings, Named Apart

**The simulation program** runs against the SDK's simulation mode with no server. It proves that accessors bundle, that typed responses render, that navigation works, and that screen states appear. It is deterministic, which is why browser tests and screenshots run against it without depending on backend uptime or random data.

**The live program** runs with simulation off, against the real host, with a prepared backend and real authentication. It is the only thing that proves persistence, sessions, authorization, refresh, and side effects.

Never point the live program at the simulated path. The name is what a later reader trusts, and a live-named program that quietly simulates is worse than having no live program.

Development happens against the simulation program and closes with the live one. Neither replaces the other.

## The State Gallery

Simulation returns valid random data, so the states that matter most never appear on demand: the empty list, the rejection, the longest name, the zero price. Waiting to meet them in the wild means shipping them unseen.

Build one dev-only route, gated by the environment flag and absent from production navigation, that renders each screen's presentational components against fixture view models: one row per state a screen owes. The ui-review program walks it at the three widths, which turns "every screen handles every state" from a claim into something a browser run visits.

When a defect arrives from the wild, its fixture joins the gallery, so the state that escaped once cannot escape silently again.

## Keep The Frontend Program Frontend-Only

The frontend test program does not boot the backend, assert backend health, or check server state. Those belong to the live integration program.

Mixing them makes a frontend failure indistinguishable from an environment failure, and a suite that goes red because a database was not seeded teaches everyone to ignore it.

## Drive The Browser Yourself

Automation covers what you told it to cover. It cannot notice that a layout is unusable or that a label says the wrong thing.

Each round, drive the main journeys interactively and confirm:

- every control causes an observable change;
- search, sort, pagination, page size, toggles, dialogs, and forms actually work wherever they appear;
- the layout holds at mobile, tablet, and desktop widths;
- the copy says what it means.

Use a browser automation tool you can steer step by step rather than a fixed script for this pass. When a browser MCP server is available, drive it through that: navigate, click, fill, resize the viewport, and read the rendered page back. The value is being able to look at the next thing based on what the last thing showed, which a pre-written spec cannot do.

Turn whatever that pass finds into a spec in `tests/` so it stays covered. The interactive pass finds the defect; the spec keeps it found.

Fall back to screenshots or raw API checks only when no automation is available at all, and say so in the record.

## The Record

Verification that leaves no record cannot be trusted later, because a reader cannot tell whether a gap was checked and clean or never checked.

Keep `packages/frontend/wiki/verification.md` with the date, what was running, the automated checks by command name, the flows exercised per viewport in the order performed, and what could not be verified and why.

```markdown
## Date

- Verified on April 14, 2026
- Ran against the production build served locally in deterministic simulation mode

## Automated Checks

- `pnpm lint`
- `pnpm test:e2e`
- `pnpm ui:review`

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

Write the flows concretely enough to repeat. "Verified the checkout flow" is not a record; the list of steps someone actually performed is.

Update the record when the flows change. A verification document dated before the last three features is a record of a product that no longer exists.

## Preserve Failure Diagnostics, Not As Evidence

Keep traces and screenshots from failing runs while you diagnose them. They are diagnostics, not product evidence, and they do not belong in the repository as proof that something works.

## Frontend Verification Gate

The application starts. Every requirement-backed user journey works when a person performs it. The interface is coherent at every required width. The simulation program passes and the live program has been run against a real backend. Deliberate omissions are recorded with reasons. `wiki/verification.md` reflects what was actually run, including what could not be. This closes the frontend layer only; the active completeness skill owns project completion.

Passing a type check, a production build, or a seeded smoke test proves that the application mounts. It does not prove the product exists.
