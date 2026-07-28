# SDK

Read [SKILL.md](SKILL.md) first. This document owns how the frontend talks to the backend.

## The Generated SDK Is The Only Transport

`packages/api` is generated from the backend's controllers by Nestia. Its `functional` tree mirrors the route tree, and every accessor carries the request and response types with it.

```ts
import Api, { IShoppingSale, IPage } from "{{apiPackageName}}";

const page: IPage<IShoppingSale.ISummary> =
  await Api.functional.shoppings.customers.sales.index(connection, {
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

A connection carries the host and the headers. Authenticating means putting the issued token into that connection's headers, and whoever authenticates owns doing it.

```ts
const connection: IConnection = { host: apiHost };
connection.headers ??= {};
connection.headers.Authorization = `Bearer ${authorized.token.access}`;
```

One connection per actor, authenticated once and reused. A fresh connection object built from the same host is anonymous, and the resulting failure appears on the second call rather than the first.

Model join, login, refresh, logout, and any grade-management flow from the operations the SDK actually exposes. Do not invent a frontend-only permission model: if the contract exposes role grants, membership, ownership-scoped operations, or session refresh, the interface calls those and reflects their typed state.

Hiding an unavailable command is good usability and is not security. The server remains authoritative, so keep denial paths visible: a stale session, a revoked role, or an ownership change can still produce a refusal on a button the interface chose to show.

## Develop Against Simulation, Finish Against The Server

The SDK answers from generated data when its connection asks it to.

```ts
const connection: IConnection = { host: apiHost, simulate: true };
```

This is the mocking seam at the contract boundary, and it is the primary axis of frontend development rather than a fallback for when the backend is down.

**Build the product against simulation first.** Screens, navigation, forms, loading and empty and error states, and the browser tests that cover the main flows can all be built and run this way, against the real types, with no server and no database. Because the simulation answers from the same contract the server implements, a screen built this way is built against the truth.

Drive the flag from the environment rather than from code, so the same build can run either way:

```ts
export const config = {
  get apiHost() {
    return process.env.VITE_API_HOST?.trim() || "http://127.0.0.1:37001";
  },
  get simulate() {
    return process.env.VITE_API_SIMULATE?.trim() === "true";
  },
};
```

**Then finish against the live backend.** Simulation proves shape and flow. It proves nothing about persistence, sessions, authorization, refresh, or side effects, because no provider ran. Development is complete only after a separately named program runs the same flows with simulation off, against the real host, with real data.

Two rules keep that honest. Label evidence from simulation as shape-and-flow evidence, never as integration. And never point a program named for live integration at the simulated path, because the name is what a later reader trusts.

## Handle What The Contract Says Can Fail

An operation whose contract states a rejection has a visible outcome in the interface. The business rules say what the refusal means; the screen says it in words a user can act on.

Preserve nullable and union states from the contract instead of erasing them with placeholder text. A field the contract says can be absent is absent for a reason the requirements usually state, and rendering a dash in its place discards that meaning.
