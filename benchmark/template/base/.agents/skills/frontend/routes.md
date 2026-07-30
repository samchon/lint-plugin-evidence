# Routes

This document owns navigation: guarding, returning, splitting, and what a route change owes the person making it. The route table lives in `src/App.tsx`.

## Guarded Layouts, Not Guarded Pages

Auth-required screens live under one layout route that reads the session state and decides once.

```tsx
function ProtectedLayout() {
  const session = useSession();
  const location = useLocation();
  if (session.status === "unknown") return <AppSkeleton />;
  if (session.status === "anonymous")
    return <Navigate replace to="/login" state={{ from: location }} />;
  return <Outlet />;
}
```

This is the three-state rule from [session.md](session.md) made structural: the unknown state renders a skeleton instead of bouncing a signed-in user, and every page below the layout stops asking. A guard repeated per page is the guard someone forgets on the eleventh page.

## Redirect After Login Actually Returns

The guard recorded where the user was going; the login success reads it back.

```ts
const from = readReturnLocation(location.state) ?? "/";
navigate(from, { replace: true });
```

The typed helper validates the stored location and preserves its pathname, query, and hash. Without that state, "we will send you back" is a lie, and every session expiry costs the user their place. [session.md](session.md) owns preserving the typed work; this is the mechanism that preserves the route.

## Router 404, API 404, And 403 Are Different States

**A router 404** is a client path that resolves to nothing: the catch-all route, offering the way home.

**An API 404** means the requested resource is missing or deliberately invisible to this actor. Render that result in the screen that made the call.

**An API 403** is a real operation or resource the server refused without hiding it. Render the denial in place, on the same URL. Navigating away throws out the address the user could retry after signing in with the right account, or hand to someone who has the authority.

Classify API failures from the response, not the route table.

## Split At Route Boundaries, Nowhere Smaller

Each route component loads lazily, so a visitor pays for the screen they open and not for the admin console.

That is the whole code-splitting policy. Splitting below the route line buys spinners inside interactions, and what a route drags into its chunk is a review question, not a lazy-loading question.

## A Route Change Owes Focus And Scroll

On a push, scroll to the top and move focus to the new screen's heading; on a back navigation, restore the scroll position the user left. One component beside the router owns both.

Without the focus half, a screen-reader user navigates and hears that nothing happened. Without the scroll half, the next page opens wherever the last one ended, which reads as a rendering bug.
