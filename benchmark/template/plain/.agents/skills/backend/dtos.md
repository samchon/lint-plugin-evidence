# DTOs

A DTO carries two obligations, and they sit at different granularities.

**The type answers to a requirement and a table.** It exists because the specification named a concept, and it represents a row someone can point at.

**A property answers to the schema alone.** Not to a requirement: the question a property can actually answer is where its value comes from, which is a column or a stated derivation.

**Nothing checks either one.** A DTO compiles whether or not any requirement asked for it, and a property compiles whether or not anything can fill it. The phantom is the specific failure: a property that reaches the provider with no source, discovered when someone tries to implement the transformer.

Read [the campaign skill](../campaign/SKILL.md) and [its API edge](../campaign/api.md) before starting. That edge is where these two walks live.

{{base}}

## The Two Walks, At Two Granularities

**Type level, both directions.** Every requirement concept that a caller must receive has a DTO, and every DTO names the requirement that asked for it plus the table it represents. A DTO with no requirement is one you invented for the implementation's convenience.

**Property level, both directions.** Every property names the column it carries or the derivation it is computed from, and every column that a requirement says a caller must see appears in some read variant. A property carrying a nested object names the foreign key column that reaches it. The second direction is the one that finds the field the schema stores and the API never exposes, which passes every check the first direction makes.

Record each mapping in the ledger as you make it. A property whose source you resolved once and did not write down is a property you will re-derive on the next round.

## Computed Properties Need Their Derivation Recorded

A count, a total, or a joined display value has no column. Record the derivation with the property, in the ledger and in the property's own description, precisely enough that a reader can check it against the transformer.

"Computed" is not a derivation. An unrecorded one is indistinguishable from a phantom on the next round, so you will re-investigate it every time.

## After Any DTO Change

The logic campaign re-opens, because the transformer must supply every property and the collector must accept every creation field.

The test campaign re-opens when a response shape changed, because assertions read those properties.

The frontend campaign re-opens for the same reason: a screen reading a property that no longer exists compiles against the old SDK and fails against the new one.

When a property has no source and should, the finding belongs to the database campaign. Add the column there rather than describing the property as computed to make the question go away.
