# SDK

This document owns how the frontend talks to the backend.

## The Generated SDK Is The Only Transport

`packages/api` is generated from the backend's controllers by Nestia. Its `functional` tree mirrors the route tree, and every accessor carries the request and response types with it.

```ts
import api, { IShoppingSale, IPage } from "{{apiPackageName}}";

const page: IPage<IShoppingSale.ISummary> =
  await api.functional.shopping.customer.sale.index(connection, {
    limit: 20,
  });
```

- **Never hand-write a fetch or assemble a URL.** A hand-written call compiles fine after a route changes; an accessor does not, and that failure is the entire point of generating the SDK.
- **Never derive an accessor name from a path or a verb.** Take it from the generated exports. If the accessor you expect does not exist, find the operation whose method and path match and use the accessor generated for it. Inventing `putById` or casting the namespace to reach a missing member hides a contract mismatch rather than reporting it.
- **Never redeclare a request or response type.** Import it. A locally redeclared DTO is the second copy that drifts.

The generated JSDoc carries the operation's purpose, its authorization rule, and what the response means. Read it rather than guessing from the accessor name.

## Shared Rules Live In `diagnosers`

Any pure rule the frontend and the backend must apply identically belongs in `packages/api/src/diagnosers`, exported from the package, imported by both.

That is where a validation the client should run before submitting and the server must enforce on arrival lives, so the two cannot drift into a form that accepts what the server then rejects. Entity-to-input mappers for edit forms and shared derivations belong there too. The API skill owns the full rule; the point here is that the frontend imports those helpers rather than reimplementing them.

## Connections And Authentication

A connection carries the host and the headers. Authenticating means calling a lifecycle accessor with it.

```ts
import { apiConnection } from "@/lib/client";

await api.functional.shopping.auth.customer.join(apiConnection, { body });
// apiConnection is now authenticated
```

**Do not write the header yourself.** The accessor does it, because the operation behind it declares where the token goes, which [the API skill](../api/SKILL.md) covers along with the rest of the connection contract.

Assigning `apiConnection.headers.Authorization` by hand is the mistake to avoid here. It duplicates what the accessor already did, and it is written with a `Bearer ` prefix roughly every time, which then diverges from the value the accessor writes. The one place a token is handled is inside the generated call.

`src/lib/client.ts` owns the browser's one `apiConnection`. Authenticate it once for the current actor and reuse it for every later call. A fresh connection object built inside a domain hook is anonymous, and the resulting failure appears on some later call rather than at the point the mistake was made.

Persisting a session across a reload means storing the issued token and putting it back on the connection at startup, which is the one time you touch the header directly. Read it back through the same accessor's response type rather than a shape of your own.

Model join, login, refresh, logout, and any grade-management flow from the operations the SDK actually exposes. Do not invent a frontend-only permission model: if the contract exposes role grants, membership, ownership-scoped operations, or session refresh, the interface calls those and reflects their typed state.

Hiding an unavailable command is good usability and is not security. The server remains authoritative, so keep denial paths visible: a stale session, a revoked role, or an ownership change can still produce a refusal on a button the interface chose to show.

## Develop Against Simulation, Finish Against The Server

The SDK answers from generated data when its connection asks it to.

```ts
// src/lib/client.ts
import type { IConnection } from "@nestia/fetcher";

import { config } from "@/lib/config";

/** Shared generated-SDK connection for browser requests. */
export const apiConnection: IConnection = {
  host: config.apiHost,
  simulate: config.simulate,
};
```

This is the mocking seam at the contract boundary, and it is the primary axis of frontend development rather than a fallback for when the backend is down.

**Build the product against simulation first.** Screens, navigation, forms, loading and empty and error states, and the browser tests that cover the main flows can all be built and run this way, against the real types, with no server and no database. Because the simulation answers from the same contract the server implements, a screen built this way is built against the truth.

Drive the flag from the environment rather than from code, so the same build can run either way:

```ts
// src/lib/config.ts
const readBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected a boolean environment value, received "${value}".`);
};

/** Validated frontend environment settings. */
export const config = {
  apiHost: import.meta.env.VITE_API_HOST ?? "http://127.0.0.1:37001",
  simulate: readBoolean(import.meta.env.VITE_API_SIMULATE, true),
} as const;
```

Simulation answers with valid random data, so it cannot reliably produce an empty list, a rejection, or another named edge state on demand; the state gallery in [verification.md](verification.md) owns forcing those.

**Then finish against the live backend.** Simulation proves shape and flow. It proves nothing about persistence, sessions, authorization, refresh, or side effects, because no provider ran. Development is complete only after the same `pnpm test:e2e` suite runs with `VITE_API_SIMULATE=false`, against the real host, with real data.

Two rules keep that honest. Record simulation as shape-and-flow verification, never as integration. And never record a run as live integration while `VITE_API_SIMULATE` is `true`, because the environment and verification record are what a later reader trusts.

## Handle What The Contract Says Can Fail

An operation whose contract states a rejection has a visible outcome in the interface. The business rules say what the refusal means; the screen says it in words a user can act on.

Preserve nullable and union states from the contract instead of erasing them with placeholder text. A field the contract says can be absent is absent for a reason the requirements usually state, and rendering a dash in its place discards that meaning.
