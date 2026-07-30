# DTOs

The `dto-types` claim selects exported root types and independently references Markdown H2/H3 sections and Prisma models. The `dto-properties` claim selects exported properties and references Prisma columns.

```ts
/**
 * Customer-facing sale summary.
 *
 * @evidence docs/analysis/02-domain-model.md#sale-summary Exposes the required
 *           public summary.
 * @evidence prisma:ShoppingSale Represents the persisted sale.
 */
export interface IShoppingSale {
  /**
   * Current public title.
   *
   * @evidence prisma:ShoppingSale.title Carries the stored title.
   */
  title: string;
}
```

The property tag belongs on the property, never on the nearest root type. A derived property cites every selected source column it truly uses. A value with no stored source documents its derivation in prose; do not invent a Prisma target.

## Excluding A Requirement, Model, Or Column From DTOs

Collect reviewed `dto-types` and `dto-properties` exclusions on the exported const in `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts`. The const is a claim-local carrier rather than a DTO owner; keep truthful `@evidence` on selected root types and properties.

```ts
/**
 * @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
 *                  CatalogPage owns this presentation-only wording; reject
 *                  this exclusion if a response must carry it.
 * @evidenceExclude prisma:LoginAttempt
 *                  AuthenticationProvider owns this internal record; reject
 *                  this exclusion if it enters a request or response body.
 * @evidenceExclude prisma:ShoppingSale.internal_note
 *                  ShoppingSaleProvider keeps this operator-only value
 *                  server-side; reject this exclusion if clients may read it.
 */
export const DTO_EVIDENCE_EXCLUDE = true;
```

The two claims still tally independently, but the same carrier and target may participate in both when both claim-reference pairs select them. A Markdown target participates only in `dto-types`, while a Prisma column target participates only in `dto-properties`. A Prisma model target participates in `dto-types` and is also an ancestor of every selected column in `dto-properties`, so excluding `prisma:ShoppingSale` broadly excludes that model's selected columns from both obligations. Use a column target for a narrow property exclusion, use the narrowest truthful target, and keep evidence and exclusion scopes disjoint within each obligation. Neither claim affects backend or frontend claims.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Authored And Generated Ownership

DTO structures, diagnosers, and helper typings are authored here. Functional accessors and `swagger.json` are generated from controllers. Edit the authored owner, regenerate, and inspect the result.
