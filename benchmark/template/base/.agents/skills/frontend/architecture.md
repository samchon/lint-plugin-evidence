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

## Structure

- One route, one page component. The page owns its data loading and passes plain values down.
- Components below a page are presentational and take their data as props. A component that fetches on its own makes the page's loading state unknowable and its errors unhandleable.
- Shared state that outlives a route lives in one provider, not in a context invented per feature.

## Record The Notable Choices

Keep a short architecture note in the project's own documentation covering the stack, the environment variables, the layering, the routes, and the choices a reader would otherwise have to reverse-engineer.

The entries worth writing are the ones that look wrong without their reason:

- a call the interface deliberately does not make, because the server refuses it for this actor and the refusal is expected;
- a value the interface says is unavailable rather than inventing, because the summary endpoint does not expose it;
- a backend mechanic kept internal rather than surfaced as a control.

Each of those will look like an oversight to the next reader, and each will be "fixed" into a defect unless the note exists.
