# Screens

This document owns what a screen is and what it owes. A screen is a route's page component in its domain folder, `src/components/<domain>/<name>-page.tsx`, beside the sub-components only it uses.

## A Screen Traces To A Requirement

Before building anything, write a screen plan in `packages/frontend/wiki/screen-plan.md`: for each screen, the requirement it serves and the operations it consumes.

A screen with no requirement is a feature someone invented. A requirement with no screen is a requirement that was built into the backend and never delivered. Both are findings, and the plan is what makes either visible before the work is done rather than after.

## Born A Stub, Cracked One By One

A screen is declared before it works: the page component and its sub-components with their props enumerated, the contract JSDoc, an implementation-pending sentence naming what the screen still owes, and a placeholder body. Enumerating the props first is the design act, and the stub is what the route table mounts, so the whole surface navigates before any screen is real.

```tsx
/**
 * The seller's own sales, filtered and paged.
 *
 * Implementation pending: crack against useCatalog once lib/shopping lands;
 * add every state, gallery rows, and the filter in the URL.
 */
export function CatalogPage(props: { sellerId: string }) {
  props;
  return <Skeleton className="h-64 w-full" />;
}
```

The bare `props;` mention keeps the enumerated props from reading as unused while nothing consumes them, the same convention the backend stubs use, and the skeleton return is the whole placeholder body.

Crack one screen at a time against simulation for contract-generated success responses and against gallery fixtures for named UI states. Drive both through an available interactive browser tool so the states are seen rather than imagined, and record the fallback when no such tool is available. A screen is cracked when every state renders, its real hooks and gallery rows exist, and its implementation-pending sentence is gone.

A screen that needs an operation the SDK does not expose reveals a gap in the API contract. Send it back there. Do not improvise a frontend-only path around it.

## Walk The Journey, Not The Endpoint

Read the requirement for a workflow before building its screen, then walk the journey the document describes end to end as the actor performing it.

What does the user see before acting? While the request is in flight? When it succeeds? When it is refused? A screen that renders the data but offers no path to the action the requirement names does not satisfy it, and it will pass every check that only looks at whether the data appears.

The journey matters more than the screen. A flow whose every step works individually can still be impossible to complete in sequence: a value the next step needs is never shown, an actor loses their session halfway, a confirmation leaves the user somewhere they cannot continue from. Only performing the whole journey finds those.

## What A Screen Looks Like

A route component reads its data through a hook, branches on the states, and composes primitives.

```tsx
export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const { data, isPending, error, refetch } = useCatalog(params.toString());

  if (isPending) return <CatalogPageFallback />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (data.products.length === 0)
    return <EmptyState message="No product matches this filter." />;

  return (
    <div className="grid gap-4">
      <CategoryTree
        nodes={data.categories}
        current={params.get("category")}
        onSelect={(value) => setParams(next(params, "category", value))}
      />
      {data.products.map((product: ProductCardView) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

function CatalogPageFallback() {
  return <Skeleton className="h-64 w-full" />;
}
```

Read what that shape enforces. The four states are branches at the top rather than conditions scattered through the markup, so none can be forgotten silently. The sub-components take view models as props and fetch nothing. Filter state lives in the URL, so a filtered view is a link someone can send.

Sub-components used only by this page live in this file or beside it in the same domain folder, not in a shared folder pretending to be reusable.

## Every State Is Owned

A screen is not the success case with the rest deferred. Each one handles all five:

| State        | What it owes                                               |
| ------------ | ---------------------------------------------------------- |
| loading      | something that says work is happening, not an empty frame  |
| empty        | the difference between "nothing yet" and "nothing matched" |
| error        | what failed, in words the user can act on                  |
| retry        | a way back that does not require a reload                  |
| invalidation | fresh data after a mutation that changed it                |

The error state is where the requirement usually is. Every rejection the contract states has a visible outcome, and the business rules say what that outcome means. A screen that shows a spinner forever when a request fails is a defect no requirement had to state.

Empty and error are different, and conflating them tells the user their search matched nothing when the request actually failed.

## Preserve What The Contract Says

Nullable and union states come from the contract and mean something. A field the contract says can be absent is absent for a reason the requirements usually state, and rendering a placeholder in its place discards that meaning.

When a value genuinely is not available, say so rather than inventing one. A summary endpoint that does not carry a timestamp is not a reason to fabricate a timestamp; the screen says the timestamp is unavailable, and the architecture note records why.

## Responsive Is Not Optional

The interface works on mobile, tablet, and desktop. Build from real parts: lists, tables, forms, detail views, dialogs, pagination.

Keep the layout content-first and readable, and avoid decoration that costs clarity. [design.md](design.md) owns the dials and the customized primitives that keep even a plain product interface from shipping as library defaults; if the existing product already has a clear visual style, follow that instead.

## Authorization Shapes The Interface, It Does Not Enforce It

Hide or disable a command the current actor cannot use, because showing it is a usability failure. Then keep the denial path anyway.

The server is authoritative and can still refuse: a session goes stale, a role is revoked, ownership changes between the render and the click. An interface built on the assumption that a hidden button is security will show an unhandled failure the first time any of those happens.
