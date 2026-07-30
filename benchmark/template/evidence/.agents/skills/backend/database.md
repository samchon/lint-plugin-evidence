# Database

The `schema-models` claim selects Prisma model documentation and requires acknowledgement of every configured Markdown H2/H3 section.

Place a citation in the `///` block attached to the exact model that stores the facts:

```prisma
/// A sale offered by one seller.
///
/// @evidence docs/analysis/02-domain-model.md#sale-lifecycle Stores the states
///           and timestamps required by the lifecycle.
model shopping_sales {
}
```

Use leaf H3 targets by default. Use an H2 only when this one model owns every selected child and the integrity review enumerates them. An exclusion is valid only for a reviewed section with genuinely no storage responsibility; “not implemented” is never an exclusion.

## Excluding A Requirement From The Schema

Collect reviewed `schema-models` exclusions as unattached top-level `/// @evidenceExclude` lines in `packages/backend/prisma/schema/exclude.schema`. The file is a claim-local lint-only carrier rather than a schema owner. The configured ownership selector is `model`, so keep truthful `@evidence` directly above the selected model; fields and relations are not ownership hosts for this claim.

```prisma
/// @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
///                  CatalogPage owns this presentation-only wording; reject
///                  this exclusion if the requirement adds persisted choice,
///                  audit history, or state.
```

Keep `exclude.schema` free of models and ownership evidence. Prisma generation, migration, and ERD still read only the `.prisma` schema folder; do not widen those commands to include this lint-only file.

[Evidence Lint](../evidence/SKILL.md) owns the common exclusion rules. This carrier settles only `schema-models`; every other claim remains independent.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Schema Change

Regenerate the Prisma client and ERD. A semantic change can leave every target resolvable while making old reasons false, so invalidate API, provider, and test reviews bound to the prior schema digest.
