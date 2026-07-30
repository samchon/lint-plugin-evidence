# Verification

This document owns what proves the frontend works.

## Compiling Is Not Working

The compiler cannot tell you that a button does nothing, that a filter returns the same rows for every value, that a form submits and the list never refreshes, or that a dialog opens over content the user still needs.

Every one of those ships from a green build. Browser verification is the only thing that finds them, and it is part of done-ness rather than a step after it.

## Where The Programs Live

All browser programs live in `tests/` at the package root, one spec file per purpose, under one Playwright configuration.

```
packages/frontend/
  playwright.config.ts
  tests/
    journeys/            one spec per requirement journey
    ui-review.spec.ts    layout and interaction review across viewports
    readme.spec.ts       screenshots for the documentation
```

```json
"test:e2e": "pnpm build && playwright test tests/journeys",
"ui:review": "pnpm build && playwright test tests/ui-review.spec.ts",
"readme:screens": "pnpm build && playwright test tests/readme.spec.ts",
"playwright:install": "playwright install chromium"
```

The runner serves the production build on a fixed local port and points the browser at it, so every closing mode tests what actually ships rather than the development server. Drive interim per-screen and gallery passes through the dev server, then require a production build, a repository-wide search proving that no implementation-pending sentence or unfinished stub remains, and the closing browser modes after the last screen is cracked. Take the port from the environment with a validated default, and fail loudly on a bad value rather than silently binding somewhere else.

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

The exported journey is lexically outside Playwright's registered `test()` callback, so `playwright/no-standalone-expect` rejects `expect()` inside it. Keep the complete interaction in the exported function and use web-first locator waits or explicit throwing checks for the conditions it owns; keep Playwright `expect()` assertions inside the wrapping `test()` callback. Do not remove a check to satisfy the rule—the helper and wrapper together must still fail when the named behavior disappears.

Run the same specs under `journeys/` twice: invoke `pnpm test:e2e` with `VITE_API_SIMULATE=true` during development, then invoke it again with `VITE_API_SIMULATE=false` against the prepared, separately running backend to close.

## Two Meanings, Recorded Apart

**The simulation program** runs against the SDK's simulation mode with no server. It proves that accessors bundle, that typed success responses render, and that navigation works. It is isolated from backend uptime, but generated response values are random; assertions must target contract-stable behavior, while screenshots and named edge states use the fixture gallery.

**The live program** runs with simulation off, against the real host, with a prepared backend and real authentication. It is the only thing that proves persistence, sessions, authorization, refresh, and side effects.

Never record a run as live while `VITE_API_SIMULATE` is `true`. The environment and verification record are what a later reader trusts, and a run that quietly simulates while claiming integration is worse than having no live result.

Development happens against the simulation program and closes with the live one. Neither replaces the other.

## The State Gallery

Simulation returns valid random data, so the states that matter most never appear on demand: the empty list, the rejection, the longest name, the zero price. Waiting to meet them in the wild means shipping them unseen.

Build one dev-only route gated by Vite's `import.meta.env.DEV` signal and absent from production navigation. It renders each screen's presentational components against fixture view models, one row per state a screen owes. Visit it through the interactive browser while developing each screen, at all three widths.

The production `ui:review` program cannot reach a DEV-only route. It reviews the real shipping screens at the same widths after the production build; the gallery supplies deterministic state inspection during development, while `ui:review` verifies the built presentation.

When a defect arrives from the wild, its fixture joins the gallery, so the state that escaped once cannot escape silently again.

## Keep The Frontend Program Frontend-Only

The frontend program does not boot the backend, assert backend health, seed its database, or inspect server state. Live mode consumes a separately prepared and running backend; backend setup and health remain external prerequisites, not frontend assertions.

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
- Ran against the production build served locally in simulation mode

## Automated Checks

- `pnpm lint`
- `pnpm test:e2e` with `VITE_API_SIMULATE=true`
- `pnpm test:e2e` with `VITE_API_SIMULATE=false`
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

## Preserve Failure Diagnostics, Not As Completion Proof

Keep traces and screenshots from failing runs while you diagnose them. They are diagnostics, not product proof, and they do not belong in the repository as proof that something works.

## Frontend Verification Gate

The application starts. Every requirement-backed user journey works when a person performs it. The interface is coherent at every required width. The simulation program passes and the live program has been run against a real backend. Deliberate omissions are recorded with reasons. `wiki/verification.md` reflects what was actually run, including what could not be.

Passing a type check, a production build, or a seeded smoke test proves that the application mounts. It does not prove the product exists.
