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
| `index` | patch | `IExample.IRequest` to `IPage<IExample.ISummary>` | search or list with filters |
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

A path describes a resource and a workflow state, under one service root.

**Every route begins with the service segment**, singular and camelCase, the same word for the whole product. It becomes the first namespace of every generated accessor, so `/shopping/...` gives `api.functional.shopping....`. Choose it once and never vary it.

**After the service root, a protected route names the actor that may reach it; a public route names none.** The seller's own sale surface is `/shopping/seller/sale`, the administrator's order surface is `/shopping/admin/order`, and a catalogue anyone may read is `/shopping/product`. That segment is the one place an actor name belongs, and it names **who calls**, never whose data is addressed.

**A public route and a guest route are different things.** A surface both an anonymous visitor and a signed-in member may call is public, so it carries no actor segment. A protected surface names only the credentialed actors that may reach it. Never mix a guest actor with credentialed ones on one route: whatever the guest can reach, everyone can, which makes the route public.

**Do not repeat the actor inside its own surface.** The seller's sales are `/shopping/seller/sale`, not `/shopping/seller/sellerSale`, and the caller's own profile is `/shopping/customer/profile`.

**Segments are singular and camelCase, named after the schema's own noun.** A schema called `orderItem` gives `/orderItem/{id}`, never a generic `/item/{id}`. One schema keeps one spelling everywhere it appears, and a child segment does not restate its parent: under `/order` the child is `/item`'s own noun `orderItem`, not `orderOrderItem`.

**Nest each required foreign-key ancestor root-first**, named from its table without the service prefix, singularized and camelCased. `shopping_sales` contributes `{saleId}`, giving `/shopping/seller/section/{sectionId}/sale/{saleId}/saleUnit/{id}`. Stop the chain at the first nullable or optional parent, because an optional ancestor cannot be part of an address.

**Address the target row by its own bare `id`**, and that is always the identifier, never a name, a slug, or a code, even where a single-column unique constraint would allow one. The target's own id is never `{saleUnitId}`: an ancestor-shaped name there reads as already supplied, and the parameter gets dropped. A bulk update or delete over a nested sub-collection keeps the ancestors and omits the trailing `id`.

**No actor id is ever a path parameter.** Not `{customerId}`, not `{sellerId}`, not `{memberId}`. The caller's identity comes from the session, and another actor is reached one of two ways: when that actor's own record is the target, address it by the bare `id`, as in `/shopping/admin/member/{id}`; when the actor merely scopes some other resource, pass its id as a request-body filter, as in `PATCH /shopping/admin/post` with the member id in the body.

**A scope chosen once at login stays out of the path.** When an organization or a workspace is selected at sign-in and every later call runs inside it, the provider derives it from the session and filters by it. Putting it in the path lets a caller name a scope the session never selected, and forces every route to carry a parameter no client can vary. Routes that manage the scope row itself remain ordinary resource routes.

**A recovery path ends in `/restore`**, as in `PUT /shopping/seller/sale/{id}/restore`. Never a synonym: `/recover`, `/reactivate`, `/reinstate`, `/undelete`, and `/activate` all describe the same surface in a vocabulary nothing else in the repository shares, and the recovery half of the deletion model is identified by that exact segment.

## Authentication Owns Three Operations, And The Rest Are Ordinary Routes

Join, login, and refresh live under the authentication surface. Everything else that feels like authentication is an ordinary endpoint over its own resource, at a resource-shaped path: `/shopping/customer/session` for session visibility and revocation, `/shopping/customer/password` for a change, `/shopping/customer/passwordResetRequest` for a reset record, `/shopping/customer/verificationRequest` for verification, and the actor's own path for withdrawal and external connections.

Filing these under an authentication prefix hides them from the resource ledger, and each one has its own schema, its own lifecycle, and its own requirement.

**Do not exclude a credential support table because it is security-related.** A password reset record, an email verification record, an OAuth connection, and a withdrawal record are user-visible workflows unless you can state a concrete reason this one is internal.

**When one support workflow serves several actors whose rows live in different tables, it is several endpoints.** One route resolves one table, so a combined session, password, or withdrawal route across customer, seller, and administrator cannot faithfully represent any of them. Split it per actor and point each at its own table.

**A grade that can be granted needs a route that grants it**, and a grade that can be removed needs one that removes it. A grant names the target user in the request body; a change or removal addresses the existing assignment record by its own bare `id`. Without those routes the promised authority is unreachable and every rejection depending on it is untestable. [authorization.md](authorization.md) owns which grades exist and who may move them.

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

`IPage` and `IPage.IRequest` already exist in `packages/api/src/structures/common/IPage.ts`. Read that file rather than redeclaring either: the wrapper is shared by every listing in the product, and a second definition of it is a second contract.

## Sort Grammar

Ordering is one property named `sort`, typed as an array of `"+field"` and `"-field"` literals. `+` is ascending, `-` is descending, and array order is priority. A single-field sort is an array of one.

```ts
// ascending by open time, then descending by creation time
sort: ["+sale.opened_at", "-sale.created_at"];
```

Enumerate only fields with a real ordering use case: the entity timestamps, a natural ordering field such as a display order or a priority, and the id as a deterministic tiebreaker. A listing without a tiebreaker returns rows in an order the database is free to change between identical requests, and the symptom is a row appearing on two pages.

Do not enumerate every column, and do not split the concept into `sortBy` and `sortOrder`. Two properties can disagree; one cannot.

## Prerequisites

An operation's prerequisites are the ordered list of creations that must happen before it can be called at all. They are not authentication and not test setup.

Only a creation establishes a prerequisite. A read or an update of existing state does not bring a resource into existence, so no `get`, `put`, `patch`, or `delete` is ever one.

Extract them from both sides of the request. A path parameter names an ancestor that must exist, and a foreign key inside the body names one too: an identifier referencing another resource is a prerequisite even though it arrives in the body rather than the path. Optional and context-dependent references are not, because only what must already exist qualifies.

Order creators first: independent resources, then parents, then children.

For `PUT /order/{orderId}/item/{id}` the list is:

```
POST /product          the referenced product
POST /order            the parent order
POST /order/{orderId}/item   the row being updated
```

Analyze only direct dependencies. Transitive chains resolve when the same procedure is applied to each operation in turn, and the graph must stay acyclic: if creating one resource must precede another, the second can never be a prerequisite of the first at any length.

This list is what a test's setup order comes from, and what tells a consumer which calls to make first.

## Every Schema Reaches The API, Or Is Excluded On Purpose

Keep a ledger of the schemas a group touches. Each one lands in exactly one of four places.

1. Exposed through its own endpoints.
2. Reached as a parent or child inside a nested endpoint.
3. Used as a query or projection source behind a workflow endpoint.
4. Deliberately internal, with the reason written down.

A table with no entry is either an endpoint nobody designed or an unrecorded decision, and on the next pass those look identical.

Coverage is by exact method and path. A trash listing does not cover the ordinary listing, an item endpoint does not cover its collection, and a mention in a description covers nothing.

**Each primary table owes six separate decisions**, and one route never answers two of them: the collection listing, the creation, the item detail, the update, the deletion, and each named state transition. Deciding "this table has CRUD" answers none of them, because the question is which of the six this product actually needs.

**Presence in the schema is not a reason for a route.** A table exists to hold state; an endpoint exists because a requirement says someone does something. Do not generate the six surfaces for a table nobody reaches, do not force a named workflow into one of them, and do not skip a named workflow because the table already has the ordinary five.

**One schema is served under one path family.** When the same table is reachable at two roots, callers and the ledger disagree about which one is the resource, and every later coverage question has two answers.

**A child table with its own row identity and its own user-visible fields needs its own coverage.** Option and value rows, image and file rows, attachments, requester link rows, and snapshot component rows all qualify. A parent's detail response may embed those values, and embedding covers nothing: the row is still separately real, and either something reaches it or the ledger says why nothing does.

**A nested route belongs to the most specific table it touches**, not to the parent its URL happens to nest under. A product snapshot route belongs to the snapshot table; an order item's captured variant belongs to the order-item variant snapshot table. Compound nouns in the path name the depth, so read the deepest one.

**A route that belongs to no single table is a workflow.** Dashboards, feeds, reports, computed projections, and cross-model search have no owning table, and saying so is an entry in the ledger rather than an omission from it.

**A request or approval workflow whose requesters live in different tables per actor is several surfaces.** The parent request table does not cover the per-actor link rows. Each requester actor gets its own view of its own requests, and the approver gets a cross-actor queue, which is a `patch` collection filtered by state.

Exposure follows the stance the schema was given.

| Stance | Surface |
| --- | --- |
| `actor` | the lifecycle owns creation; add browsing or self-profile only where a requirement asks |
| `session` | visibility where it belongs to this group; revocation only where the requirements describe it |
| `snapshot` | detail and history reads; an append only where a requirement calls for it, never update or delete |
| `subsidiary` under a composition parent | created through the parent; nested read, update, or delete only where the child is separately callable |
| `material` | read-only projections |

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
@Controller("shopping/seller/sale")
export class SellerSaleController {
  /**
   * List the seller's own sales.
   *
   * List the {@link IShoppingSale sales} this seller registered, as a
   * paginated page of summaries filtered and ordered by the request.
   *
   * A seller reaches only their own sales here. The customer surface at
   * `PATCH /sale` shows the operating sales of every seller, and excludes
   * the unopened, closed, paused, and suspended ones.
   *
   * The summaries omit the SKU tree. Call {@link at} for one sale when the
   * options and stocks are needed.
   *
   * @param input Pagination, search conditions, and sort order
   * @returns One page of the seller's own sales, summarized
   * @tag Sale
   */
  @core.TypedRoute.Patch()
  public async index(
    @SellerAuth() seller: SellerPayload,
    @core.TypedBody() input: IShoppingSale.IRequest,
  ): Promise<IPage<IShoppingSale.ISummary>> {
    return ShoppingSaleProvider.index({ actor: seller, input });
  }

  /**
   * Get one of the seller's own sales in full.
   *
   * Get a {@link IShoppingSale sale} with its SKU tree, meaning the
   * {@link IShoppingSaleUnitOption options} and
   * {@link IShoppingSaleUnitStock stocks} a buyer chooses between.
   *
   * > Call this at least once before composing a
   * > {@link IShoppingCartCommodity cart commodity} from a sale. The
   * > summaries returned by {@link index} carry no stock identifiers, so a
   * > cart cannot be built from them.
   *
   * Rejects with `403` when the sale belongs to another seller, and with
   * `404` when no sale carries this identifier.
   *
   * @param id Target sale's {@link IShoppingSale.id}
   * @returns The sale, with its full SKU tree
   * @tag Sale
   */
  @core.TypedRoute.Get(":id")
  public async at(
    @SellerAuth() seller: SellerPayload,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<IShoppingSale> {
    return ShoppingSaleProvider.at({ actor: seller, id });
  }
}
```

Each actor that reaches a resource gets its own controller, with its own route prefix and its own guard. The behavior they share lives in the provider both of them call, so a reader opening `SellerSaleController` sees the seller's routes and the seller's guard and nothing else.

**The actor parameter is a payload, not a DTO.** `SellerPayload` carries the identifier, the session identifier, and the actor discriminant, and nothing else. The provider loads whatever else it needs from the identifier. Handing the controller a full actor DTO makes every route pay for a read it usually does not use, and invites building the response out of it.

**A controller contains no business logic and no database access.** It resolves the actor, delegates to the provider, and returns.

**Every method carries its JSDoc.** There is no endpoint too small to document, because the block is the published API reference and an undocumented operation reaches its consumers as a name and a type signature.

The blockquote in the second method is a directive to the caller rather than a description. Use it where the contract needs the consumer to act in a particular order or at a particular time, which a description alone does not convey.

A path parameter arrives through `@core.TypedParam` with its constrained type, so an identifier that is not a UUID is rejected at the boundary and never reaches a query.

The actor arrives through that actor's authentication decorator, which resolves it from the request and declares the security requirement on the operation. The authorization topic owns both halves.

Use the typed route, body, and parameter decorators. They are what makes the SDK and the OpenAPI document derivable from the signature.

A per-actor visibility rule lives in the provider's query, keyed by the actor the guard resolved, so three controllers calling one provider enforce one rule.

## After Changing An Endpoint

Regenerate the SDK. The tests and the frontend both import it, so an unregenerated change appears to work locally and fails on the next clean build.
