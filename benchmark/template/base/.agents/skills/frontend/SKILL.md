---
name: frontend
description: Defines Vite and React conventions, how the generated SDK is consumed, and how a page maps to a documented requirement. Use before writing or changing a page, a component, or a data call.
---

# Frontend

## Shape

A Vite and React single-page application in `packages/frontend`. It consumes `{{apiPackageName}}`, the SDK generated from the backend's controllers, and it holds no second copy of the API's types.

## Calling The API

Call the generated SDK's `functional` accessors directly from the component or hook that owns the workflow.

```ts
import Api, { ISale } from "{{apiPackageName}}";

const page: IPage<ISale.ISummary> = await Api.functional.sales.index(
  connection,
  { limit: 20 },
);
```

- **Never hand-write a fetch or a URL.** The SDK is regenerated from the controllers, so a hand-written call silently survives a route change that the SDK would have failed to compile against.
- **Never redeclare a request or response type.** Import it from the SDK. A locally redeclared DTO is the second copy that drifts.
- **Handle the failure path.** An endpoint that can refuse a request has a UI state for the refusal; a screen that only renders the success case is incomplete.

## Structure

- One route, one page component. A page owns its data loading and passes plain values down.
- Components below a page are presentational and take their data as props. A component that fetches on its own makes the page's loading state unknowable.
- Shared state that outlives a route belongs in one place, not in a context created per feature.

## Requirements Map To Screens

A requirement is not realized because an endpoint exists. It is realized when a user can reach the behavior the document describes.

Read the requirement document for the workflow before building the screen, and check the flow it describes end to end: what the user sees before acting, what they see while it is in flight, and what they see when it is refused. A screen that renders data but offers no path to the action the document names does not satisfy it.

## Running

```bash
pnpm --filter {{frontendPackageName}} dev
pnpm --filter {{frontendPackageName}} build
```

The build type-checks against the generated SDK. Regenerate the SDK after any backend contract change, or the frontend compiles against a contract the server no longer serves.
