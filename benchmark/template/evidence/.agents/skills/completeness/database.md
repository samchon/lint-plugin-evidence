# Database Check

Read [SKILL.md](SKILL.md) first. The `schema-models` claim mechanically covers Markdown H2/H3 targets from selected Prisma model hosts.

## Evidence Placement

Put requirement citations in the `///` documentation attached to the exact model:

```prisma
/// A sale offered by one seller.
///
/// @evidence docs/analysis/02-domain.md#sale-lifecycle Stores the states and
///           timestamps required by the sale lifecycle.
model ShoppingSale {
  id String @id
}
```

Do not put the tag on a column, detached comment, generator, or generated Prisma client. This claim selects model hosts.

Use `@evidenceExclude` only when the database claim intentionally has no storage responsibility for the exact section. State where the behavior is realized without persistence and what observation would prove the decision wrong.

## Integrity And Reverse Ownership

The graph proves every selected section is acknowledged by this claim. It does not prove that models contain all required fields or that every authored column has an owner. Manually walk each cited section into exact models/columns, then every model and column back to requirements or a reasoned infrastructure decision.

Check lifecycle state, nullability, uniqueness, relation ownership, deletion/retention, ordering, units, and derived-versus-stored semantics. Regenerate `src/prisma/**` and `docs/ERD.md` after schema changes; those outputs carry no authored obligations.

A schema change invalidates API, provider, and test reviews that used its previous meaning.
