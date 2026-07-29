# Database

The `schema-models` claim selects Prisma model documentation and requires acknowledgement of every configured Markdown H2/H3 section.

Place a citation in the `///` block attached to the exact model that stores the facts:

```prisma
/// A sale offered by one seller.
///
/// @evidence docs/analysis/02-domain-model.md#sale-lifecycle Stores the states
///           and timestamps required by the lifecycle.
model ShoppingSale {
}
```

Use leaf H3 targets by default. Use an H2 only when this one model owns every selected child and the integrity review enumerates them. An exclusion is valid only for a reviewed section with genuinely no storage responsibility; “not implemented” is never an exclusion.

## Excluding A Requirement From The Schema

Put `@evidenceExclude` in the `///` block of a selected Prisma model when the `schema-models` claim intentionally has no storage responsibility for one requirement. The carrier model does not become the requirement's owner; it only hosts the claim-local decision.

```prisma
/// A sale offered by one seller.
///
/// @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
///                  CatalogPage owns this presentation-only wording; reject
///                  this exclusion if the requirement adds persisted choice,
///                  audit history, or state.
model ShoppingSale {
}
```

Name the actual owner and a condition that would veto the exclusion. “Not implemented,” “future work,” and “not applicable” do not explain why the schema must omit a requirement. Excluding an H2 excludes every selected H3 descendant, so use a leaf unless the same ownership decision is true for all descendants. Keep evidence and exclusion scopes disjoint within this claim-reference obligation. The exclusion satisfies only `schema-models`; controller, test, DTO, and frontend claims still owe their own decisions.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Schema Change

Regenerate the Prisma client and ERD. A semantic change can leave every target resolvable while making old reasons false, so invalidate API, provider, and test reviews bound to the prior schema digest.
