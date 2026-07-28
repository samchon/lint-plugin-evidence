# Authorization

This document owns identity, sessions, and every check that decides whether a caller may do something.

The requirement documents under `docs/analysis/` are the specification for all of it: which actors exist, what each may do, and which flows persist anything. Find the sections that state those and read them before designing any of the storage below.

## The Actor Narrows At Every Layer

An authenticated caller crosses six steps, and it carries less at each one. Read this before the rest of the document, because every rule below is about one step of it.

| Step | What holds the actor | Why that type |
| --- | --- | --- |
| the request | a bearer token in a header | nothing has been resolved yet |
| the decorator | `@SellerAuth()` on the route parameter | it calls the authorize provider and declares the security requirement on the operation |
| the controller method | `seller: SellerPayload` | the route needs to know who, and nothing more |
| the provider | `props.seller: SellerPayload`, or `props.actor` typed as a union | the business rule branches on `type` and reads `id` |
| the collector | `seller: IEntity` | it only connects a row, so it takes the identifier and not the identity |
| the transformer | nothing | it maps a row that was already selected under the caller's visibility rule |

**The narrowing is the design, not an accident.** Each layer takes the least it can do its job with, so a change to what authentication carries stops at the layer that reads it. Widening any step is what makes an actor's shape a dependency of code that never asked who the caller was.

Two steps are worth reading twice.

**The collector takes `IEntity`, not the payload.** A collector writes `connect: { id }`, so the identifier is the whole of what it needs. Handing it the payload gives it a `session_id` and a `type` it will never read, and the next person to edit it will reasonably assume those are there because something uses them.

**The transformer takes no actor at all.** Which rows this caller may see was decided by the provider's visibility clause before the query ran. A transformer that re-checks the caller is enforcing a rule in a second place, and the two will disagree.

One naming collision is worth knowing before it confuses you. A transformer declares a type called `Payload`, and it is the shape of a selected database row, unrelated to the actor payloads here. The actor ones always carry the actor's name: `SellerPayload`, `CustomerPayload`.

## Authentication Is Not Authorization

A valid session proves who the caller is. Grade, membership, ownership, approval state, and row scope prove whether the caller may perform this behavior. Implement both, and never let one stand in for the other.

- A valid token is not ownership.
- A default role is not membership in a scope.
- A membership row is not approval state.

Collapsing these into one check is the defect that produces an API which looks authorized and is not.

## What Is An Actor, And What Is Only A Role

Getting this wrong produces duplicate account tables and authorization nobody can enforce, so decide it before designing any storage.

**An actor is a distinct authentication identity with its own account lifecycle.** Owner, manager, staff, moderator, and auditor are almost never actors: they share one account table, one set of credentials, and one session lifecycle, so they are grades inside one actor.

Split actors only where the requirements give genuinely separate join, login, credential, and session lifecycles.

**An anonymous visitor is an actor, not the absence of one.** It owns an account row and a session row so the server can keep connection context and continuity, and it simply has no credentials. A _public_ operation is the different thing: no actor, no session, nothing established. Do not use the anonymous actor as a synonym for public.

**A product with no credentialed identity declares no actor.** Never fabricate a login, an account table, or a default grade to fill a gap the requirements did not describe.

**A principal that never authenticates is not an actor.** A scheduled job or a background integration performs real work and audit rows must attribute it, but declaring it an actor forces an account table, a session table nothing writes, and a publicly attemptable credential endpoint. Keep the fact instead: give it an ordinary domain table that audit rows reference, and let a provider name it by looking it up.

## Roles Are Global Grades, And Two Things Look Like Them

A role is a grade held **identically everywhere that identity goes**. Test every candidate against that sentence, because two common cases fail it.

**Per-record authority is not a role.** Project owner, article author, store manager, ticket assignee: these are relations in the database and checks in the provider, not grades in the actor graph.

**Scope-relative authority is not a role either**, and this is the subtler one. A grade someone holds inside one organization and not another is not global. Making `financeManager` a grade grants finance authority in **every** organization that identity ever enters. It belongs in a membership table.

## Reaching A Grade

A grade is reachable exactly three ways, and a graph that provides none of them promises an authority nobody can hold.

1. It is the baseline given at registration.
2. A holder of a granting grade assigns it.
3. A business operation confers it: creating a resource makes you its owner.

**Granting is authority over other users, so it never creates the first holder.** If the only path to a grade is that someone who already has it grants it, nobody ever has it. Decide the bootstrap explicitly.

When recording what a grade may grant or remove, name the role **actually added or removed**, not the target's role before the change or the one they keep afterwards. If promoting an administrator means assigning them the top grade, the grant edge names the top grade. Naming the administrator grade there reverses the meaning.

Set the removal edge explicitly whenever it differs from the grant edge. Add-only moderation grants a moderator grade and revokes nothing.

## Storage

Every actor gets an account table and a sessions table.

| Actor kind | Stores |
| --- | --- |
| anonymous visitor | an identity-only account with no credential columns, plus its sessions |
| member | an account with credentials, plus its sessions, plus whatever flows the requirements name |
| administrator | the same shape, plus whatever elevated audit the requirements name |

Name them `{prefix}_{actor}s` and `{prefix}_{actor}_sessions`, with support tables as `{prefix}_{actor}_{purpose}`.

Create a password-reset, email-verification, or external-connection table only when the requirements name that persisted flow. Resembling a common authentication pattern is not a reason. Changing a password after supplying the current one persists nothing and needs no support table.

An anonymous visitor is stateful but credential-free: it owns an account row and a session row and never gains a password, a login operation, or a business grade.

A separate administrator account exists only when the requirements describe an elevated actor with its own identity and login lifecycle. When elevation is a grade or a title held by an existing actor, keep that identity and add an authority table instead of a second credential account.

Business, organizational, and approval profiles belong to their own domain. Authorization references them and does not duplicate them.

## Roles

When an actor declares grades, persist each user's current grade in exactly one store: a column on the actor table, or an actor-owned assignment table. This holds even when the actor declares only one grade.

At registration the server writes the default grade the requirements state. The caller never selects their own authority. Any grade above the default requires an explicit grant or approval operation.

An assignment history table preserves change over time. It never replaces the current store, and a reader must never have to reconstruct the present from the history.

A grade-management operation writes to the target user, never to the caller, and it verifies that the caller may remove the target's current grade before assigning a lower one. The target is named the way [controllers.md](controllers.md) requires: an existing assignment record by its own bare `id`, and a new grant by a target user id in the request body. It is never a path segment, because the actor in the path is the caller.

## Scoped Authority

An actor grade and a role held inside an organization are different mechanisms, and confusing them produces a permission that is either far too broad or unenforceable. The grade half is decided above; this section is what to build once you have decided the authority is scoped.

Model it as a membership row: `{prefix}_{scope}_members`, with required foreign keys to the scope and to the actor, and a unique constraint on the pair.

When one member may hold several roles at once, the roles go in a child table rather than one column. A column forces every read to parse it and every write to rewrite the whole set.

The active scope comes from the session, not from the request body. A body-supplied scope lets a caller name a scope their session never selected and gives every read filter two sources of truth. Persist the selection on the session row and write it through an explicit scope-switch operation.

A scoped guard runs in the provider: load the session, resolve its active scope, read the caller's membership for that scope, expand whatever role inheritance the requirements define, end in `403` when the required role is absent, and filter every read and write by that same scope.

Scoped roles need endpoints of their own. Without operations that grant them, nobody can hold the role and every rejection that depends on it is unreachable.

## Ownership

Derive the owner from the resource's own owner column, never from caller-supplied input. Select that column directly rather than nesting the relation for it.

```ts
const record = await MyGlobal.prisma.shopping_sales.findFirstOrThrow({
  where: { id: props.id },
  select: { id: true, shopping_seller_id: true },
});
if (record.shopping_seller_id !== props.seller.id)
  throw ErrorUtil.forbidden("Only the owning seller may edit this sale.");
```

The narrow `select` is deliberate. This read exists to answer one question, and loading the full row here invites building the response from it, which then omits everything the response select would have fetched.

When per-resource permission is a role held through a relationship table, **the resource owner holds that permission inherently**:

```ts
const record = await MyGlobal.prisma.shopping_sections.findFirstOrThrow({
  where: { id: props.id },
  select: { id: true, shopping_seller_id: true },
});
const permitted: boolean =
  record.shopping_seller_id === props.seller.id ||
  (await MyGlobal.prisma.shopping_section_moderators.count({
    where: {
      shopping_section_id: record.id,
      shopping_seller_id: props.seller.id,
    },
  })) !== 0;
if (!permitted)
  throw ErrorUtil.forbidden("Not a moderator of this section.");
```

Checking only the join table gives the legitimate owner a wrongful `403`. No happy-path test finds it, because the tests that exercise the resource are usually written as the owner, and the owner is exactly who it breaks for.

## Sessions And Tokens

A session row carries the actor foreign key, connection context, a non-null creation time, and a non-null expiry, with an index on the actor and creation time.

```prisma
model shopping_seller_sessions {
  id         String   @id
  seller_id  String
  /// Client address at connection time. Metadata, not a credential.
  ip         String
  /// Creation time of the session.
  created_at DateTime
  /// End of the window during which this session can still be refreshed.
  ///
  /// This is the refresh horizon, not the access-token expiry.
  expired_at DateTime

  seller shopping_sellers @relation(fields: [seller_id], references: [id])

  @@index([seller_id, created_at])
}
```

The session's expiry tracks the **refresh** horizon, meaning the window during which the session can still be renewed. It does not track the short-lived access-token expiry.

```ts
// WRONG: the session dies inside its own refresh window
expired_at: accessTokenExpiry,

// RIGHT
expired_at: refreshTokenExpiry,
```

Using the access expiry invalidates the session row while its refresh token is still valid, so every refresh after the first access window is wrongly rejected. The failure reaches users as being logged out for no reason, at an interval nobody connects to the code.

Issued tokens are returned in the response and are not session columns unless the requirements demand persisted tokens or revocation records.

Refresh must verify the token, confirm the named session still belongs to the actor, check the session has not passed its expiry, extend that same session to the new horizon, reload the actor, and issue tokens that retain the session identity. Renewing by creating a second session loses the continuity every session listing depends on.

## The Lifecycle Surface Is Exactly Three Operations

Join, login, and refresh. Nothing else is an authentication lifecycle operation.

**Actor kind fixes which three apply.** An anonymous visitor holds no credentials, so it gets join and refresh and no login. A member or an administrator gets all three.

**Logout is not an operation.** Authentication is stateless: the client disposes of its token. A route that "logs out" either does nothing the client could not do alone, or it is really a session-revocation operation, which is an ordinary endpoint over the session resource and should be named as one.

Everything else that feels like authentication is ordinary endpoint coverage over its own resource:

- session listing and revocation;
- password change, and a password-reset request record;
- account withdrawal;
- verification requests;
- external identity connections.

Give each of those a resource-shaped path of its own rather than filing it under an authentication prefix. They have their own schemas, their own lifecycles, and their own requirements.

**A grade that can be granted needs an endpoint that grants it**, and a grade that can be removed needs one that removes it. Without them the promised authority is unreachable and every rejection that depends on it is untestable. Address the assignment record by its own id, and put the target user in the request body rather than in a path segment.

## Where Each Check Lives

Each actor gets a payload type, an authorize provider, and a parameter decorator.

The payload is what a route receives, and it is deliberately small.

```ts
export interface SellerPayload {
  id: string & tags.Format<"uuid">;
  session_id: string & tags.Format<"uuid">;
  type: "seller";
}
```

Three fields, and each earns its place. `id` is the actor row. `session_id` is the session the token was issued for, which is what makes a per-session revocation check possible and what a session listing marks as current. `type` is the discriminant the authorize provider checks, so a token minted for one actor cannot pass as another.

Nothing else belongs here. A provider that needs the grade, the profile, or the membership loads it from `id`, because a route that carries them pays for that read whether or not it uses them.

```ts
export namespace SellerProvider {
  export async function authorize(props: {
    request: { headers: { authorization?: string } };
  }): Promise<SellerPayload> {
    const payload: SellerPayload = JwtUtil.authorize({
      request: props.request,
    }) as SellerPayload;
    if (payload.type !== "seller")
      throw ErrorUtil.forbidden(`Not a seller, but a ${payload.type}.`);

    const seller = await MyGlobal.prisma.shopping_sellers.findFirst({
      where: { id: payload.id, deleted_at: null },
      select: { id: true },
    });
    if (seller === null)
      throw ErrorUtil.forbidden("Not an active seller.");
    return payload;
  }
}
```

Both checks are needed. The token check proves the claim was minted for this actor; the row read proves the account still exists and has not been withdrawn, banned, or suspended. A token outlives the account it names, so verifying the signature alone authorizes a caller the requirements say is gone.

Every actor's authorize provider is that same shape, differing only in the discriminant it checks and the table it reads. The token half is shared: `JwtUtil` in `src/utils`, beside the other helpers that own no entity.

**The prefix is optional, and that is not leniency.** The generated SDK writes the bare token into the connection, while a browser tool or a curl command sends `Bearer <token>`. Requiring the prefix rejects every call the SDK makes, which is every test in the suite, and the failure reads as an authentication defect rather than a parsing one.

**It returns `unknown` deliberately.** The caller narrows to its own payload after checking `type`, so a token minted for one actor cannot be read as another's simply because the shapes happen to match.

**The catch returns one message for every failure.** Expired, forged, malformed, and wrong-secret are the same answer to a caller, and distinguishing them tells an attacker which half of the guess was right.

The decorator then does two things at once, and both halves are load-bearing.

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

const singleton = new Singleton(() =>
  createParamDecorator(async (_0: unknown, ctx: ExecutionContext) =>
    SellerProvider.authorize({ request: ctx.switchToHttp().getRequest() }),
  )(),
);
```

The parameter decorator resolves the actor from the request and hands it to the handler, so the route cannot run anonymously. The `SwaggerCustomizer` call declares the bearer scheme on that operation, so the published document says a token is required.

**A decorator that authorizes without declaring produces an API whose documentation lies.** Consumers read the generated SDK and the OpenAPI document, not the decorator, so an undeclared requirement is invisible until a call fails in their integration.

The decorator is wrapped in a deferred singleton because the framework's factory must be invoked once, not once per decorated parameter.

The route declares who may reach it. The provider owns everything the route cannot express: which rows this caller may see, whether they own this one, whether the scope permits it, whether the current state allows the transition.

Never accept caller identity from the request body or the path when it should come from the session. An actor-scoped listing takes its actor from the session; an actor id in the path is an authorization hole with a convenient name.

## The Grade Is Loaded, Never Carried

**The payload has no grade field, and that is deliberate.** A grade changes during a session and a token cannot, so a token that carried one would authorize the authority the caller held when they logged in rather than the one they hold now. A demotion would take effect at the next login, which is the wrong moment for every demotion that matters.

So a grade-restricted operation loads the current grade in the provider, from the store the schema declares, keyed by `props.actor.id`:

```ts
const seller = await MyGlobal.prisma.shopping_sellers.findFirstOrThrow({
  where: { id: props.seller.id },
  select: { grade: true },
});
if (seller.grade !== "manager")
  throw ErrorUtil.forbidden("Only a manager may suspend a sale.");
```

That read is one extra query on the operations that need it, and none on the operations that do not, which is the reason the payload stays small.

The division of labour is worth stating plainly, because both halves look like authorization and neither can do the other's job.

| Question | Answered by |
| --- | --- |
| is there a valid token, and is the account still active | the authorize provider, before the handler runs |
| is this actor the kind this route accepts | the decorator on the route |
| does this caller hold the grade this operation requires | the provider, from the current grade store |
| may this caller act on **this row** | the provider, from the row's own owner reference |

The last two are different questions and both are the provider's. A caller can hold the right grade and still not own the record, and a route that checks only the grade lets any manager edit any other manager's sale.

Writing a grade happens in exactly two places: registration writes the default grade the requirements state, and a grade-management operation writes the target user's. Never anywhere else, and never from a value the caller supplied.

## Credentials

A credential column never appears in a response. A plaintext password appears only in a credential-input body, where it maps to the stored hash as a transformation.

Load the account with the hash column and guard the nullable result before verifying. A missing account is a `404`; a wrong current password is a `403`. Verify through `PasswordUtil`, the one helper that knows the storage form, rather than calling a hashing library directly.

Do not treat merely sensitive data as a credential. Whether it is exposed is an authorization decision, and hard-excluding it hides an ordinary field the requirements may need visible.
