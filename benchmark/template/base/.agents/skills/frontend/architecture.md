# Architecture

Read [SKILL.md](SKILL.md) first. This document owns layering: where SDK types are allowed to reach and what shape the interface consumes.

## The Layering Decision

There are two defensible shapes, and which one is right depends on whether the application has a server tier of its own.

**A pure single-page application calls the SDK directly** from the route or component that owns the workflow. Keep the call visible at that call site, so the screen shows which operation, which DTO shape, which loading state, and which error path it owns. Do not introduce a wrapper, service module, repository object, or command facade whose only purpose is to hide the generated SDK. That indirection buys nothing and costs every reader a hop.

**An application with its own server tier puts the SDK behind that tier.** Cookie-based sessions, server-side rendering, token refresh, and any secret that must not reach the browser all require a server, and once it exists the SDK belongs there rather than in the client bundle.

Decide once, record the decision, and do not mix the two. A codebase where some screens call the SDK directly and others go through an adapter has two error models, two auth paths, and two places to look.

## When There Is A Server Tier

This is the shape a full-stack application takes, and each layer owns exactly one thing.

```
src/server/<domain>/*     SDK calls, session bootstrap, token refresh,
                          error translation, mapping to view models
src/lib/<domain>/types.ts normalized shapes the interface consumes
src/lib/<domain>/hooks.ts UI-facing queries and mutations over internal routes
src/components/*          rendering, importing no SDK types at all
```

- **The server layer is the only place SDK types appear.** It calls the accessors, translates failures into the application's own error type, and maps payloads into normalized view models.
- **The view models are the contract the interface programs against.** They are named for what a screen needs, not for what a table holds, and one view model may compose several SDK families.
- **Hooks expose queries and mutations over the internal routes**, not over the SDK.
- **Components import view models and nothing else.** A component that imports an SDK type has broken the layering, and the compiler will not tell you.

Role switching stays inside the server layer. Upgrading a customer connection into a seller or administrator scope is an SDK-specific mechanic, and letting it leak into a component spreads authentication logic across the interface.

## Errors Cross The Boundary As One Type

Translate at the boundary rather than letting raw failures propagate.

```ts
export class ApiRouteError extends Error {
  public readonly status: number;
  public constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
```

Every screen then handles one error shape. Without this, each component grows its own guesswork about what a failure looks like, and the guesses disagree.

## Query Keys Are Declared, Not Improvised

Keep the keys in one object beside the hooks so invalidation after a mutation is a lookup rather than a memory test.

```ts
const keys = {
  session: ["shopping", "session"] as const,
  catalog: (search: string) => ["shopping", "catalog", search] as const,
  product: (id: string) => ["shopping", "product", id] as const,
  cart: ["shopping", "cart"] as const,
  orders: ["shopping", "orders"] as const,
  order: (id: string) => ["shopping", "order", id] as const,
};
```

A mutation that changes something invalidates every key that shows it. Stale data after a successful action is the most common frontend defect and the least likely to be reported as one, because the interface looks like it worked.

## The Folder Layout

This is the whole package, and every directory below has one job.

```
packages/frontend/
  index.html
  vite.config.ts             client build
  vite.server.config.ts      server bundle build, when there is a server tier
  playwright.config.ts       browser test configuration
  scripts/
    run-playwright.mjs       one runner, several modes
  src/
    main.tsx                 client entry
    App.tsx                  router and layout shell
    styles.css
    components/
      ui/                    local primitives: button, input, dialog, table
      providers/             app-wide providers, composed in one file
      <domain>/              one folder per product area
    lib/
      utils.ts               generic helpers with no domain meaning
      <domain>/
        types.ts             normalized view models the interface consumes
        hooks.ts             queries and mutations, plus the query keys
        client.ts            the fetch wrapper the hooks call
    server/                  only when there is a server tier
      index.ts               server entry
      api.ts                 internal route table
      http.ts                request and response plumbing
      <domain>/
        config.ts            environment reading
        errors.ts            failure translation
        mappers.ts           SDK payload to view model
        <area>.ts            one file per area: account, cart, catalog, orders
  tests/
    *.spec.ts                browser programs, one per purpose
  wiki/
    architecture.md          this project's stack, layering, routes, choices
    omissions.md             what was deliberately left out and why
    verification.md          what was verified, when, and how
```

**Components split by domain, not by kind.** `components/cart` holds everything the cart renders. Do not create `components/forms` or `components/lists`, because nobody looks for a cart control under "forms" and every domain then reaches into every folder.

Two folders are the exception and are named for their kind rather than a domain:

- `components/ui` holds the local primitives: the button, input, dialog, table, and pagination pieces every domain composes. Nothing in here knows what the product is.
- `components/providers` holds the app-wide providers, composed in one file so the provider order is readable in one place rather than nested across the tree.

**`lib/<domain>` is the interface's own vocabulary.** `types.ts` names shapes for what a screen needs rather than what a table holds. `hooks.ts` exposes the queries and mutations and owns the query keys. `client.ts` is the one place a request is issued.

**`server/<domain>` exists only when there is a server tier**, and it mirrors the domain split. `config.ts` reads the environment, `errors.ts` translates failures, `mappers.ts` turns SDK payloads into view models, and one file per area owns that area's calls.

**Tests live in `tests/` at the package root**, not beside components. Browser programs test flows rather than units, so they belong to the package, not to a folder inside it.

**`wiki/` is the project's own notes**, and the verification topic owns what goes in it.

## Structure Rules

- One route, one page component. The page owns its data loading and passes plain values down.
- Components below a page are presentational and take their data as props. A component that fetches on its own makes the page's loading state unknowable and its errors unhandleable.
- Shared state that outlives a route lives in one provider, composed in `components/providers`, not in a context invented per feature.
- A file that would sit in two domain folders belongs in `lib` or `components/ui`. Duplicating it into both is how two versions drift.

## Scripts

Name them for what they do, and keep the composite ones explicit about what they run.

```json
{
  "dev": "vite --host 0.0.0.0",
  "build": "rimraf dist && pnpm typecheck && vite build",
  "start": "node dist/server/server.mjs",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "lint": "ttsc -p tsconfig.json --noEmit",
  "check": "pnpm run typecheck && pnpm run lint",
  "test:e2e": "node scripts/run-playwright.mjs e2e",
  "ui:review": "node scripts/run-playwright.mjs ui-review",
  "readme:screens": "node scripts/run-playwright.mjs readme",
  "playwright:install": "pnpm exec playwright install chromium"
}
```

One runner script with a mode argument beats several near-identical configurations. `build` runs the type check before bundling, so a broken type fails the build rather than shipping.

## Record The Notable Choices

Keep a short architecture note in the project's own documentation covering the stack, the environment variables, the layering, the routes, and the choices a reader would otherwise have to reverse-engineer.

The entries worth writing are the ones that look wrong without their reason:

- a call the interface deliberately does not make, because the server refuses it for this actor and the refusal is expected;
- a value the interface says is unavailable rather than inventing, because the summary endpoint does not expose it;
- a backend mechanic kept internal rather than surfaced as a control.

Each of those will look like an oversight to the next reader, and each will be "fixed" into a defect unless the note exists.
