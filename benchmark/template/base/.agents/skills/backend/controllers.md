# Controllers

Read [SKILL.md](SKILL.md) first. This document owns the endpoints: their shape, their request and response contracts, and the JSDoc that becomes the published documentation.

The types they exchange are declared in `packages/api/src/structures` and owned by [dtos.md](dtos.md).

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

## Paths

A path describes a resource and a workflow state.

**Segments are singular and camelCase, named after the schema's own noun.** A schema called `orderItem` gives `/orderItem/{id}`, never a generic `/item/{id}`. One schema keeps one spelling everywhere it appears.

**Nest each required foreign-key ancestor root-first**, named from its table without the service prefix, singularized and camelCased. `shopping_sales` contributes `{saleId}`. Stop the chain at the first nullable or optional parent, because an optional ancestor cannot be part of an address.

**Address the target row by its own bare `id`**, and that is always the identifier, never a name, a slug, or a code, even where a single-column unique constraint would allow one.

**Authenticated self-access carries no actor id.** The caller is the session's, and putting it in the path lets a caller name someone else.

**A scope chosen once at login stays out of the path.** When an organization or a workspace is selected at sign-in and every later call runs inside it, the provider derives it from the session and filters by it. Putting it in the path lets a caller name a scope the session never selected, and forces every route to carry a parameter no client can vary. Routes that manage the scope row itself remain ordinary resource routes.

A recovery path ends in `/restore`.

## Methods Follow The Response, Not The Caller

| Response | Method |
| --- | --- |
| many records, or a page | `patch` with a request body |
| exactly one record, or a session-identified singleton | `get` |
| an update to an identified record | `put` |
| a creation | `post` |
| an ordinary deletion | `delete` |

`patch` is the list and search grammar and nothing else. That includes a caller's own collection, such as their cart items or order history: it is still many records, so it is still `patch`.

`get` is reserved for one record or the caller's own singleton, such as their profile.

An ordinary deletion is `delete`, never a post to a path ending in `delete`. A distinct administrative or workflow effect gets its own precise name instead: `/forceDelete`, `/cancel`, `/withdraw`.

Deleting one's own association can rely on the parent's id plus the session. Deleting **another** actor's row addresses that row by its own bare id, because an actor-named parameter leaves the target unidentifiable.

## Response Cardinality

Read cardinality from the requirement, not from the route. "All X", "every X", "the list of X", a tree with several roots, and bulk verbs mean multiple. "The X with id" and single-subject aggregates such as a dashboard mean single.

A multi-item response always uses the page wrapper. A bare array is not a legal response type, and declaring a single-item response for an operation that returns many is a compile failure at the call site rather than a style problem. A bounded full collection still uses the page wrapper; a single-page result is valid.

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

The controller example above shows the shape. What each part of the block owes:

| Part | Owes |
| --- | --- |
| first line | the operation title, one sentence |
| body paragraphs | purpose, the per-actor visibility rule, effects, transitions, rejections |
| `{@link}` | a cross-reference the generated documentation resolves |
| blockquote | a directive to the caller: do this, in this order, at least once |
| `@param` | what the value means, not the type the signature already states |
| `@returns` | what the response represents |
| `@tag` | the group this operation belongs to in the published document |
| `@setHeader` | where the SDK must place a value from the response |

`@setHeader` is not documentation. On a join, login, or refresh operation it is what makes the generated accessor write the issued token into the caller's connection:

```ts
/**
 * @setHeader token.access Authorization
 */
```

Without it every consumer, including the test suite, authenticates and then makes anonymous calls.

Two habits carry most of the value.

**Distinguish an operation from its siblings by name.** "If you want the summarized form, use `index` instead" saves every consumer from comparing two return types to work out which endpoint they want.

**State the visibility rule in full, including what is not returned.** A seller sees only their own; a customer sees only operating sales and not the unopened, closed, or suspended ones. That rule is usually the requirement the endpoint exists to satisfy, and nothing in the signature carries it.

Write it for someone who will never open this repository. They get the SDK function and its documentation, and nothing else.

The first line is the operation title. State the authorization and visibility rule whenever it differs by actor, because that is usually the requirement the endpoint exists to satisfy and a caller cannot infer it from the signature. Link related types with `{@link}`. Do not stop at "creates X": include the effects, the transitions, and the rejections.

## Controllers

Group by domain, then by actor. One plain class per actor and resource, with an explicit route and an explicit guard.

```ts
@Controller("shoppings/sellers/sales")
export class ShoppingSellerSaleController {
    /**
     * List up every sales.
     *
     * List up every {@link IShoppingSale sales} with detailed information.
     *
     * As you can see, returned sales are detailed, not summarized. If you
     * want to get the summarized information of sale for a brief, use
     * {@link index} function instead.
     *
     * For reference, if you're a {@link IShoppingSeller seller}, you can only
     * access to the your own {@link IShoppingSale sale}s. Otherwise you're a
     * {@link IShoppingCustomer customer}, you can see only the operating
     * sales in the market. Instead, you can't see the unopened, closed, or
     * suspended sales.
     *
     * @param input Request info of pagination, searching and sorting
     * @returns Paginated sales with detailed information
     * @tag Sale
     */
  @core.TypedRoute.Patch("details")
  public async details(
    @ShoppingSellerAuth() seller: IShoppingSeller.IInvert,
    @core.TypedBody() input: IShoppingSale.IRequest,
  ): Promise<IPage<IShoppingSale>> {
    return ShoppingSaleProvider.details({ actor: seller, input });
  }

    /**
     * Get a sale with detailed information.
     *
     * Get a {@link IShoppingSale sale} with detailed information including
     * the SKU (Stock Keeping Unit) information represented by the
     * {@link IShoppingSaleUnitOption} and {@link IShoppingSaleUnitStock}
     * types.
     *
     * > If the user wants to buy or compose a
     * > {@link IShoppingCartCommodity shopping cart} from a sale, call this
     * > operation at least once to get detailed SKU information about it.
     *
     * @param id Target sale's {@link IShoppingSale.id}
     * @returns Detailed sale information
     * @tag Sale
     */
  @core.TypedRoute.Get(":id")
  public async at(
    @ShoppingSellerAuth() seller: IShoppingSeller.IInvert,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<IShoppingSale> {
    return ShoppingSaleProvider.at({ actor: seller, id });
  }
}
```

Each actor that reaches a resource gets its own controller, with its own route prefix and its own guard. The behavior they share lives in the provider both of them call, so a reader opening `ShoppingSellerSaleController` sees the seller's routes and the seller's guard and nothing else.

**A controller contains no business logic and no database access.** It resolves the actor, delegates to the provider, and returns.

**Every method carries its JSDoc.** There is no endpoint too small to document, because the block is the published API reference and an undocumented operation reaches its consumers as a name and a type signature.

The blockquote in the second method is a directive to the caller rather than a description. Use it where the contract needs the consumer to act in a particular order or at a particular time, which a description alone does not convey.

A path parameter arrives through `@core.TypedParam` with its constrained type, so an identifier that is not a UUID is rejected at the boundary and never reaches a query.

The actor arrives through that actor's authentication decorator, which resolves it from the request and declares the security requirement on the operation. The authorization topic owns both halves.

Use the typed route, body, and parameter decorators. They are what makes the SDK and the OpenAPI document derivable from the signature.

A per-actor visibility rule lives in the provider's query, keyed by the actor the guard resolved, so three controllers calling one provider enforce one rule.

## After Changing An Endpoint

Regenerate the SDK. The tests and the frontend both import it, so an unregenerated change appears to work locally and fails on the next clean build.
