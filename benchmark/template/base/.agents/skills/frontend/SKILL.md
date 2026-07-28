---
name: frontend
description: Defines the frontend stack, the SDK adapter boundary, page and component structure, required interface states, testing through SDK simulation, and the review a screen must pass. Use before writing or changing a page, a component, or a data call.
---

# Frontend

## Goal

Produce an application that understands the SDK well, and do not let raw SDK shapes take over the interface.

Keep SDK-specific code in an adapter layer and let screens depend on normalized domain models. When the contract changes, the cost should land in the adapter, not in forty components.

## Stack

Use TypeScript with Vite, a router, and a component library, unless the requirements or the user direct otherwise. Read the API host from an environment variable. Add a library only when it solves a real problem you have already met.

Explain any non-default choice for routing, state, fetching, styling, or forms rather than making it silently.

## Start By Reading The SDK

Before designing any screen, make the API surface clear to yourself.

Read `packages/api/src/**/*.ts` carefully, including the comments. The types, their JSDoc, and the `typia` tags are the source of truth for what the product can do, what each field means, and which values are legal. Map the operations, the DTOs, and the constraints before laying out a single page.

A screen designed before reading the contract gets rebuilt after reading it.

## The Adapter Boundary

```ts
import Api, { ISale, IPage } from "{{apiPackageName}}";

const page: IPage<ISale.ISummary> = await Api.functional.sales.index(
  connection,
  { limit: 20 },
);
```

- **Never hand-write a fetch or a URL.** The SDK is regenerated from the controllers, so a hand-written call silently survives a route change that the SDK would have failed to compile against.
- **Never redeclare a request or response type.** Import it. A locally redeclared DTO is the second copy that drifts.
- **Normalize at the boundary.** Convert to the shape screens want in the adapter, so a nested payload does not dictate a component tree.

## Structure

- One route, one page component. A page owns its data loading and passes plain values down.
- Components below a page are presentational and take data as props. A component that fetches on its own makes the page's loading state unknowable and its errors unhandleable.
- Shared state that outlives a route lives in one place, not in a context created per feature.

## Every Screen Handles Every State

A screen is not the success case with the rest deferred. Handle loading, empty, error, retry, and invalidation after a mutation. An interface that renders a spinner forever when a request fails is a defect the requirements did not have to state.

Where an operation can be refused, the refusal has a visible outcome. The business rules state what the refusal means; the screen says it in words a user can act on.

## Requirements Map To Reachable Behavior

A requirement is not realized because an endpoint exists. It is realized when a user can reach the behavior the document describes.

Read the requirement for a workflow before building its screen, and check the flow end to end: what the user sees before acting, while it is in flight, when it succeeds, and when it is refused. A screen that renders data but offers no path to the action the document names does not satisfy it.

Do not turn every endpoint into a feature. Prefer a coherent product over exhaustive endpoint coverage, leave out operations that are diagnostic or redundant, and never invent a feature the SDK does not support. Record a deliberate omission where a reader will find it rather than leaving it to look like an oversight.

## Responsive By Default

The interface works on mobile, tablet, and desktop. Build from real parts: lists, tables, forms, detail views, dialogs, pagination. Keep the layout content-first, and avoid decoration that costs clarity.

## Testing

Keep the frontend test program focused on the frontend. Do not boot the backend or add server health checks to it.

The SDK simulates at its own boundary, which is the mocking seam:

```ts
const connection: IConnection = {
  host: "http://127.0.0.1:37001",
  simulate: true,
};
```

With `simulate: true` the SDK returns generated responses instead of calling the server, so a screen can be tested against the real contract without a running backend. Keep a browser-driven program covering the main user flows, and keep integration testing that needs a live server as a separate program.

## Review Before Calling It Done

Frontend work is not done when it compiles.

- Run the flow yourself, in a browser.
- Check mobile, tablet, and desktop widths.
- Confirm every control causes an observable change.
- Confirm search, sort, pagination, page size, toggles, dialogs, and forms actually work wherever they appear.
- Make one final pass over layout and copy.

Done means the application starts, the core flows work, the interface is coherent, and the tests match the code.
