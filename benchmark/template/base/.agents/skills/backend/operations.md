# Operations

Read [SKILL.md](SKILL.md) first. This document owns the public API contract: the endpoints and the DTOs they exchange.

## Two Views Of One Behavior

An operation has an implementation view and a consumer view, and both must state the same effects. The implementation view explains the reads, joins, transactions, validation, and edge cases. The consumer view explains purpose, request meaning, response meaning, success effects, state transitions, and rejections.

Every core business effect appears in both. The provider is written from this contract and the tests assert against it, so an effect stated on one side only becomes either a false failure against a faithful implementation or a false pass against a divergent one.

If either view mentions ownership assignment, a membership side effect, session creation, audit logging, a default state, a snapshot write, or a notification, the other carries the same effect.

## Operation Shape

| Name | Method | Request to response | Purpose |
| --- | --- | --- | --- |
| `index` | patch | `IExample.IRequest` to `IPageIExample.ISummary` | search or list with filters |
| `at` | get | none to `IExample` | single detail, never the summary shape |
| `create` | post | `IExample.ICreate` to `IExample` | create |
| `update` | put | `IExample.IUpdate` to `IExample` | update by id, never `patch /resource/{id}` |
| `erase` | delete | none to none or `IExample` | delete; the word `delete` is reserved |
| `restore` | put | none to `IExample` | recovery, at a path ending `/restore` |

Use a domain verb only for behavior that is not one of these. The name becomes both an exported SDK binding and a controller method, so it must be a legal identifier in both positions, which rules out every reserved word.

Request bodies exist for POST, PUT, and PATCH and are absent for GET and DELETE. Every path parameter has exactly one declaration and vice versa, and a request DTO never duplicates a path parameter, because two sources of the same value force reconciliation in the provider.

A listing endpoint uses PATCH with a request body rather than GET with a query string, because a body on GET is not reliably transported.

When both a delete and a recovery exist for a resource, they share one deletion model that the schema can actually perform. Divergent models leave one of the two unimplementable.

## Response Cardinality

Read cardinality from the requirement, not from the route. "All X", "every X", "the list of X", a tree with several roots, and bulk verbs mean multiple. "The X with id" and single-subject aggregates such as a dashboard mean single.

A multi-item response always uses the page wrapper. A bare array is not a legal response type, and declaring a single-item response for an operation that returns many is a compile failure at the call site rather than a style problem. A bounded full collection still uses the page wrapper; a single-page result is valid.

## DTO Naming And Variants

Form the root from the table name: keep every word including the prefix, PascalCase it, singularize it, prefix `I`. `shopping_sale_reviews` becomes `IShoppingSaleReview`. Dropping the prefix or an intermediate word produces a name that no longer identifies its table.

Variants attach with a dot. The page wrapper prefixes the base name with no dot.

| Variant     | Contains                                                  |
| ----------- | --------------------------------------------------------- |
| `.ICreate`  | caller-supplied creation fields, no ids and no timestamps |
| `.IUpdate`  | the mutable fields                                        |
| `.ISummary` | the list-item projection                                  |
| `.IRequest` | search, filter, pagination, and sort controls             |
| `.IInvert`  | the view from the opposite relation                       |

A mutable state field such as `completed`, `published`, or a small status enum stays in `.IUpdate` unless a dedicated transition operation already owns the change. Excluding it because such an operation might be added later leaves the state unreachable through the API.

Every DTO and every property carries a description, and those descriptions are published. Write what the property means to the caller, where its value comes from, why it may be null, and any security implication. A label is not a description.

## Types And Nullability

Map a stored column to the type and format it actually has. A uuid column crosses as a string with `uuid` format, a datetime as a string with `date-time`. Mapping a format-carrying column to a bare string discards the meaning the schema chose.

A stored calendar date reaches the caller as its UTC-midnight instant, and the description says so, so clients compare and render by the date part without a local-time shift.

Nullability has direction. A nullable stored value stays observable in every response DTO. A request DTO may require a present value for the same column. A column that becomes nullable only when a later transition clears it, but is always set at creation, is required and non-null in `.ICreate` and nullable in the read and update variants.

Constrain values with `typia` tags rather than hand-written validation. The generated validator enforces them at the boundary, so a manual check duplicates the rule and then drifts from it.

## Every Property Has A Source

Before exposing a property, find it: check the columns, check the relations, and verify that any stated derivation uses only what exists. A property whose specification says a column "needs to be added" is not ready to design; add the column first.

The inverse mistake is describing a property as computed when the schema already stores it.

Properties legitimately without a stored source are the pagination and search controls in a request DTO, aggregate counts in a read DTO, and the issued token in an authorization result.

Credential columns are excluded from every response DTO. A plaintext password appears only in a credential-input DTO.

## The Request DTO

A listing request carries pagination, search, and ordering, and each part has a fixed shape.

```ts
export namespace IShoppingSale {
  export interface IRequest extends IPage.IRequest {
    /**
     * Search conditions.
     */
    search?: null | IRequest.ISearch;

    /**
     * Sorting conditions.
     */
    sort?: null | IPage.Sort<IRequest.SortableColumns>;
  }
  export namespace IRequest {
    export interface ISearch {
      show_paused?: null | boolean;
      show_suspended?: null | boolean | "only";
      title?: null | string;
      section_codes?: null | string[];
      seller?: null | IShoppingSeller.IRequest.ISearch;
    }

    export type SortableColumns =
      | IShoppingSeller.IRequest.SortableColumns
      | "sale.created_at"
      | "sale.updated_at"
      | "sale.opened_at"
      | "sale.closed_at";
  }
}
```

Four things here are the convention.

**Every optional property is `?: null | T`, not `?: T`.** Absent and null both mean "no filter", and a caller that builds a request object by assigning `undefined` or `null` to a skipped field must not be rejected for choosing the wrong one. This applies to every optional property in every DTO, not only to search fields.

**`IPage.IRequest` supplies `page` and `limit`**, so every listing paginates the same way and a caller learns it once.

**The filters are grouped under `search`.** A request body with a dozen loose optional properties makes `sort` look like one of them.

**`SortableColumns` composes a related resource's sortable columns** rather than restating them. Sorting a sale by its seller's fields stays legal without a second vocabulary that drifts from the first.

The page wrapper and its pagination block are the shared shape every listing returns:

```ts
export interface IPage<T extends object> {
  pagination: IPage.IPagination;
  data: T[];
}
export namespace IPage {
  export interface IPagination {
    current: number & tags.Type<"uint32">;
    /** @default 100 */
    limit: number & tags.Type<"uint32">;
    records: number & tags.Type<"uint32">;
    /** Equal to {@link records} / {@link limit} with ceiling. */
    pages: number & tags.Type<"uint32">;
  }
}
```

The counts carry `tags.Type<"uint32">`, so a negative or fractional page count is rejected at the boundary rather than rendered.

## Sort Grammar

Ordering is one property named `sort`, typed as an array of `"+field"` and `"-field"` literals. `+` is ascending, `-` is descending, and array order is priority. A single-field sort is an array of one.

```ts
// ascending by open time, then descending by creation time
sort: ["+sale.opened_at", "-sale.created_at"];
```

Enumerate only fields with a real ordering use case: the entity timestamps, a natural ordering field such as a display order or a priority, and the id as a deterministic tiebreaker. A listing without a tiebreaker returns rows in an order the database is free to change between identical requests, and the symptom is a row appearing on two pages.

Do not enumerate every column, and do not split the concept into `sortBy` and `sortOrder`. Two properties can disagree; one cannot.

## Not Every Operation Maps To A Table

Totals, averages, and trends are statistics. Patterns across entities are analytics. An at-a-glance view is a dashboard. Search across everything is unified search. These use descriptive DTO names of their own and never borrow an entity DTO.

A response format is not an operation kind. Every operation returns JSON. An export surface is an ordinary read whose filters cover what the file would contain, and the client renders the file. An export becomes its own resource only when the requirements define a stored export artifact with its own lifecycle.

System-generated data does not get create, update, or delete operations when the requirements say the system records it automatically.

## Design Against The User

Test every operation against four questions. Does a user perform this action? Is the data user-managed or system-managed? Would a screen call it? Can that screen finish from this response without a second round of detail calls?

For actor-owned resources, distinguish public browsing from authenticated self-management. An actor-scoped index is usually needed alongside the public one, and the actor identity always comes from the session, never from a path parameter.

## The JSDoc Contract

The JSDoc on a controller method becomes the Swagger operation description and the SDK function's documentation. Its readers never open this repository.

```ts
/**
 * List up every sales.
 *
 * List up every {@link IShoppingSale sales} with detailed information.
 *
 * As you can see, returned sales are detailed, not summarized. If you want
 * to get the summarized information of sale for a brief, use {@link index}
 * function instead.
 *
 * For reference, if you're a {@link IShoppingSeller seller}, you can only
 * access to the your own {@link IShoppingSale sale}s. Otherwise you're a
 * {@link IShoppingCustomer customer}, you can see only the operating sales
 * in the market. Instead, you can't see the unopened, closed, or suspended
 * sales.
 *
 * @param input Request info of pagination, searching and sorting
 * @returns Paginated sales with detailed information
 * @tag Sale
 */
@core.TypedRoute.Patch("details")
public async details(
  @props.AuthGuard() actor: Actor,
  @core.TypedBody() input: IShoppingSale.IRequest,
): Promise<IPage<IShoppingSale>> {
  return ShoppingSaleProvider.details({ actor, input });
}
```

The block sits on the method, not beside it, because the generator reads it from there.

Notice what the middle paragraphs do. One distinguishes this operation from its sibling by name, so a consumer choosing between two similar endpoints does not have to compare their return types. The other states the visibility rule per actor, in full, including which states a customer cannot see. That rule is usually the requirement the endpoint exists to satisfy, and nothing in the signature carries it.

The first line is the operation title. State the authorization and visibility rule whenever it differs by actor, because that is usually the requirement the endpoint exists to satisfy and a caller cannot infer it from the signature. Link related types with `{@link}`. Do not stop at "creates X": include the effects, the transitions, and the rejections.

## Controllers

Group by domain, then by actor. Write the shared behavior once as a base controller factory and specialize it per actor.

```ts
export interface IShoppingControllerProps<Path extends ActorPath = ActorPath> {
  AuthGuard: (
    customerLevel?: "guest" | "member" | "citizen",
  ) => ParameterDecorator;
  path: Path;
}

export function ShoppingSaleController<Actor extends IShoppingActorEntity>(
  props: IShoppingControllerProps,
) {
  @Controller(`shoppings/${props.path}/sales`)
  abstract class ShoppingSaleController {
    @core.TypedRoute.Patch("details")
    public async details(
      @props.AuthGuard() actor: Actor,
      @core.TypedBody() input: IShoppingSale.IRequest,
    ): Promise<IPage<IShoppingSale>> {
      return ShoppingSaleProvider.details({ actor, input });
    }

    @core.TypedRoute.Get(":id")
    public async at(
      @props.AuthGuard() actor: Actor,
      @core.TypedParam("id") id: string & tags.Format<"uuid">,
    ): Promise<IShoppingSale> {
      return ShoppingSaleProvider.at({ actor, id });
    }
  }
  return ShoppingSaleController;
}
```

```ts
export class ShoppingAdminSaleController extends ShoppingSaleController({
  path: "admins",
  AuthGuard: ShoppingAdminAuth,
}) {}
```

The factory returns the class, and the actor's controller extends the call. `AuthGuard` is a function returning a parameter decorator, which is what lets a route demand a stricter level of the same actor by passing an argument.

A path parameter arrives through `@core.TypedParam` with its constrained type, so an identifier that is not a UUID is rejected at the boundary and never reaches a query.

The factory takes the route segment and the guard; each actor's controller is the one-line specialization, and an actor whose behavior genuinely differs overrides that one method. This is what keeps a per-actor visibility rule honest: the difference lives in the provider's query and the actor type, not in three handlers that drift.

Use the typed route and body decorators rather than the plain framework ones. They are what makes the SDK and the OpenAPI document derivable from the signature.

A controller contains no business logic and no database access.

## After Changing An Endpoint

Regenerate the SDK. The tests and the frontend both import it, so an unregenerated change appears to work locally and fails on the next clean build.
