# DTOs

Read [SKILL.md](SKILL.md) first. This document owns the data transfer objects: where they live, what they are named, what each variant means, how every property earns its place, and how relations are shaped.

A DTO is a published contract. It reaches consumers who never open this repository, and changing it later breaks them.

## They Live In The API Package

**Declare every DTO under `packages/api/src/structures`, never inside `packages/backend`.**

```
packages/api/src/structures/
  common/
    IPage.ts
    IDiagnosis.ts
  shoppings/
    sales/
      IShoppingSale.ts
      IShoppingSaleSnapshot.ts
```

The backend imports its own request and response types from that package, which reads backwards until you see why: **the contract belongs to the SDK, and the server is one implementation of it.** A type declared inside the backend is a type consumers cannot import, so the first client to need it copies it, and the copy is what drifts.

Mirror the route and domain structure in the folder layout, one file per root type, named for the type it declares.

## Everything Is Exported From The Index

A type that is not reachable from the package entry does not exist for a consumer.

```ts
// packages/api/src/structures/shoppings/sales/index.ts
export * from "./IShoppingSale";
export * from "./IShoppingSaleSnapshot";
```

```ts
// packages/api/src/structures/index.ts
export * from "./common";
export * from "./shoppings";
```

Every folder re-exports its children, and the package entry re-exports the whole tree. Add the export in the same edit that adds the file: a type present in the tree and absent from an index compiles here, fails to import there, and the failure surfaces in the frontend rather than where it was caused.

## Contract Direction

An interface DTO describes only what this backend exchanges with **its own clients**: what a caller sends, what the backend returns, and the body an external system posts to a webhook this backend exposes.

The request this backend sends to a payment gateway, a mail provider, or a tax authority, and that provider's response, are **not DTOs**. They are internal types owned by the outbound client inside the backend package. Clients receive the domain row this backend recorded, such as a payment or a dispatch attempt, not the provider's wire shape.

No check can tell an outbound provider type from a legitimate computed DTO by looking at it. Authoring one publishes it in the OpenAPI document, generates it into the SDK, ships it to browsers, and then leaves it flagged as unused, which pressures someone into adding an endpoint that proxies the provider.

Decide by direction before the type exists, not by whether its mapping passes.

## Naming

Form the root from the table name: keep every word including the service prefix, PascalCase, singularize, prefix `I`.

| Table | Wrong | Right | Problem |
| --- | --- | --- | --- |
| `shopping_sales` | `ISale` | `IShoppingSale` | dropped the prefix |
| `bbs_article_comments` | `IBbsComment` | `IBbsArticleComment` | dropped an intermediate word |
| any | `IShoppingSaleICreate` | `IShoppingSale.ICreate` | missing the dot; that type does not exist downstream |

Variants attach with a dot. A multi-item response wraps the item type in the shared generic instead of gaining a name of its own: `IPage<IShoppingSale.ISummary>`.

Do not pluralize an interface name or invent a pagination variant of your own.

## Variant Meaning

| Variant | Contains |
| --- | --- |
| base | the full read shape |
| `.ISummary` | the list-item projection, list-friendly |
| `.ICreate` | caller-supplied creation fields, no ids and no timestamps |
| `.IUpdate` | the mutable fields |
| `.IRequest` | search, filter, pagination, and sort controls |
| `.IInvert` | the view from the opposite relation |
| `.IJoin`, `.ILogin`, `.IRefresh` | credential and session-context input |
| `.IAuthorized` | the actor plus the issued token |

A mutable state property such as a published flag or a small status enum stays in `.IUpdate` unless an accepted transition operation already owns the change. Excluding it because such an operation might be added later leaves the state unreachable through the API forever.

If a `.ISummary` contains a pagination property, it was shaped as a page rather than an item. Rebuild it from the entity's own fields, because the page wrapper is generated.

## Every Property Has A Source

This is the rule the rest of the document serves. Build the property list outward from the database model: every property either maps to a real column, or justifies itself in its description as a computed value or a request control. A property carrying a nested object maps to the foreign key column that reaches it, because that column is what has to exist for the join to be possible.

**A property with neither is a phantom.** It compiles, it reaches the provider, and there is nothing to fill it with.

Run this before declaring a property computed:

1. check the column list of the model this DTO represents;
2. check the foreign key columns that reach the models it joins;
3. verify the stated derivation uses only columns that exist.

A description saying a column "needs to be added" or is "pending migration" means the property is not ready to design. Add the column first.

The inverse mistake is describing a property as computed when the schema already stores it.

Properties that legitimately have no stored source: the pagination and search controls in a request variant, the connection context in a join or login variant, aggregate counts in a read variant, and the issued token in an authorized variant.

A password is not one of them. It maps to the stored hash column as a transformation.

## Types, Nullability, Formats

Map a column to the type and format it actually has. Discarding a format turns a semantic column into a bare string, and every consumer then accepts anything.

| Column          | Property                       |
| --------------- | ------------------------------ |
| uuid            | string with `uuid` format      |
| datetime        | string with `date-time` format |
| decimal, double | number                         |
| int             | integer                        |
| boolean         | boolean                        |

**Decimal exactness stops at the contract boundary.** Storage and provider arithmetic stay exact; the wire carries a number. State the currency and the business scale in the description so clients format and compare at that scale, expose the currency code as its own property, and for a cross-currency row expose the posting rate and the converted amount as separate properties.

**A stored calendar date crosses as a date-time at UTC midnight**, and the description says so, so clients compare and render by the date part without a local-time shift. Use a bare date format only for a genuinely computed bucket such as a report month, and name its derivation and timezone.

**Nullability has direction.** A nullable stored value stays observable in every response-reachable variant. A request-only variant may require a present value for the same column.

A non-null column may intentionally map to a nullable property, especially where the database supplies a default. Do not reverse that decision merely to mirror the column.

A column that becomes nullable only when a later transition clears it, but is always set at creation, is **required and non-nullable in `.ICreate`** and nullable in the read and update variants. Decide from the documented creation semantics, not from the column's name.

## Enums Are Narrowed Only From A Structured Owner

Narrow to a closed set of literals when the requirements or another structured owner defines a closed, caller-visible domain. Otherwise keep the value a free string.

**Vocabulary alone does not create a closed set.** A property named `status`, `state`, `role`, `level`, `visibility`, `direction`, or `type` is not thereby an enum, and an upstream or provider value with an open domain stays a string.

Descriptions are documentation, not declarations. Wording such as "allowed values" and any list in prose creates nothing.

The same logical enum on several DTOs shares one literal set. Casing drift between `"pending"` and `"Pending"`, or a member present in one place and missing in another, is a defect.

**Group enums by meaning, not by property name.** A status on an order and a status on a user are usually different enums. When uncertain, keep them separate: an incorrect merge corrupts a contract, while a missed merge only duplicates a definition.

## Tagged Unions

Use a discriminator only on a union whose members are named object references. Every member declares the discriminating property, lists it as required, and gives it a string schema, with exact constants when the domain is closed.

Add an explicit mapping whenever a payload value differs from its type name. A mapping cannot introduce a type absent from the union beside it.

## Relations

Classify the edge before shaping it. The classification decides the shape on both sides.

**Composition.** The child is managed through the parent's lifecycle and cannot exist first. Nested object or array in reads; nested `.ICreate` in requests.

**Association.** The target is an independent entity that already exists. A reference to its `.ISummary` in reads; a raw identifier in requests.

**Aggregation.** Event-driven rows created later by other people: comments, votes, logs. Do not embed them. Expose a count and give the collection its own endpoint.

| Context | Shape | Why |
| --- | --- | --- |
| response, the reader needs the related entity's display data | reference to the target or its `.ISummary` | saves a second fetch; the transformer joins it |
| response, the reader only correlates | scalar identifier | a full object bloats every row |
| create or update, association to an existing row | scalar identifier | nested objects invite phantom writes |
| create, composition child owned by this lifecycle | nested `.ICreate` reference | the child cannot exist first |

**Foreign key naming changes with direction.** A response drops the `_id` and uses the relation name, so `author_id` becomes `author` mapped through the relation. A request keeps the camelCased identifier, so `authorId` maps through the column.

An optional one-to-one composition child in a create or update is the child's `.ICreate` or null. A required one is a bare required reference. A required one-to-many array carries a minimum length of one.

When the target has a unique business code, prefer that code over the internal identifier in request references. Callers hold business codes; they do not hold internal identifiers.

Do not expose both the scalar identifier and the relation object for the same edge without saying why in the description.

**Cross-type circular references make generation impossible.** A self-reference remains legitimate for a tree.

## Snapshots

A current-entity read variant represents its current version as a nested snapshot property named exactly `lastSnapshot`. It is singular and never an array.

The plural array is full version history. Reserve it for an explicit history endpoint rather than embedding it on the current entity.

A retained snapshot of a **different** entity is not `lastSnapshot`. Name it after that entity, such as the product snapshot an order item captured at purchase time.

Request variants omit snapshot objects unless the operation writes the snapshot family in the same transaction.

## Actors, Sessions, And Credentials

The actor is who; the session is how they connected.

**A credential column never appears in a response variant.** A password hash, a persisted reset or verification token, and an external secret are excluded even though the database stores them. A plaintext password appears only in a credential-input variant.

Merely sensitive data is not a credential. Whether it is exposed is an authorization decision, and hard-excluding it hides a field the requirements may need visible.

**The issued token lives only in `.IAuthorized`**, returned once at join, login, or refresh. The authorized variant carries the actor's identifier and that token, and nothing else: no session fields, no stored token.

**Session context follows a fixed matrix.** The connection address, the referring page, and the origin are optional in join and login, because a server-rendered client cannot know its own address and the provider falls back to what it observed. They are required on a session read variant, because the stored value exists. They are absent from the actor variant, the authorized variant, and the refresh variant.

A refresh variant carries exactly one non-null string property holding the refresh token. An anonymous actor still submits it: credential-free does not mean tokenless.

## Descriptions Are The Published Reference

Every DTO and every property carries a description, and it is rendered into the API documentation.

The root description says when the DTO is used and what boundary it represents. A property description says what the value means to the caller, where it comes from, why it may be absent, and any security implication.

A label is not a description. `/** The name. */` on a property called `name` publishes nothing.
