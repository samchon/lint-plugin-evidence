---
name: api
description: Explains what packages/api is, which parts are generated and which are authored, where logic shared between the frontend and the backend belongs, and how to consume the SDK. Use before importing from it, before deciding where a shared rule lives, or when tracing where a contract comes from.
---

# API SDK

## What It Is

`packages/api` is the SDK a consumer installs, and it is the one place an API contract is declared. The backend imports its own DTOs from here, which reads backwards until you see why: the contract belongs to the SDK, and the server is one implementation of it.

```
packages/api/
  src/functional/     generated client accessors, one per operation
  src/structures/     the DTO contracts
  src/diagnosers/     logic the frontend and the backend must agree on
  swagger.json        generated OpenAPI document
```

## Generated Versus Authored

The SDK generator's configuration lives in `packages/backend/nestia.config.ts` and its output directory is this package's `src`.

| Path | Origin | Editing it |
| --- | --- | --- |
| `src/functional/**` | generated from the controllers | never |
| `swagger.json` | generated from the controllers | never |
| `src/structures/**` | the DTO declarations | change here, then regenerate |
| `src/diagnosers/**` | authored | change here |

An edit to a generated path survives until the next generation and then disappears without a message. The disappearance looks like someone else's bug, and the change that caused it was committed long before.

To change what an operation exposes, change the controller signature, its DTO, or its JSDoc, then regenerate. The backend skill's operations document owns those conventions.

## `diagnosers` Is Where Shared Logic Lives

This is the part that has no obvious home and therefore gets duplicated. Any pure rule that **both the frontend and the backend must apply identically** belongs in `src/diagnosers`, exported from the package, and imported by both.

Three kinds show up repeatedly.

**Validation that produces diagnoses.** A rule the client should check before submitting and the server must enforce on arrival. Writing it twice guarantees the two drift, and the drift shows up as a form that accepts what the server then rejects.

```ts
export namespace UniqueDiagnoser {
  export interface IProps<Element> {
    key(x: Element): string;
    message(elem: Element, index: number): IDiagnosis;
    filter?(elem: Element): boolean;
    items: Element[];
  }
  export const validate = <Element>(props: IProps<Element>): IDiagnosis[] => {};
}
```

The return type is the same diagnosis shape the error responses carry, so a client-side check and a server-side rejection speak one vocabulary and a screen can render either without branching.

**Entity to input mappers.** Turning a fetched entity back into the body that would recreate it. A form that edits an existing resource needs exactly this, and so does a server-side duplication feature.

```ts
export namespace AttachmentFileDiagnoser {
  export const replica = (input: IAttachmentFile): IAttachmentFile.ICreate => ({
    name: input.name,
    extension: input.extension,
    url: input.url,
  });
}
```

**Relation inverters and derivations.** Reading a nested actor out of a composed response, or deriving a display value from a contract, when both sides need the same answer.

The rule for deciding: if the frontend and the backend would each need to write the same function, it belongs here. If only one side needs it, keep it there. A helper moved here that only one side uses becomes a published API surface nobody asked for.

Consume it symmetrically. The frontend imports it from the package like any other export; the backend re-exports it through a barrel in `src/utils` so its providers import one local name rather than reaching across the package boundary in forty files.

## How To Consume The SDK

Call an accessor by importing it, never by assembling a URL.

```ts
import Api, { IShoppingSale, IPage } from "{{apiPackageName}}";

const page: IPage<IShoppingSale.ISummary> =
  await Api.functional.shoppings.customers.sales.index(connection, {
    limit: 20,
  });
```

The accessor path mirrors the route, and the request and response types come with it. A hand-written fetch compiles fine after a route changes; an accessor does not, which is the entire point.

Import every request and response type from here. A locally redeclared DTO is the second copy that drifts.

The generated JSDoc carries the operation's purpose, its authorization rule, and what its response means. Read it rather than guessing from the accessor name.

## The Connection

A connection carries the host and the headers. An authenticated call needs the token in those headers, and whoever authenticates is responsible for putting it there.

```ts
const connection: IConnection = { host: "http://127.0.0.1:37001" };
connection.headers ??= {};
connection.headers.Authorization = `Bearer ${authorized.token.access}`;
```

Reuse one connection per actor. A fresh connection object built from the same host is anonymous.

## Simulation

The SDK can answer from generated data instead of calling the server.

```ts
const connection: IConnection = { host, simulate: true };
```

This is the mocking seam at the contract boundary, which is what makes it useful: a screen tested this way is tested against the real types. It proves shape and flow, never that the server behaves. Label evidence obtained this way accordingly, and never point a test named for live integration at it.
