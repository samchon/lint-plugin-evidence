# Screens

A screen is where a requirement stops being a capability and becomes something a person can do.

Every configured requirement section must be acknowledged by a screen that claims to deliver it, and the lint stage fails until it is. So a requirement the backend implemented and the interface never surfaced is a compile error rather than a gap that survives every backend check.

```tsx
/**
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Renders the
 *           catalog with the search, filter, and pagination the section describes.
 */
export function CatalogPage() {}
```

Read [the evidence skill](../evidence/SKILL.md) before starting.

{{base}}

## Delivering Is Not Rendering

The build checks that a screen cites the requirement. It cannot check that a user can complete the journey.

A screen that fetches the data, renders it, and cites the section satisfies the obligation completely while offering no path to the action the requirement names. That is the failure this layer is most prone to, because the data appearing looks like the feature working.

So write the citation's reason as what the user can now do, not what the screen displays. A reason phrased that way is visibly false when the action is missing.

## The Internal Graph Is Configured Too

Once the structure exists, these obligations exist with it, and the ones that are not configured are not checked:

```
requirement     ->  screen          (the screen that delivers it)
component       ->  screen          (the screen that renders it)
SDK operation   ->  screen          (the screen that consumes it)
journey         ->  browser spec    (the spec that walks it)
```

Add them to the configuration when the structure appears. An edge nobody configured produces no diagnostic, and its absence looks exactly like coverage.

## When The Diagnostic Points Here But The Hole Is Upstream

A screen that cannot cite a requirement is often a requirement no operation exposes. Check before writing anything: does the SDK have an accessor for it? If not, the finding belongs to the contract, and [controllers.md](../backend/controllers.md) owns it.

Never build a frontend-only path to make a citation resolve. It produces a screen that satisfies the graph and a backend that still does not implement the requirement.

## After Any Contract Change

Run the build. A regenerated SDK can leave a screen's citation resolving to an operation that no longer means what it did, and a removed operation leaves it dangling.

A dangling citation here means the contract moved under a claim that still believes the old shape. Fix whichever is actually wrong.
