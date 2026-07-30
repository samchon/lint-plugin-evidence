# Lists

This document owns the other half of a product's surface: search, filter, sort, pagination, and what a screen shows when a query returns nothing.

The contract already decided most of it. A listing operation takes `IExample.IRequest` and returns `IPage<IExample.ISummary>`, so the screen's job is to hold that request somewhere a user can share and to render that page honestly.

## The Query Lives In The URL

**Filter, sort, and page belong in the query string**, not in component state.

A filtered view is then a link. A user can send it, bookmark it, and reload it; the back button steps through what they actually did rather than dropping them at an unfiltered list. State that lives only in a component throws all of that away and is no simpler to write.

```tsx
const [params, setParams] = useSearchParams();
const { data, isPending, error, refetch } = useCatalog(params.toString());
```

The hook takes the serialized parameters as its key, so two different filters cache separately and the same filter reuses its result. [architecture.md](architecture.md) owns why a parameterized key must actually take the parameter.

## Build The Request From The Contract, Not By Hand

`IExample.IRequest` extends `IPage.IRequest` for `page` and `limit` and groups the filters under `search`. Read the type before writing the form that produces it: the sortable columns are a literal union, and the search shape is declared, so both are enumerable rather than guessable.

```ts
const body = {
  page: Number(params.get("page") ?? 1),
  limit: 20,
  search: {
    title: params.get("title") ?? undefined,
    section_codes: params.getAll("section") ,
  },
  sort: ["-sale.opened_at"],
} satisfies IShoppingSale.IRequest;
```

**An absent filter is `undefined`, never an empty string.** The empty string is a real input whose predicate-specific meaning may differ from absence. Preserve the distinction declared by `?: null | T` instead of sending a value when the user cleared the filter.

**Sort is `"+field"` and `"-field"` tokens in priority order**, and the fields come from the declared union. Do not build a `sortBy` plus `sortOrder` pair in the interface and translate: two controls can disagree, and the contract has one.

## Render The Page, Not The Array

`IPage` carries `pagination` beside `data`, and both are load-bearing.

`records` is the total the filter matches, `pages` is how many there are, and `current` is where the user is. A control built from `data.length` cannot tell the user there are more, and a "next" button that guesses from a full page breaks on the last one.

**Show the total when the requirement says a user needs it.** A result count is usually a requirement rather than a decoration, because it is how a person decides whether to refine the filter.

## Empty Is Two Different Screens

| Situation                  | What it says                                 |
| -------------------------- | -------------------------------------------- |
| no rows exist yet          | how to create the first one                  |
| the filter matched nothing | which filter to relax, and a way to clear it |

Conflating them tells a user their search failed when the product is simply new, or tells them the product is empty when a filter excluded every visible row. Distinguish the two only when the contract exposes an unfiltered accessible total or another reliable signal. An empty unfiltered page alone is insufficient because pagination and actor visibility can produce the same result.

The remaining states are owned by [screens.md](screens.md), and a list owes all of them.

## Paging Does Not Re-Fetch The World

When the page changes, only the page changes. Keep the previous result rendered while the next one loads rather than dropping back to a skeleton, so the layout does not jump and the user does not lose their place.

**Reset to page one whenever a filter or the sort changes.** Page seven of the old filter is not page seven of the new one, and leaving the number alone lands the user on an empty page that looks like a broken query.

## Do Not Fetch Per Row

If a row needs a field the summary does not carry, that is a finding against the contract, not a reason to call the detail operation for each row.

One call per row costs one round trip per row, and it degrades exactly when the list gets long enough to matter. A response that forces a second call per row is a defect in the operation, so the repair is to carry the field in the summary. Raise it against the contract.
