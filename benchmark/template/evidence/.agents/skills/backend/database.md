# Database

Before you design a single model, know what this layer owes and how that debt is settled here.

The schema answers to `docs/analysis/`. Every requirement that names persistent state must have somewhere to live, and the build enforces it: each configured requirement section must be acknowledged by a model that claims to store it, and the lint stage fails until it is.

So the obligation is not a discipline you maintain. It is a compile error you clear.

```prisma
/// Seller **sales** products.
///
/// @evidence docs/analysis/02-domain-model.md#sales Stores the sale identity
///           and its lifecycle timestamps; the revisable content lives in the
///           snapshot.
model shopping_sales {
}
```

A citation sits in the `///` block, which is the same block the generated types and the ERD publish. Write which part of the section this model is responsible for, not a restatement of the section's name.

Read [the evidence skill](../evidence/SKILL.md) before starting, especially the part about discharging a diagnostic at the layer that owns it. A requirement you cannot cite from any model is usually not a missing tag.

{{base}}

## Citing And Excluding

**One target, one citation, across the whole claim.** A citation acknowledges the section and every selected descendant, so cite a section once, from the model that owns its concept, with a reason naming the part it answers for; a second citation of the same target from any model in this claim is a duplicate-acknowledgement error. When a section spans concepts, the other models cite only the targets that are disjointly theirs.

**Cite the model that stores the fact**, not a neighbor that references it. A tag on the wrong side of a relation records a claim the code does not support, and a reviewer comparing the two will find it.

**Use `@evidenceExclude` only for a reviewed decision.** A section that describes behavior with no persistent state genuinely has no model, and recording that with a reason is correct. A section you have not implemented yet is not that, and excluding it converts a true report into a false one.

## After Any Schema Change

Run the build. A new model may make a previously unsatisfiable citation resolve, and a removed one may leave a citation dangling somewhere else entirely.

A dangling citation is not noise. It means either the schema changed under a claim that still believes the old shape, or the address was wrong from the start. Fix whichever is actually wrong, and never delete the citation to stop the message.

**The dangerous changes are the ones that dangle nothing.** Rename a column and every citation of it breaks loudly. Change its nullability, widen its meaning, or add a state it can now hold, and every citation still resolves while every reason written against the old meaning is now unverified. Nothing reports that.

This schema is the most-cited reference in the repository, which makes it the place where one wrong meaning propagates furthest: a model that means something other than what its citations assume produces a green build over DTOs, providers, and tests that are each individually faithful. The [review skill](../review/SKILL.md) owns finding that, and it is the reason it reads the referenced side rather than only the citing side.
