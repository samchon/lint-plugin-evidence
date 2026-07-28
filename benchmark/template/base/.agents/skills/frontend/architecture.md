# Architecture

Read [SKILL.md](SKILL.md) first. This document owns layering and where things live.

## There Is No Frontend Server

The frontend is a single-page application. It builds to static assets and talks to the backend through the generated SDK. That is the whole architecture.

Do not add a server tier, an API route layer, a backend-for-frontend, or a server-rendering framework. `packages/backend` is the server. A second one inside the frontend duplicates authentication, duplicates error handling, and puts business decisions in a place the backend's tests never reach.

## Call The SDK From The Screen That Owns The Workflow

```ts
import Api, { IShoppingSale, IPage } from "{{apiPackageName}}";

const page: IPage<IShoppingSale.ISummary> =
  await Api.functional.shoppings.customers.sales.index(connection, {
    limit: 20,
  });
```

Keep the call visible at the call site, so the screen shows which operation, which DTO, which loading state, and which error path it owns.

Do not introduce a wrapper, service module, repository object, or command facade whose only purpose is to hide the generated SDK. That indirection buys nothing: the SDK is already typed, already named after the routes, and already regenerated when the contract changes. Hiding it behind a hand-written layer means the hand-written layer is what breaks instead, and it breaks silently.

Mapping a response into the shape a screen wants is fine when the same mapping is used more than once inside that screen. Keep it local to the screen, not in a shared layer that grows into a second contract.

## The Folder Layout

```
packages/frontend/
  index.html
  vite.config.ts
  playwright.config.ts
  scripts/
    run-playwright.mjs       one runner, several modes
  src/
    main.tsx                 entry
    App.tsx                  router and layout shell
    styles.css
    config.ts                environment reading, one place
    api.ts                   the shared connection
    pages/
      <route>.tsx            one file per route
    components/
      ui/                    local primitives: button, input, dialog, table
      providers/             app-wide providers, composed in one file
      <domain>/              one folder per product area
    hooks/
      <domain>.ts            queries and mutations, plus the query keys
    lib/
      utils.ts               generic helpers with no domain meaning
  tests/
    *.spec.ts                browser programs, one per purpose
  wiki/
    architecture.md          this project's stack, routes, choices
    omissions.md             what was deliberately left out and why
    verification.md          what was verified, when, and how
```

**Components split by domain, not by kind.** `components/cart` holds everything the cart renders. Do not create `components/forms` or `components/lists`: nobody looks for a cart control under "forms", and every domain then reaches into every folder.

Two folders are the exception and are named for their kind:

- `components/ui` holds the local primitives that every domain composes. Nothing in here knows what the product is.
- `components/providers` holds the app-wide providers, composed in one file so the provider order is readable in one place.

**`pages/` is one file per route.** The page owns its data loading and passes plain values down.

**`hooks/<domain>.ts` owns the queries, the mutations, and the query keys** for that area. This is where the SDK call lives when more than one screen needs it; a screen that is the only caller keeps the call.

**`config.ts` reads the environment once.** The API host and the simulation flag come from there and nowhere else.

**Tests live in `tests/` at the package root**, not beside components. Browser programs test flows rather than units, so they belong to the package.

**A file that would sit in two domain folders belongs in `lib` or `components/ui`.** Duplicating it into both is how two versions drift.

## Query Keys Are Declared, Not Improvised

Keep the keys beside the hooks so invalidation after a mutation is a lookup rather than a memory test.

```ts
const keys = {
  session: ["session"] as const,
  catalog: (search: string) => ["catalog", search] as const,
  product: (id: string) => ["product", id] as const,
  cart: ["cart"] as const,
  orders: ["orders"] as const,
  order: (id: string) => ["order", id] as const,
};
```

A mutation that changes something invalidates every key that shows it. Stale data after a successful action is the most common frontend defect and the least likely to be reported as one, because the interface looks like it worked.

## Errors

The SDK throws a typed HTTP error. Handle it where the call is, and render what the failure means to the user.

Do not build an error translation layer. The contract already states which rejections an operation has, and the business rules already say what each one means to a user; a generic translator loses exactly that specificity.

## Structure Rules

- One route, one page component.
- Components below a page are presentational and take their data as props. A component that fetches on its own makes the page's loading state unknowable and its errors unhandleable.
- Shared state that outlives a route lives in one provider, composed in `components/providers`, not in a context invented per feature.

## Scripts

```json
{
  "dev": "vite --host 0.0.0.0",
  "build": "rimraf dist && pnpm typecheck && vite build",
  "preview": "vite preview",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "lint": "ttsc -p tsconfig.json --noEmit",
  "check": "pnpm run typecheck && pnpm run lint",
  "test:e2e": "node scripts/run-playwright.mjs e2e",
  "ui:review": "node scripts/run-playwright.mjs ui-review",
  "readme:screens": "node scripts/run-playwright.mjs readme",
  "playwright:install": "pnpm exec playwright install chromium"
}
```

One runner with a mode argument beats several near-identical configurations. `build` type-checks before bundling, so a broken type fails the build rather than shipping.

## Record The Notable Choices

Keep `wiki/architecture.md` covering the stack, the environment variables, the routes, and the choices a reader would otherwise reverse-engineer.

The entries worth writing are the ones that look wrong without their reason:

- a call the interface deliberately does not make, because the server refuses it for this actor and the refusal is expected;
- a value the interface says is unavailable rather than inventing, because the endpoint does not expose it;
- a backend mechanic kept internal rather than surfaced as a control.

Each will look like an oversight to the next reader, and each will be "fixed" into a defect unless the note exists.
