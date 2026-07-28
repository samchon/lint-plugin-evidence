# State

This document owns who holds which state, because most frontend defects are one kind of state copied into another.

## Four Kinds, One Owner Each

| Kind | Owner | Examples |
| --- | --- | --- |
| server cache | the query library, keyed in `hooks.ts` | catalog, cart, orders, session |
| location | the URL | filter, sort, page, the open detail |
| form | the form, until submit | field values, dirty flags |
| ephemeral UI | the component | an open menu, a hover, a tab |

**Never copy one kind into another.** `useState` seeded from query data is the canonical version: the copy goes stale the moment the cache updates, and the screen shows data the server no longer has. Read from the owner every time, and when the shape is wrong, derive it in render.

The same rule places any new piece of state. Ask what it must survive: a reload keeps the URL and the server, and loses the rest. A filter that dies on reload is in the wrong bucket.

## Server State Is A Cache With A Price Per Kind

`staleTime` is a statement about what a stale read costs, so it is set per data kind rather than globally.

| Data | Policy |
| --- | --- |
| catalog, listings | tens of seconds stale is invisible; refetch on key change only |
| a detail someone may edit | fresh on focus, because someone else may have moved it |
| cart, session, wallet | always fresh: stale here shows the wrong money or the wrong person |
| static configuration | effectively never stale |

Invalidation after writes stays the primary mechanism; `staleTime` only decides how much drift a read-only view tolerates between them.

## Derived State Is Computed, Never Synced

```tsx
// Wrong: a second copy, one render behind, forever.
const [total, setTotal] = useState(0);
useEffect(() => setTotal(sum(items)), [items]);

// Right: derive in render.
const total = sum(items);
```

**An effect that only calls a state setter is a copy machine.** Effects exist for the world outside React: subscriptions, imperative widgets, the DOM. Data computable from existing state is computed where it is used, and the lag-one-render class of bug leaves with the copies.

## Optimistic Updates Only Where Rollback Is Honest

Flip the cache before the server answers only when the failure story is truthful: a favorite toggle, a quantity stepper, a read marker. The rollback restores exactly what was there, and the user loses nothing but the illusion of a saved click.

Never for anything that mints identity or money server-side. An order that appears in the list and vanishes on failure is worse than a spinner, because the user saw it exist.

The mutation shape: snapshot and apply the flip in `onMutate`, restore the snapshot in `onError`, invalidate in `onSettled` so the truth wins either way.

## Races Are Solved By Keys, Not By Flags

Two searches in flight resolve out of order, and whichever returns last paints the screen. The query library solves this when the parameter is in the key, because a response for a key you have left is discarded.

So the rule is structural: **data fetching lives in keyed hooks, never in a hand-rolled effect.** The hand-rolled version reintroduces the race and then grows an `ignore` flag to patch it. Debounced search debounces the value feeding the key, and cancellation comes free.
