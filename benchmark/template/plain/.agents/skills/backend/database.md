# Database

Before you design a single model, know what this layer owes and how that debt is settled here.

The schema answers to `docs/analysis/`. Every requirement that names persistent state, a lifecycle, a history, a threshold that survives a restart, or an authority checked later must have somewhere to live, and every table and column must trace back to a requirement that asked for it.

**Nothing checks that for you.** The compiler proves the schema is well formed. It cannot know that a section of a document has no storage. Establishing that is the database campaign's job, and you run it yourself.

Read [the campaign skill](../campaign/SKILL.md) and [its database edge](../campaign/database.md) before starting, and keep the ledger open while you work. Record every requirement you resolve to storage as you resolve it, because the campaign counts against that record and you will not remember on the second pass.

{{base}}

## After Any Schema Change

A change here re-opens two campaigns, and the verdicts they last reported are void.

- **The API campaign**, because a new column may need exposing, filtering, or returning, and a changed one may have changed what an operation means.
- **The logic campaign**, because a provider reads and writes this schema, and an invariant the schema implies needs code that maintains it.

Record which campaigns you re-opened in the ledger at the moment you make the change. Deciding later means deciding from memory.

If the change came from a requirements finding, everything below the requirements campaign re-opens, not only these two.
