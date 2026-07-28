# API Check

Read [SKILL.md](SKILL.md) first. The `dto-types`, `dto-properties`, and `api-operations` claims cover authored public-contract sources; generated SDK files are targets or outputs, never citation hosts.

## DTO Types And Properties

Place Markdown and model citations on the exported root DTO type selected by `dto-types`. Place column citations on the exact exported DTO property selected by `dto-properties`, not on the nearest interface or namespace:

```ts
/**
 * Sale summary returned to a customer.
 *
 * @evidence docs/analysis/02-domain.md#sale-summary Exposes the required
 *           customer-facing sale summary.
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

A property derived from several columns cites each source column with a distinct reason. A public property with no stored source records its derivation in human JSDoc; do not fabricate a Prisma target.

## Operations

Place requirement and model citations on the exported controller method selected by `api-operations`. Its reason names the actor, effect, response, or failure this operation owns. A provider method and generated accessor are not hosts for this claim.

Use exclusions only for an exact target this named claim deliberately does not expose. “Internal” is insufficient when a requirement says a caller observes it; name the actual owner and review consequence.

## Ownership And Regeneration

`packages/api/src/structures/**`, `src/diagnosers/**`, and `src/typings/**` are authored. Controllers own public operation declarations. `src/functional/**` and `swagger.json` are generated from controllers. After a controller, DTO, or public JSDoc change, regenerate and inspect the SDK/OpenAPI shape.

The graph checks configured target acknowledgement, not that every contract detail is semantically correct. Review authorization, parameters, variants, pagination, response fields, errors, and reverse ownership manually.
