# Authorization

Read [SKILL.md](SKILL.md) first. This document owns identity, sessions, and every check that decides whether a caller may do something.

`docs/analysis/01-actors-and-auth.md` is the specification for all of it. Read that document before designing any of the storage below.

## Authentication Is Not Authorization

A valid session proves who the caller is. Grade, membership, ownership, approval state, and row scope prove whether the caller may perform this behavior. Implement both, and never let one stand in for the other.

- A valid token is not ownership.
- A default role is not membership in a scope.
- A membership row is not approval state.

Collapsing these into one check is the defect that produces an API which looks authorized and is not.

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

A grade-management operation writes to the target user named by the path, not to the caller, and it verifies that the caller may remove the target's current grade before assigning a lower one.

## Scoped Authority

An actor grade and a role held inside an organization are different mechanisms, and confusing them produces a permission that is either far too broad or unenforceable.

A grade is global to the identity. Making `financeManager` a grade grants finance authority in every organization that identity ever enters. When the requirements say authority is held _within_ an organization, model it as a membership row: `{prefix}_{scope}_members` with required foreign keys to the scope and the actor and a unique constraint on the pair. When one member may hold several roles at once, put the roles in a child table rather than one column.

The active scope comes from the session, not from the request body. A body-supplied scope lets a caller name a scope their session never selected and gives every read filter two sources of truth. Persist the selection on the session row and write it through an explicit scope-switch operation.

A scoped guard runs in the provider: load the session, resolve its active scope, read the caller's membership for that scope, expand whatever role inheritance the requirements define, end in `403` when the required role is absent, and filter every read and write by that same scope.

Scoped roles need endpoints of their own. Without operations that grant them, nobody can hold the role and every rejection that depends on it is unreachable.

## Ownership

Derive the owner from the resource's own owner column, never from caller-supplied input. Select that column directly rather than nesting the relation for it.

```ts
const record = await MyGlobal.prisma.sales.findFirstOrThrow({
  where: { id: props.id },
  select: { id: true, seller_id: true },
});
if (record.seller_id !== props.seller.id)
  throw ErrorProvider.forbidden("Only the owning seller may edit this sale.");
```

The narrow `select` is deliberate. This read exists to answer one question, and loading the full row here invites building the response from it, which then omits everything the response select would have fetched.

When per-resource permission is a role held through a relationship table, **the resource owner holds that permission inherently**:

```ts
const permitted: boolean =
  record.owner_id === caller.id ||
  (await MyGlobal.prisma.memberships.count({
    where: { resource_id: record.id, actor_id: caller.id },
  })) !== 0;
if (!permitted) throw ErrorProvider.forbidden("Not a moderator of this resource.");
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

Each actor gets a parameter decorator that does two things at once, and both halves are load-bearing.

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
    SellerProvider.authorize(ctx.switchToHttp().getRequest()),
  )(),
);
```

The parameter decorator resolves the actor from the request and hands it to the handler, so the route cannot run anonymously. The `SwaggerCustomizer` call declares the bearer scheme on that operation, so the published document says a token is required.

**A decorator that authorizes without declaring produces an API whose documentation lies.** Consumers read the generated SDK and the OpenAPI document, not the decorator, so an undeclared requirement is invisible until a call fails in their integration.

The decorator is wrapped in a deferred singleton because the framework's factory must be invoked once, not once per decorated parameter.

The route declares who may reach it. The provider owns everything the route cannot express: which rows this caller may see, whether they own this one, whether the scope permits it, whether the current state allows the transition.

The provider owns everything the route cannot express: which rows this caller may see, whether they own this one, whether the scope permits it, whether the current state allows the transition.

Never accept caller identity from the request body or the path when it should come from the session. An actor-scoped listing takes its actor from the session; an actor id in the path is an authorization hole with a convenient name.

## Credentials

A credential column never appears in a response. A plaintext password appears only in a credential-input body, where it maps to the stored hash as a transformation.

Load the account with the hash column and guard the nullable result before verifying. A missing account is a `404`; a wrong current password is a `403`. Use the project's hashing helper rather than inventing one.

Do not treat merely sensitive data as a credential. Whether it is exposed is an authorization decision, and hard-excluding it hides an ordinary field the requirements may need visible.
