---
name: api
description: Defines controller composition, DTO ownership, provider structure, and the JSDoc contract that becomes the published API documentation. Use before adding or changing an endpoint, a DTO, or a provider.
---

# API

## The Three Layers

An endpoint is three files with one responsibility each. Collapsing them produces a controller nobody can test and a provider nobody can reuse.

- **DTO** in `packages/api/src/structures` — the request and response contracts, as interfaces with companion namespaces.
- **Controller** in `packages/backend/src/controllers` — routing, authorization, and delegation. It contains no business logic.
- **Provider** in `packages/backend/src/providers` — the business logic and every database access.

## Controllers

Group controllers by domain and then by actor, with the behavior shared across actors written once as a base controller and specialized per actor.

```ts
export function SaleController<Actor extends IActorEntity>(
  props: IControllerProps,
) {
  @Controller(`{{name}}/${props.path}/sales`)
  abstract class SaleController {
    @core.TypedRoute.Patch("details")
    public async details(
      @props.AuthGuard() actor: Actor,
      @core.TypedBody() input: ISale.IRequest,
    ): Promise<IPage<ISale>> {
      return SaleProvider.details({ actor, input });
    }
  }
  return SaleController;
}
```

```ts
export class AdminSaleController extends SaleController({
  path: "admins",
  AuthGuard: AdminAuth,
}) {}
```

The base function takes the route segment and the auth guard, and each actor's controller is the one-line specialization. An actor whose behavior genuinely differs overrides that method rather than forking the base.

Use `@core.TypedRoute.*` and `@core.TypedBody()` rather than the plain Nest decorators. They are what makes the SDK and the Swagger document derivable from the signature.

## DTOs

A DTO is an interface plus a namespace of its variants:

```ts
export interface ISale {
  id: string & tags.Format<"uuid">;
}
export namespace ISale {
  export interface ICreate {}
  export interface ISummary {}
  export interface IRequest {}
}
```

Constrain values with `typia` tags rather than validating by hand. `tags.Format<"uuid">`, `tags.Minimum<0>`, and their siblings are enforced at the boundary by the generated validator, so a hand-written check duplicates it and drifts from it.

Name variants consistently: `ICreate` for a creation body, `IUpdate` for a modification body, `ISummary` for a listing projection, `IRequest` for a pagination and search body, and `IInvert` for a view from the opposite relation.

## Providers

A provider is an exported namespace, not a class, named for the entity it owns.

```ts
export namespace SaleProvider {
  export namespace json {
    export const transform = (input: Payload): ISale => ({});
    export const select = () =>
      ({ include: {} }) satisfies Prisma.salesFindManyArgs;
  }
}
```

The paired `select` and `transform` are the load-bearing convention. `select` declares the exact Prisma query shape and `transform` maps that shape to the DTO, so the two cannot drift: a field added to the DTO fails to compile until `select` fetches it.

Give each projection its own nested namespace — `json` for the full form, `summary` for the listing form — and compose them by calling a related provider's `select()` inside your own.

## The JSDoc Contract

Every endpoint carries a JSDoc block, and it is published: it becomes the Swagger operation description and the SDK function's documentation. It is read by people who never see this repository.

```ts
/**
 * List up every sale.
 *
 * List up every {@link ISale sale} with detailed information.
 *
 * For reference, if you are a {@link ISeller seller}, you can only access
 * your own {@link ISale sale}s.
 *
 * @param input Request info of pagination, searching and sorting
 * @returns Paginated sales with detailed information
 * @tag Sale
 */
```

- **The first line is a summary sentence.** It becomes the operation's title.
- **State the authorization rule** when it differs by actor. A caller cannot infer it from the signature.
- **Link related types with `{@link}`** so the generated documentation cross-references them.
- **`@param` and `@returns` describe intent**, not the type the signature already states.
- **`@tag` groups the operation** in the published document.

## After Changing An Endpoint

Regenerate the SDK, or every consumer keeps compiling against the old contract:

```bash
pnpm --filter {{apiPackageName}} build
```

The tests and the frontend both import the generated SDK, so a controller change that is not regenerated appears to work locally and fails on the next clean build.
