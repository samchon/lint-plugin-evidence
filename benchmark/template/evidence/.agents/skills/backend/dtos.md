# DTOs

The `dto-types` claim selects exported root types and independently references Markdown H2/H3 sections and Prisma models. The `dto-properties` claim selects exported properties and references Prisma columns. Read [the API completeness check](../completeness/api.md) before writing either.

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

An internal model or column may be excluded from this contract claim only through a selected type/property host with a reason naming why no public shape owns it and what observation would overturn that decision. Keep evidence and exclusion scopes disjoint within each named claim.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Authored And Generated Ownership

DTO structures, diagnosers, and helper typings are authored here. Functional accessors and `swagger.json` are generated from controllers. Edit the authored owner, regenerate, and inspect the result.
