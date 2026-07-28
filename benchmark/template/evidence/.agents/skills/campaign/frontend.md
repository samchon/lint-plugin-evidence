# Frontend Obligation

Read [SKILL.md](SKILL.md) first. This document covers the edges into the interface.

## What The Build Checks

Every configured requirement section that describes something a user does or sees must be acknowledged by a screen, and every screen's data path by the operation it consumes. A requirement the backend implemented and the interface never surfaced is a lint failure rather than a gap that survives every backend check.

## Delivering Is Not Rendering

This is the layer's characteristic failure and the build cannot see it.

A screen that fetches the data, renders it, and cites the section satisfies the obligation completely while offering no path to the action the requirement names. The data appearing looks like the feature working, to a reader and to every automatic check.

Write the citation's reason as what the user can now do, not what the screen displays. A reason phrased that way is visibly false when the action is missing, which puts the check back where a reviewer can perform it.

## The Internal Graph Must Be Configured As It Appears

The frontend is not one node. Once its folders take shape it grows obligations of its own:

```
requirement     ->  screen      (the screen that delivers it)
component       ->  screen      (the screen that renders it)
SDK operation   ->  screen      (the screen that consumes it)
```

Configure them when the structure appears. **An edge nobody configured produces no diagnostic, and its silence is indistinguishable from coverage.** This is the layer where that happens, because the structure does not exist at the moment the configuration is first written.

## Where The Repair Usually Is

A screen that cannot cite a requirement is often a requirement no operation exposes. Check for an accessor before writing anything.

Never build a frontend-only path to make a citation resolve. It produces an interface that satisfies the graph over a backend that still does not implement the requirement, and every later check reads clean.

## After Regenerating The SDK

Run the build. A removed operation leaves a screen's citation dangling; a changed response can leave it resolving to something that no longer means what it did.

## What The Build Never Checks Here

That the flow works. Every state a screen owes, every width it must hold at, and every control causing an observable change are outside this mechanism entirely.

Run the flows in a browser. The verification topic owns what that requires, and a green lint stage is not a substitute for having used the product.
