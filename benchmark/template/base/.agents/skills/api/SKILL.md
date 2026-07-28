---
name: api
description: Explains what packages/api is, which parts are generated and which are authored, where logic shared between the frontend and the backend belongs, how connections and authentication work, and what simulation mode actually does. Use before importing from it, before deciding where a shared rule lives, or when tracing where a contract comes from.
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

Nestia's configuration lives in `packages/backend/nestia.config.ts` and its output directory is this package's `src`. That does not mean it owns the whole tree.

| Path | Origin | Editing it |
| --- | --- | --- |
| `src/functional/**` | generated from the controllers | never |
| `swagger.json` | generated from the controllers | never |
| `src/structures/**` | the DTO declarations | change here, then regenerate |
| `src/diagnosers/**` | authored | change here |

An edit to a generated path survives until the next generation and then disappears without a message. The disappearance looks like someone else's bug, and the change that caused it was committed long before.

To change what an operation exposes, change the controller signature, its DTO, or its JSDoc, then run the SDK generation. The backend skill's operations and wiring topics own those conventions.

## What A Generated Accessor Looks Like

Reading one explains most of what follows.

```ts
export async function at(
  connection: IConnection,
  id: string & Format<"uuid">,
): Promise<IShoppingSale> {
  return true === connection.simulate
    ? at.simulate(connection, id)
    : PlainFetcher.fetch(connection, { ...at.METADATA, path: at.path(id) });
}
export namespace at {
  export const random = (): IShoppingSale => typia.random<IShoppingSale>();
  export const simulate = (connection: IConnection, id: string): IShoppingSale => {
    const assert = NestiaSimulator.assert({ method: METADATA.method, path: path(id) });
    assert.param("id")(() => typia.assert(id));
    return random();
  };
}
```

The accessor is a function whose path mirrors the route, whose parameters carry the contract's own constrained types, and which branches on the connection. Everything the frontend and the tests do with the SDK follows from that shape.

## `diagnosers` Is Where Shared Logic Lives

This is the part with no obvious home, which is why it gets duplicated. Any pure rule that **both the frontend and the backend must apply identically** belongs in `src/diagnosers`, exported from the package, imported by both.

Three kinds recur.

**Validation that produces diagnoses.** A rule the client should check before submitting and the server must enforce on arrival.

```ts

/**
 * Diagnoser of uniqueness.
 *
 * Finds every duplicated element.
 */
export namespace UniqueDiagnoser {
  /**
   * Properties of the unique diagnoser.
   */
  export interface IProps<Element> {
    /**
     * Key getter function.
     */
    key(x: Element): string;

    /**
     * Message generator called when a duplicate is found.
     */
    message(elem: Element, index: number): IDiagnosis;

    /**
     * Target elements to validate.
     */
    items: Element[];
  }

  /**
   * Diagnose duplicated elements.
   */
  export const validate = <Element>(props: IProps<Element>): IDiagnosis[] => {};
}
```

**Everything published carries JSDoc, down to each property.** This package is the API reference: its types reach consumers who never open this repository, and a property documented only by its name tells them nothing about what value belongs there.

`IDiagnosis` is the same shape the server's error responses carry. That is the point: a client-side check and a server-side rejection speak one vocabulary, so a screen renders either without branching, and a field-level error lands on the right field because `accessor` says which one.

Writing the rule twice guarantees the two drift, and the drift surfaces as a form that accepts what the server then rejects.

**Entity to input mappers.** Turning a fetched entity back into the body that would recreate it. An edit form needs exactly this, and so does a server-side duplicate feature.

```ts
export namespace AttachmentFileDiagnoser {
  export const replica = (input: IAttachmentFile): IAttachmentFile.ICreate => ({
    name: input.name,
    extension: input.extension,
    url: input.url,
  });
}
```

**Relation inverters and derivations.** Reading a nested actor out of a composed response, or deriving a display value, when both sides need the same answer.

The test for whether something belongs here: would the frontend and the backend each need to write this function? If only one side needs it, keep it there. A helper moved here that one side uses becomes a published API surface nobody asked for.

The frontend imports it from the package like any other export. The backend re-exports it through a barrel in `src/utils`, so its providers import one local name rather than reaching across the package boundary in forty files.

## Consuming An Accessor

```ts
import api, { IShoppingSale, IPage } from "{{apiPackageName}}";

const page: IPage<IShoppingSale.ISummary> =
  await api.functional.shoppings.customers.sales.index(connection, {
    limit: 20,
  });
```

Take accessor names from the generated exports, never from a path or a verb. If the accessor you expect is absent, find the operation whose method and path match and use the one generated for it. Inventing a name, or casting the namespace to reach a missing member, hides a contract mismatch instead of reporting it.

Import every request and response type from here. A locally redeclared DTO is the second copy that drifts.

A multi-item response always arrives in the page wrapper, which is declared in `src/structures/common/IPage.ts` and shared by every listing. Read it there.

The generated JSDoc carries the operation's purpose, its authorization rule, and what its response means. Read it rather than guessing from the name.

## Constrained Types Come With The Contract

Parameters and DTO properties are not bare primitives. They carry `typia` tags, which are compile-time refinements the boundary validates at runtime.

```ts
id: string & tags.Format<"uuid">;
quantity: number & tags.Type<"uint32"> & tags.Minimum<1>;
email: string & tags.Format<"email">;
```

Two consequences. A caller cannot pass an arbitrary string where a uuid is required, so a fabricated identifier fails at the type level rather than at the database. And the boundary already enforces every one of these, so re-checking them in a provider or a screen is dead code that drifts from the contract.

## Connections

`IConnection` is the object every accessor takes first. It carries the host and, once authenticated, the headers.

```ts
export interface IConnection {
  host: string;
  headers?: Record<string, string>;
  simulate?: boolean;
}
```

Authenticating means putting the issued token into that connection's headers, and whoever authenticates owns doing it:

```ts
const connection: IConnection = { host: apiHost };
connection.headers ??= {};
connection.headers.Authorization = `Bearer ${authorized.token.access}`;
```

**One connection per actor, authenticated once, reused for every call by that actor.** The SDK copies the token nowhere else, so a fresh `{ host }` object is anonymous. The resulting failure appears on the second call rather than the first, which is why it reads as a puzzle rather than a mistake.

## Simulation Mode

Setting one flag makes every accessor answer locally instead of calling the server.

```ts
const connection: IConnection = { host, simulate: true };
```

This is not a hand-written mock, and understanding what it actually does is what makes it trustworthy.

**It validates the request exactly as the server would.** Look again at the generated `simulate`: it runs `typia.assert` over each path parameter and over the request body, through the same validator the server's boundary uses. A request the server would reject is rejected here, with the same shape of error. A form that submits an invalid body fails in simulation for the real reason.

**It returns a value generated from the response type.** `typia.random<IShoppingSale>()` produces a value satisfying the declared type and every tag on it: a real uuid where the contract says uuid, a value inside the declared range where it says minimum and maximum, a member of the union where it says union. The response cannot be shaped wrongly, because it is generated from the contract rather than written by someone guessing at it.

So a screen built against simulation is built against the real contract. If it renders a field the contract does not have, it breaks immediately.

**What it does not do.** No provider runs. Nothing is stored, no session exists, no authorization is evaluated, no side effect occurs. Two calls to the same accessor return unrelated values, and a create followed by a read does not return what you created.

That last part is the trap. Values are random per call, so anything that needs stable data across a run needs the randomness seeded. A screenshot program or a browser test that depends on a particular product name will otherwise pass locally and fail in the next run for no reason anyone can see.

**How to use it.** Develop the frontend against simulation: screens, navigation, forms, loading and empty and error states, and the browser programs that cover the main flows, all with no server and no database. Then finish against the live backend, because persistence, sessions, authorization, refresh, and side effects are exactly what simulation does not prove.

Label the evidence accordingly. A run in simulation is shape-and-flow evidence, never integration evidence, and a program named for live integration must never be pointed at the simulated path.

The flag is turned on by `simulate: true` in the Nestia configuration when the SDK is generated. If an accessor has no `simulate` branch, the SDK was generated without it.
