# Database Campaign Dimension

Read [SKILL.md](SKILL.md) first. This mandatory dimension of the indivisible campaign round discharges `docs/analysis/ -> database`.

## The Two Directions

An edge has a denominator on each side, and the two directions find different defects. Walk both during every complete round.

**Forward, requirements to schema.** For every requirement in the inventory, name the tables and columns that make it storable. Persistent state, lifecycle, history, restart-surviving thresholds, and authorities checked later need storage. If you cannot name it, the behavior has no storage.

**Backward, schema to requirements.** For every table and column under `packages/backend/prisma/schema/`, name the requirement that makes it necessary. An item no requirement asks for means either a requirement was missed or storage was invented.

The backward direction is not redundant. The forward walk cannot find an invented column, and an invented column carries invented semantics into the API and logic.

## What Counts As Covered

"There is a table for it" is not coverage. Check the complete shape:

- **Every named business value is a column.** An internal identifier does not replace a named confirmation number, code, reference, or amount.
- **Every nullable column has a stated meaning.** If absence has no required meaning, a section may be missed or the column should not be nullable.
- **Every named state is representable.** Walk every lifecycle and confirm the schema can express every state and transition.
- **Every retention rule has suitable storage.** A live reference to a mutable row does not preserve an as-of-event value.
- **Every uniqueness and threshold appears as a constraint** where the schema can hold it, not only in provider code.
- **Every recovery workflow has the state it needs.** Restore and reactivation paths cannot work without representable recovery state.

## The Deletion Decision

For every removable entity, determine from the requirements whether history and children survive, whether restoration is possible, and who can still see it. Record the resulting storage decision and its source.

This decision is often made by default, but reversing it later rewrites every query over the table.

## Findings

A requirements finding re-opens this dimension in full. Any schema change re-opens the API, logic, and test relationships because each depends on the storage shape. Record which downstream relationships the correction invalidates when you record the finding.

Within the indivisible round owned by [SKILL.md](SKILL.md), this dimension is exhausted when every persistent requirement names its storage, every table and column names its requirement, and every deletion and retention decision names its source. Schema compilation and client generation prove none of this.
