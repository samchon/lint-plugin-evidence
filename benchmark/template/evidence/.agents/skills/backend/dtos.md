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

Put a `dto-types` exclusion on a selected exported root type. It may target a Markdown H2/H3 section or Prisma model because those are the claim's configured references.

```ts
/**
 * Customer-facing sale summary.
 *
 * @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
 *                  CatalogPage owns this presentation-only wording; reject
 *                  this exclusion if a response must carry it.
 * @evidenceExclude prisma:LoginAttempt
 *                  AuthenticationProvider owns this internal record; reject
 *                  this exclusion if it enters a request or response body.
 */
export interface IShoppingSale {}
```

Put a `dto-properties` exclusion on a selected exported property, and target one Prisma column. The property is only a carrier for the claim-wide non-mapping; the reason names the real backend owner and the condition that would make the column part of the public contract.

```ts
export interface IShoppingSale {
  /**
   * @evidenceExclude prisma:ShoppingSale.internal_note
   *                  ShoppingSaleProvider keeps this operator-only value
   *                  server-side; reject this exclusion if clients may read it.
   */
  id: string;
}
```

The two named claims tally independently: a model exclusion under `dto-types` does not exclude its columns under `dto-properties`, and neither affects backend or frontend claims. An H2 or Prisma model ancestor target covers every selected descendant in that obligation. Use the narrowest truthful target and keep evidence and exclusion scopes disjoint. Do not put either tag on helper typings outside `src/structures/**`; an unselected declaration is not a claim host.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Authored And Generated Ownership

DTO structures, diagnosers, and helper typings are authored here. Functional accessors and `swagger.json` are generated from controllers. Edit the authored owner, regenerate, and inspect the result.
