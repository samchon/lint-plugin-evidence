# Architecture

This document owns layering and where things live.

## There Is No Frontend Server

The frontend is a single-page application. It builds to static assets and talks to the backend through the generated SDK. That is the whole architecture.

Do not add a server tier, an API route layer, a backend-for-frontend, or a server-rendering framework. `packages/backend` is the server. A second one inside the frontend duplicates authentication, duplicates error handling, and puts business decisions in a place the backend's tests never reach.

## Call The SDK From The Screen That Owns The Workflow

```ts
import api, { IShoppingSale, IPage } from "{{apiPackageName}}";

const page: IPage<IShoppingSale.ISummary> =
  await api.functional.shopping.customer.sale.index(connection, {
    limit: 20,
  });
```

Keep the call visible at the call site, so the screen shows which operation, which DTO, which loading state, and which error path it owns.

Do not introduce a wrapper, service module, repository object, or command facade whose only purpose is to hide the generated SDK. That indirection buys nothing: the SDK is already typed, already named after the routes, and already regenerated when the contract changes. Hiding it behind a hand-written layer means the hand-written layer is what breaks instead, and it breaks silently.

Mapping a response into the shape a screen wants is fine when the same mapping is used more than once inside that screen. Keep it local to the screen, not in a shared layer that grows into a second contract.

## The Folder Layout

```
packages/frontend/
  index.html
  vite.config.ts
  playwright.config.ts
  scripts/
    run-playwright.mjs             one runner, several modes
  src/
    main.tsx                       entry
    App.tsx                        routes and the shell
    styles.css
    design.ts                      the three design dials
    components/
      app-frame.tsx                layout chrome shared by every route
      error-state.tsx              shared cross-domain pieces, at this level
      ui/                          primitives: button, card, input, select, skeleton
      providers/
        app-providers.tsx          every app-wide provider, composed here
      dev/
        gallery-page.tsx           every screen's states from fixtures, env-gated
      catalog/
        catalog-page.tsx           the route component AND its sub-components
      cart/
        cart-page.tsx
      orders/
        orders-page.tsx
        order-detail-page.tsx
    lib/
      config.ts                    the environment dials: apiHost, simulate
      utils.ts                     cn, formatCurrency, formatDateTime
      <domain>/
        types.ts                   view models the interface consumes
        hooks.ts                   queries, mutations, and the query keys
        fixtures.ts                view-model fixtures for the state gallery
        client.ts                  the shared connection and request helper
  tests/
    journeys/
      *.spec.ts                    one exported journey function per flow
    ui-review.spec.ts              presentation review, not a journey
    readme.spec.ts                 screenshot capture for the readme
  wiki/
    architecture.md                this project's stack, routes, choices
    screen-plan.md                 each screen, its requirement, its operations
    omissions.md                   what was deliberately left out and why
    verification.md                what was verified, when, and how
```

**There is no `pages/` folder.** A route component lives in the domain folder it belongs to, named `<domain>-page.tsx`, beside the sub-components only it uses. Splitting routes away from their parts means every feature edit touches two trees, and the sub-component that exists solely for one page ends up in a shared folder pretending to be reusable.

**Components split by domain, not by kind.** `components/cart` holds everything the cart renders. Do not create `components/forms` or `components/lists`: nobody looks for a cart control under "forms", and every domain then reaches into every folder.

Three things sit outside the domain folders:

- `components/ui` holds the primitives every domain composes. Nothing in here knows what the product is.
- `components/providers` holds the app-wide providers, composed in one file so the provider order is readable in one place.
- A genuinely cross-domain piece such as `app-frame.tsx` or `error-state.tsx` sits at the `components/` level. If two domains use it and it is not a primitive, it belongs here rather than in one of them.

**`lib/<domain>` is the interface's own vocabulary.** `types.ts` names view models for what a screen needs rather than what a table holds: `ProductCardView`, `CategoryTreeNode`, `OrderDetailView`. `hooks.ts` exposes the queries and mutations and owns the query keys.

`client.ts` holds **the connection object and nothing else**: built once from the configured host and simulation flag, authenticated by the lifecycle accessors, and exported for the hooks to pass. It is not a place to wrap a call. A function there named `get`, `post`, `request`, or `fetchProduct` is the hand-written layer [sdk.md](sdk.md) rules out, and it breaks silently where the accessor would have broken at compile time.

**Files are kebab-case**, exports are PascalCase. `catalog-page.tsx` exports `CatalogPage`.

**Import through the path alias.** `@/components/ui/card`, `@/lib/shopping/hooks`. A relative chain climbing three levels tells you the file is in the wrong folder.

**Tests live in `tests/` at the package root**, not beside components. Browser programs test flows rather than units, so they belong to the package.

**A file that would sit in two domain folders belongs in `lib`, `components/ui`, or the `components/` level.** Duplicating it into both is how two versions drift.

## Hooks Own The Keys, The Queries, And The Invalidation

Every key for a domain sits in one object beside its hooks, so invalidation is a lookup rather than a memory test.

```ts
const keys = {
  session: ["shopping", "session"] as const,
  catalog: (search: string) => ["shopping", "catalog", search] as const,
  product: (id: string) => ["shopping", "product", id] as const,
  cart: ["shopping", "cart"] as const,
  orders: ["shopping", "orders"] as const,
  order: (id: string) => ["shopping", "order", id] as const,
  wallet: ["shopping", "wallet"] as const,
};
```

The keys are `as const` and prefixed with the domain. The constant assertion is what makes a typo in a key a compile error instead of a query that silently never matches an invalidation. The prefix keeps two domains from colliding on a name as ordinary as `session`.

A parameterized key takes the parameter, so each distinct query caches separately. A catalog key that ignores the search string serves the first search's results to every later one.

```ts
export function useCatalog(search: string) {
  return useQuery({
    queryKey: keys.catalog(search),
    queryFn: () => fetchCatalog(search),
  });
}
```

A mutation invalidates **every** key that shows what it changed, not the obvious one.

```ts
export function useLogin(options?: UseMutationOptions<...>) {
  const queryClient = useQueryClient();
  return useMutation({
    ...options,
    onSuccess: async (data, variables, context, mutation) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.session }),
        queryClient.invalidateQueries({ queryKey: keys.cart }),
        queryClient.invalidateQueries({ queryKey: keys.orders }),
        queryClient.invalidateQueries({ queryKey: keys.wallet }),
      ]);
      await options?.onSuccess?.(data, variables, context, mutation);
    },
  });
}
```

Signing in changes the session, and it also changes whose cart, whose orders, and whose balance the interface should be showing. Invalidating only the session leaves the previous actor's data on screen, which looks like the login failed or, worse, like it succeeded as someone else.

Two mechanics matter. The invalidations are awaited together, so the screen re-renders once with everything fresh rather than flickering through partial states. And the caller's own `onSuccess` is forwarded after, so a screen can still react without the hook losing its invalidation.

Stale data after a successful action is the most common frontend defect and the least likely to be reported as one, because the interface looks like it worked.

## Errors

[errors.md](errors.md) owns failure end to end. The rule that survives here: handle it where the call is, and never build a generic error translation layer, because the contract already states which rejections exist and what each means.

## Routes Unwrap Parameters, Pages Take Typed Props

`App.tsx` holds the route table and a small wrapper per parameterized route. The wrapper reads the parameters, decides what to do when one is missing, and hands the page a typed value.

```tsx
function ProductRoute() {
  const { id } = useParams<{ id: string }>();
  return id ? <ProductDetailPage productId={id} /> : <Navigate replace to="/" />;
}

function CatalogRoute() {
  return (
    <Suspense fallback={<CatalogPageFallback />}>
      <CatalogPage />
    </Suspense>
  );
}

export function App() {
  return (
    <AppProviders>
      <AppFrame>
        <Routes>
          <Route path="/" element={<CatalogRoute />} />
          <Route path="/products/:id" element={<ProductRoute />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderRoute />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </AppFrame>
    </AppProviders>
  );
}
```

Three things here are the convention rather than the example.

- **A page never reads route parameters.** It takes `productId: string`, so it cannot be rendered without one and its type says so. The wrapper owns the missing case, once, where the route is declared.
- **A page that suspends exports its own fallback beside it**, so the skeleton and the screen it stands in for change together.
- **The catch-all route is declared.** Without it an unknown path renders nothing, which reads as a broken application rather than a wrong address.

## Providers Are Composed In One File

```tsx
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 20_000 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
```

**The client is created inside `useState` with an initializer**, not at module scope and not inline. Inline construction makes a new client on every render and silently discards the cache; module scope shares one client across every test in a run, so one test's cached data leaks into the next.

**State the defaults deliberately.** Refetching on window focus surprises a user mid-form. Retrying a mutation can submit twice. A stale time of zero re-requests on every mount. Each of those is a product decision, and leaving it to the library's defaults is still a decision, just an unexamined one.

## Structure Rules

- One route, one page component, in its domain folder.
- Components below a page are presentational and take their data as props. A component that fetches on its own makes the page's loading state unknowable and its errors unhandleable.
- Shared state that outlives a route lives in one provider, composed in `components/providers`, not in a context invented per feature.

## Scripts

```json
{
  "dev": "vite --host 0.0.0.0",
  "build": "rimraf dist && pnpm run lint && vite build",
  "preview": "vite preview",
  "lint": "ttsc -p tsconfig.json --noEmit",
  "format": "ttsc format -p tsconfig.json",
  "test:e2e": "node scripts/run-playwright.mjs e2e",
  "ui:review": "node scripts/run-playwright.mjs ui-review",
  "readme:screens": "node scripts/run-playwright.mjs readme",
  "playwright:install": "pnpm exec playwright install chromium"
}
```

**`lint` is one command because the compile is one pass.** `ttsc` emits type errors and lint diagnostics in the same stream and sums both into the exit code, so a separate `typecheck` script running stock `tsc` would report green over failures this project treats as errors. There is no `tsc` here and no separate lint invocation; the project skill owns why.

One runner with a mode argument beats several near-identical configurations. `build` runs `lint` before bundling, so a broken type or a lint failure stops the build rather than shipping.

## Record The Notable Choices

Keep `wiki/architecture.md` covering the stack, the environment variables, the routes, and the choices a reader would otherwise reverse-engineer.

The entries worth writing are the ones that look wrong without their reason:

- a call the interface deliberately does not make, because the server refuses it for this actor and the refusal is expected;
- a value the interface says is unavailable rather than inventing, because the endpoint does not expose it;
- a backend mechanic kept internal rather than surfaced as a control.

Each will look like an oversight to the next reader, and each will be "fixed" into a defect unless the note exists.
