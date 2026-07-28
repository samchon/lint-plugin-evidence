# Database

The `schema-models` claim selects Prisma model documentation and requires acknowledgement of every configured Markdown H2/H3 section. Read [the database completeness check](../completeness/database.md) before designing the schema.

Place a citation in the `///` block attached to the exact model that stores the facts:

```prisma
/// A sale offered by one seller.
///
/// @evidence docs/analysis/02-domain-model.md#sale-lifecycle Stores the states
///           and timestamps required by the lifecycle.
model ShoppingSale {
}
```

Use leaf H3 targets by default. Use an H2 only when this one model owns every selected child and the integrity ledger enumerates them. An exclusion is valid only for a reviewed section with genuinely no storage responsibility; “not implemented” is never an exclusion.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Schema Change

Regenerate the Prisma client and ERD. A semantic change can leave every target resolvable while making old reasons false, so invalidate API, provider, and test reviews bound to the prior schema digest.
