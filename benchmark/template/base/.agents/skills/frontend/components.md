# Components

This document owns component discipline: when one exists, what it may know, and the mechanics that keep a tree honest.

## A Component Earns Extraction

Extract when a second caller exists, or when a domain concept earns a name a reviewer would recognize: `OrderStatusBadge`, not a styled span. Line count alone is not a reason, and extraction ahead of need spreads one screen's decisions across three files that must now be read together.

Until then, a large screen is allowed to be a large file with named sections. [architecture.md](architecture.md) owns where the extracted ones live.

## Props Down, Events Up, Nothing Sideways

Components below a page take view models and callbacks. They do not fetch, do not read the query cache, and do not reach into context for data. The app-wide providers exist for cross-cutting concerns composed in one place, not as a side door for whatever a leaf component wants.

The payoff is stated in [screens.md](screens.md): a page whose children fetch has loading states it cannot know about and errors it cannot handle.

## Controlled Inputs, One Source

A field's value lives in form state and flows down; the input reports changes up. A half-controlled input, seeded once from a prop and drifting on its own afterwards, produces the stale-edit-form class: the query refetches, the prop updates, and the field ignores it.

The exception is the file input, which the DOM owns; read it through a ref at submit.

## Keys Are Identity

A row's key is its entity id. An index key tells React that position is identity, so an insertion re-mounts every row after it and their form state slides one row down: the classic edit-the-wrong-item bug. When mapping join rows, the key is the join row's own id, not the child's, because the same child can appear under two joins.

## Memoization Is A Measured Fix

The default is none. Colocate state so a change re-renders only the subtree that cares, and most memoization questions disappear before they are asked.

Reach for `memo`, `useMemo`, or `useCallback` after the profiler shows a hot path, and note why beside the call. The standing exception that needs no measurement: a stable callback handed to memoized rows of a long list, because an inline closure defeats the rows' memo on every parent render.

## Composition Over Configuration

A primitive sprouting boolean modes is several components sharing a base. A card taking `compact`, `bordered`, and `interactive` at once reads as a puzzle; `children` and named slots keep each variant's markup where its caller can see it. Three booleans on one component is the review threshold.
