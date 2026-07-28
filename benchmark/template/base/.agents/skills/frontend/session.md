# Session

This document owns what the interface does about who the user is: signing in, staying signed in, losing it, and what every other screen is allowed to assume.

The backend decides authority. This layer decides what a person sees while that is being decided, and what they see when it changes underneath them.

## The Connection Holds The Session

There is one connection per actor, and authenticating means calling a lifecycle accessor with it. [sdk.md](sdk.md) owns why nothing writes the header by hand.

What belongs here is everything around that call.

**Persist the issued token, and restore it at startup.** Without that, every reload signs the user out, which reads as the product losing their work. Restoring means putting the stored token back on the connection before the first query runs, so no screen ever renders in a state the user did not choose.

**Store what the response gave you, not a shape of your own.** The authorized response declares what a session is; a hand-rolled object beside it is a second definition that drifts and cannot be re-validated.

## Three Identity States, Not Two

An interface that branches on signed-in or signed-out is wrong for the first paint.

| State | What the screen shows |
| --- | --- |
| unknown, still restoring | the shell, and a skeleton where identity-dependent content goes |
| resolved and anonymous | the public view, with the sign-in path visible |
| resolved and authenticated | the actor's view |

**Rendering the anonymous view during the unknown state is the defect to avoid.** It flashes a signed-out header at a signed-in user on every load, and worse, a screen that redirects on anonymous will bounce them out of the page they opened.

## Expiry Arrives As A Refusal, Not A Timer

A session ends when the server says so. The interface does not count down, does not decode the token, and does not decide expiry on its own; [testing.md](../backend/testing.md) covers why token contents are not part of the contract.

So the flow is: a call is refused, the interface refreshes once, and either the retry succeeds or the session is genuinely over.

**One refresh attempt per failure, not a loop.** A refresh that itself fails means the session is gone, and retrying that is how an interface hangs on a spinner forever.

**When the session is over, say so and keep the user where they are.** Preserve the route and whatever they had typed, so signing back in returns them to the work rather than to the home page. A silent redirect looks like the product crashed.

## Authorization Shapes The Interface And Does Not Enforce It

Hide or disable what the current actor cannot do, because offering an action that will be refused is a usability failure. Then keep the refusal path anyway.

The server is authoritative and can refuse a control the interface chose to show: a grade is revoked, ownership changes, a session goes stale between the render and the click. [screens.md](screens.md) owns that rule; the part that belongs here is that **grade is read per request on the server**, so a promotion takes effect on the next call and the interface should reflect it after the next fetch rather than requiring a sign-out.

## Sign-Out Is A Client Action

Authentication is stateless: signing out means the client disposes of its token and clears the cached queries that belonged to that actor.

**Clearing the cache is the half that gets forgotten.** A new actor signing in on the same device sees the previous one's cart, orders, and profile until something invalidates them, which is a data leak with a friendly appearance.

If the contract exposes a session-revocation operation, that is an ordinary endpoint over the session resource and calling it is a separate decision from disposing of the local token.
