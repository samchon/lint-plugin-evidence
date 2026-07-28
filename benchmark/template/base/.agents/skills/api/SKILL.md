---
name: api
description: Defines DTO ownership, controller composition, authentication decorators, provider structure, pagination, error construction, and the JSDoc contract that becomes the published API documentation. Use before adding or changing an endpoint, a DTO, or a provider.
---

# API

## Three Layers, One Responsibility Each

Collapsing them produces a controller nobody can test and logic nobody can reuse.

| Layer | Location | Owns |
| --- | --- | --- |
| DTO | `packages/api/src/structures` | the request and response contracts |
| Controller | `packages/backend/src/controllers` | routing, authorization, delegation |
| Provider | `packages/backend/src/providers` | business logic and every database access |

A controller contains no business logic and no Prisma call. A provider knows nothing about HTTP.

## DTOs Live In The API Package

The contract belongs to the SDK, and the server is one implementation of it. Declaring a request or response type inside the backend creates a second contract that consumers cannot see.

An entity type is an interface plus a namespace of its variants:

```ts
export interface ISale {
  id: string & tags.Format<"uuid">;
}
export namespace ISale {
  export interface ICreate {}
  export interface IUpdate {}
  export interface ISummary {}
  export interface IRequest {}
  export interface IInvert {}
}
```

Name the variants consistently. `ICreate` is a creation body, `IUpdate` a modification body, `ISummary` the listing projection, `IRequest` a pagination and search body, and `IInvert` the view from the opposite relation.

Constrain values with `typia` tags rather than hand-written validation. `tags.Format<"uuid">`, `tags.Minimum<0>`, `tags.MaxLength<255>` and their siblings are enforced at the boundary by the generated validator, so a manual check duplicates the rule and then drifts from it.

Compose rather than repeat. A detail type extends its snapshot type; a timestamps mixin is declared once. Every DTO carries the same JSDoc discipline as an endpoint, because these comments become the published type documentation.

`packages/api/src/diagnosers/` holds pure functions both sides need: a mapper from an entity to its creation form, a uniqueness check the client can run before submitting. Put logic there when the client and the server must agree on it, so they cannot disagree.

## Controllers

Group by domain, then by actor. Write the shared behavior once as a base controller factory and specialize it per actor.

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

The factory takes the route segment and the auth guard; each actor's controller is the one-line specialization. An actor whose behavior genuinely differs overrides that one method rather than forking the base.

This is what keeps a per-actor rule honest. When three actors reach the same resource under different visibility rules, the difference lives in the provider's query and in the actor type, not in three copies of the same handler that drift apart.

Use `@core.TypedRoute.*` and `@core.TypedBody()` rather than the plain Nest decorators. They are what make the SDK and the Swagger document derivable from the signature. A listing endpoint that takes a search body uses `Patch`, because a request body on `Get` is not reliably transported.

## Authentication Decorators

Each actor has a parameter decorator in `src/decorators/` that resolves the actor from the request and declares the security scheme on the operation.

```ts
export const SellerAuth =
  (): ParameterDecorator =>
  (target, propertyKey, parameterIndex): void => {
    SwaggerCustomizer((props) => {
      props.route.security ??= [];
      props.route.security.push({ bearer: [] });
    })(target, propertyKey as string, undefined!);
    singleton.get()(target, propertyKey, parameterIndex);
  };
```

Both halves matter. The resolution enforces authorization at runtime; the `SwaggerCustomizer` call is what puts the requirement into the published document, so a consumer reading the SDK knows a token is needed. A decorator that authorizes without declaring produces an API whose documentation lies.

## Providers

A provider is an exported namespace named for the entity it owns, not a class.

```ts
export namespace SaleProvider {
  export namespace json {
    export const transform = (
      input: Prisma.salesGetPayload<ReturnType<typeof select>>,
    ): ISale => ({});
    export const select = () =>
      ({ include: {} }) satisfies Prisma.salesFindManyArgs;
  }
  export namespace summary {}
}
```

The paired `select` and `transform` are the load-bearing convention.

- `select` declares the exact query shape and is typed with `satisfies`, so a typo in an include fails to compile.
- `transform` maps that shape to the DTO, and its input type is derived from `select` through `GetPayload<ReturnType<typeof select>>`.

The two therefore cannot drift: adding a field to the DTO fails to compile until `select` fetches it, and removing a relation from `select` fails to compile in `transform`. Never widen a payload type by hand to make an error go away; that is the one edit that breaks the guarantee.

Give each projection its own nested namespace, `json` for the full form and `summary` for the listing form, and compose by calling a related provider's `select()` inside your own.

## Pagination

List endpoints return `IPage<T>` and are built through the shared pagination helper rather than by hand-writing `skip` and `take`. It takes the Prisma delegate, the payload, and the transformer, and returns the page with its record and page counts consistent with the same `where`.

Hand-rolled pagination produces a total computed from a different filter than the rows, and nothing fails until a page boundary is crossed.

## Errors

Construct HTTP failures through the shared error helper so every failure carries a diagnosable body rather than a bare status.

```ts
throw ErrorProvider.forbidden("Only the owning seller may edit this sale.");
throw ErrorProvider.notFound("No such sale.");
```

Choose the status the requirement implies. A request refused because the actor lacks authority is `403`; one refused because the resource is invisible to that actor is `404`; one refused because the state forbids it is `409` or `422`. The distinction is user-visible and is usually stated in the business rules.

Write the message for the person who receives it. It travels to the client and often to a screen.

## The JSDoc Contract

Every endpoint carries a JSDoc block, and it is published: it becomes the Swagger operation description and the SDK function's documentation. Its readers never see this repository.

```ts
/**
 * List up every sale.
 *
 * List up every {@link ISale sale} with detailed information.
 *
 * If you are a {@link ISeller seller}, you can only access your own
 * {@link ISale sale}s. Otherwise you are a {@link ICustomer customer} and
 * you see only the operating sales.
 *
 * @param input Request info of pagination, searching and sorting
 * @returns Paginated sales with detailed information
 * @tag Sale
 */
```

- The first line is a summary sentence and becomes the operation title.
- State the authorization and visibility rule whenever it differs by actor. A caller cannot infer it from the signature, and this is usually the requirement the endpoint exists to satisfy.
- Link related types with `{@link}` so the generated documentation cross-references them.
- `@param` and `@returns` describe intent, not the type the signature already states.
- `@tag` groups the operation in the published document.

## After Changing An Endpoint

Regenerate the SDK. The tests and the frontend both import it, so a controller change that is not regenerated appears to work locally and fails on the next clean build.
