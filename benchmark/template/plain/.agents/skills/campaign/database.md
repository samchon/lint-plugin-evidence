# Database Campaign

Read [SKILL.md](SKILL.md) first. This campaign discharges the edge `docs/analysis/ -> database`.

## The Two Directions

An edge has a denominator on each side, and the two directions find different defects. Walk both, every round.

**Forward, requirements to schema.** For every requirement in the inventory, name the tables and columns that make it storable. A requirement that names persistent state, a lifecycle, a history, a threshold that must survive a restart, or an authority that must be checked later needs somewhere to live. If you cannot name where, it has no storage and that is a finding.

**Backward, schema to requirements.** For every table and every column, name the requirement that makes it necessary. A column no requirement asks for is either a requirement you have not read or a table you invented. Both are findings, and they need different fixes.

The backward direction is the one people skip because it feels redundant after the forward pass. It is not. The forward pass cannot find an invented column, and an invented column carries invented semantics that the API and the logic will then honor.

## What Counts As Covered

"There is a table for it" is not coverage. Check the whole shape against the requirement:

- **Every named business value is a column.** A confirmation number, a code, a reference, an amount the requirements name is a stored fact. The internal identifier does not replace it.
- **Every nullable column has a stated meaning.** If the requirements do not say what absence means, either you missed a section or the column should not be nullable.
- **Every state the requirements name is representable.** Walk the lifecycle the documents describe and confirm the schema can express each state and each transition. A state that no column combination can represent is a finding even though nothing fails yet.
- **Every retention rule has storage that performs it.** If a requirement says a value is honored later, audited, or shown as of an event, a live reference to a mutable row does not satisfy it. Something must capture the value.
- **Every uniqueness and every threshold the requirements state appears as a constraint** where the schema can hold it, not only as a check some provider performs.
- **Every recovery workflow has the state it needs.** If a requirement names a restore or reactivate path, the schema must be able to perform it. Otherwise a later layer invents the missing state, and it invents it differently each time.

## The Deletion Decision

For every entity the requirements let a user remove, the documents say something about what happens afterwards: whether history survives, whether children survive, whether it can come back, whether anyone can still see it.

Read that, then make the storage decision explicit and record it. This is the single decision most often made by default rather than from the requirement, and reversing it later rewrites every query over that table.

## Rounds

A round is a complete pass in both directions over the full population: every requirement in the inventory, and every table and column in the schema.

Any finding resets the count. The campaign is dry after **two consecutive complete rounds** with nothing new.

Vary the traversal. Walk requirement order in one round; walk the schema file by file in the next; walk concept by concept in a third, gathering every requirement and every table that mentions the concept together. The third traversal is the one that finds a concept split across two tables that should be one, or one table doing the work of two concepts.

## The Cascade

**Out of here:** any schema change re-opens the API campaign and the logic campaign, because both read the schema. A new column can imply an endpoint that exposes it, a filter that uses it, a response field that carries it, and a test that proves it.

**Into here:** any finding in the requirements campaign re-opens this one in full. Not the part that looks related. In full, because a newly-read requirement can change what an existing table means, not only add a new one.

When you fix something here, write into the ledger which downstream campaigns you are re-opening, at the moment you fix it.

## Exit

Dry when two consecutive complete rounds in both directions find nothing new, every requirement in the inventory names its storage, every table and column names its requirement, and every deletion and retention decision is recorded with the requirement that drove it.

The schema compiling and the client generating prove none of this.
