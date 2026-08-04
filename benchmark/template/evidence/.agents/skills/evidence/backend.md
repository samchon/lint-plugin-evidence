# Evidence Backend

## Claims

| Claim | Host | References | Declared in |
| --- | --- | --- | --- |
| `schema-models` | Prisma models | requirement H2/H3 | `packages/backend/test/lint.config.ts` |
| `api-operations` | exported controller functions | requirement H2/H3 and Prisma models | `packages/backend/test/lint.config.ts` |
| `dto-types` | exported DTO types | requirement H2/H3 and Prisma models | `packages/api/lint.config.ts` |
| `dto-properties` | exported DTO properties | Prisma columns | `packages/api/lint.config.ts` |
| `backend-tests` | exported test functions | requirements and SDK operations | `packages/backend/test/lint.config.ts` |

The DTO claims live in the API package because a TypeScript claim selects only files its own `tsconfig` includes, and the API Program is the one that includes `src/structures/`. They are checked by backend `pnpm build:sdk`, which compiles the API package.

Every other backend rule lives in the test configuration because `test/tsconfig.json` compiles `../src` together with the tests — the one backend Program that holds controllers and test functions alike — and `pnpm check:watch` runs exactly that Program. `packages/backend/lint.config.ts` stays as shipped: `nestia all` inside `pnpm build:sdk` resolves the package configuration, so leaving it untouched keeps SDK generation free of evidence rules.

`evidence/singular` and `evidence/todo` are also declared in `packages/backend/test/lint.config.ts`. `evidence/singular` keeps one public identity per file, named after the file. `evidence/todo` fails the build on every remaining JSDoc `@todo` in the Program, exported or not.

## Placement

| Claim | `@evidence` host | Exclusion carrier |
| --- | --- | --- |
| `schema-models` | model `///` comment | `prisma/schema/exclude.schema` |
| `dto-types`, `dto-properties` | exported type or property JSDoc | `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` |
| `api-operations` | controller method JSDoc | `src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts` |
| `backend-tests` | exported test function JSDoc | `test/features/TEST_EVIDENCE_EXCLUDE.ts`, requirements only |

## Examples

```prisma
/// Sale persisted for one seller.
///
/// @evidence docs/analysis/02-domain-model.md#sale Stores the required sale
///           identity, lifecycle, and seller ownership.
model shopping_sales {
}
```

```ts
/**
 * Public sale summary.
 *
 * @evidence docs/analysis/02-domain-model.md#sale-summary Exposes the summary
 *           fields customers use while browsing.
 * @evidence prisma:shopping_sales Represents the persisted sale.
 */
export interface IShoppingSale {
  /**
   * Current title.
   *
   * @evidence prisma:shopping_sales.title Carries the stored title.
   */
  title: string;
}
```

```ts
/**
 * Lists sales visible to this seller.
 *
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Provides
 *           the seller's visibility-filtered browsing operation.
 * @evidence prisma:shopping_sales Exposes persisted sales.
 */
public async index(): Promise<IPage<IShoppingSale.ISummary>> {
  // ...
}
```

```ts
import * as api from "{{apiPackageName}}";

/**
 * @evidence docs/analysis/03-functional-requirements.md#place-order Proves the
 *           order placement the requirement promises.
 * @evidence {@link api.functional.shopping.order.create} Proves the published
 *           order creation operation.
 */
export async function test_api_order_create(
  connection: api.IConnection,
): Promise<void> {
  // ...
}
```

## Exclusions

```ts
/**
 * @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
 *                  CatalogPage owns this presentation-only wording; this
 *                  exclusion becomes false if the API must return it.
 */
export const CONTROLLER_EVIDENCE_EXCLUDE = true;
```

Schema exclusions are unattached top-level `/// @evidenceExclude` lines in `exclude.schema`, a lint-only file that is not a Prisma generation input.

## Staged Unlock

Start backend `pnpm check:watch` before implementation while every backend claim is disabled. Delete each `disabled` at exactly the point its layer completes.

- **Too early:** the first selected host activates the complete claim, so the watcher emits thousands of diagnostics for models, operations, and tags not yet written. The flood buries real diagnostics, fills context, and impairs decisions.
- **Too late:** the layer's obligations arrive as one huge batch after work has moved on. Coverage gaps — a requirement no model, operation, or test answers — surface only then, when fixing them reopens finished layers, and tags retrofitted in bulk drift toward compiler-satisfying filler instead of truthful mappings.

1. After the complete schema passes `pnpm build:prisma` and `pnpm schema`, delete `disabled` from `schema-models` in `packages/backend/test/lint.config.ts`.
2. After every DTO and controller is complete and `pnpm build:sdk` passes, delete `disabled` from `dto-types` and `dto-properties` in `packages/api/lint.config.ts` and from `api-operations` in `packages/backend/test/lint.config.ts`.
3. After every public-operation test is written, delete `disabled` from `backend-tests` in `packages/backend/test/lint.config.ts`.
4. Finish every provider with the watcher running: replace every controller stub, remove every source-owned `@todo` under `packages/api` and `packages/backend`, then run `pnpm test` and fix every failure.

After each deletion, fix the complete diagnostic batch, complete the truthful evidence mappings, and wait for a rebuild without diagnostics before continuing to the next stage.

Keep the watcher running through Overall Final; `pnpm test` does not report every type or lint diagnostic.

Before the phase completes, this sweep must return nothing:

```bash
rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'
```

## Operation Reference

The `backend-tests` operation reference refuses `@evidenceExclude` and admits exactly one operation per test: every published operation is proved by a backend test, or the product is incomplete. Cite the one operation the test proves; write a missing test instead of excluding its operation.

Prerequisite and follow-up calls are setup and observation; leave them uncited.
