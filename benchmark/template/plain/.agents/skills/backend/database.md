# Database

Before you design a single model, know what this layer owes and how that debt is settled here.

The schema answers to `docs/analysis/`. Every requirement that names persistent state, a lifecycle, a history, a threshold that survives a restart, or an authority checked later must have somewhere to live, and every table and column must trace back to a requirement that asked for it.

**Nothing checks that for you.** The compiler proves the schema is well formed. It cannot know that a section of a document has no storage. Establishing that is the database dimension of the campaign, and you run it yourself.

Read [the campaign skill](../campaign/SKILL.md) and [its database edge](../campaign/database.md) before starting, and keep the ledger open while you work. Record every requirement you resolve to storage as you resolve it, because the campaign counts against that record and you will not remember on the second pass.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After Any Schema Change

A change here re-opens two relationships in the current campaign round, making its prior verdict void.

- **The API relationship**, because a new column may need exposing, filtering, or returning, and a changed one may have changed what an operation means.
- **The logic relationship**, because a provider reads and writes this schema, and an invariant the schema implies needs code that maintains it.

Record which relationships you re-opened in the ledger at the moment you make the change. Deciding later means deciding from memory.

If the change came from a requirements finding, every downstream dimension of the campaign re-opens, not only these two relationships.

**A change that breaks nothing is the one to watch.** Rename a column and the build stops you. Change its nullability, widen its meaning, or add a state it can now hold, and everything still compiles while every artifact built on the old meaning is now unverified. Filled ledger rows do not preserve the round's verdict after their meaning changes.

This schema is what the most artifacts are built on, so one wrong meaning here propagates furthest. The [review skill](../review/SKILL.md) owns finding that, and it is why it reads the source rather than only the artifact claiming to realize it.
