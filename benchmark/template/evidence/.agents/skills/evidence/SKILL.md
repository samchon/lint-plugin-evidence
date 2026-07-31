---
name: evidence
description: Defines Evidence Graph claims, zero-host activation, acknowledgement syntax, placement, exclusions, frozen configuration, and compiler gates. Read before Evidence implementation or handling a graph diagnostic.
---

# Evidence Graph

## Tags

```text
@evidence <target> <reason>
@evidenceExclude <target> <reason>
```

`@evidence` states that the selected host implements, represents, or proves the target. `@evidenceExclude` states that this claim does not apply and names the actual owner or observable alternative plus the condition that would make the exclusion false.

The target and non-empty reason are mandatory. One acknowledgement covers the selected target and its selected descendants. Keep evidence and exclusion scopes disjoint within one claim-reference obligation.

Reasons are reviewed by people. Write a specific responsibility that current code could falsify, not a restatement of the target name.

## Claim Activation

A declared claim is active only when its own `root`, `files`, and `symbol` selector materializes at least one selected host. If the successfully loaded host population is empty, the entire claim is inactive and none of its reference obligations runs.

This rule applies equally to TypeScript, Prisma, and Markdown claims.

For TypeScript, the selector uses semantic exported symbols. With `symbol: "function"`, a file containing only exported non-function variables has zero selected hosts and the claim remains inactive. An exported `const` initialized with an arrow or function expression is a function; an ordinary exported variable is a property.

For Prisma, a claim selecting `model` remains inactive until a matching schema input contains a model. For Markdown, a claim remains inactive until its matching documents contain a host selected by its symbol selector.

An unreadable or invalid configured input is not an empty population. Loader and parse failures remain diagnostics. Inactivity prevents future-layer coverage from firing before that layer has a host; it does not prove the requirements need no host.

Do not add, remove, or toggle claim objects as implementation advances. Activation follows the current selected host population automatically.

## Configured Claims

| Configuration | Claim | Host | References |
| --- | --- | --- | --- |
| `packages/backend/lint.config.ts` | `schema-models` | Prisma models | requirement H2/H3 |
| same | `dto-types` | exported DTO types | requirement H2/H3 and Prisma models |
| same | `dto-properties` | exported DTO properties | Prisma columns |
| same | `api-operations` | exported controller functions | requirement H2/H3 and Prisma models |
| same | `backend-tests` | exported test functions | requirements, SDK operations, and DTO types |
| `packages/frontend/lint.config.ts` | `frontend-screens` | exported page functions | requirement H2/H3 |
| same | `frontend-journeys` | exported journey functions | requirements and page functions |

Both configuration files and all claim objects are frozen. Keep `evidence/graph` at `error`. The backend has one `tsconfig.json` containing backend source, tests, and API DTOs. Do not create phase-specific config or compiler files.

The sealed `NESTIA_SDK_TRANSFORM=1` guard disables the graph only inside Nestia's private transform. The resident backend watcher remains outside that environment and must report a clean graph rebuild.

## Placement

| Claim | `@evidence` host | Exclusion carrier |
| --- | --- | --- |
| `schema-models` | model `///` comment | `prisma/schema/exclude.schema` |
| `dto-types`, `dto-properties` | exported type or property JSDoc | `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` |
| `api-operations` | controller method JSDoc | `src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts` |
| `backend-tests` | exported test function JSDoc | `test/features/TEST_EVIDENCE_EXCLUDE.ts` |
| `frontend-screens` | exported page function JSDoc | `src/components/SCREEN_EVIDENCE_EXCLUDE.ts` |
| `frontend-journeys` | exported journey function JSDoc | `tests/journeys/JOURNEY_EVIDENCE_EXCLUDE.ts` |

Keep ownership evidence on the actual selected host. Exclusion carriers contain only reviewed exclusions. Providers are not selected hosts and carry neither tag.

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

TypeScript targets use imported inline links:

```ts
/**
 * @evidence {@link api.functional.shopping.order.create} Calls the published
 *           order creation operation.
 * @evidence {@link IShoppingOrder} Validates the returned order contract.
 */
export async function test_order_create(): Promise<void> {
  // ...
}
```

Use `import type` for a citation-only type import. Braces in `{@link ...}` are required.

## Exclusions

Use the narrowest truthful target:

```ts
/**
 * @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
 *                  CatalogPage owns this presentation-only wording; this
 *                  exclusion becomes false if the API must return it.
 */
export const CONTROLLER_EVIDENCE_EXCLUDE = true;
```

“Not applicable,” “internal,” “future work,” and “not implemented” are conclusions, not reasons. Name the actual owner or observable alternative and a concrete veto condition.

Schema exclusions are unattached top-level `/// @evidenceExclude` lines in `exclude.schema`. The file is lint-only and is not a Prisma generation input.

## Stub Marker

Only this arm uses:

```text
@todo <specific remaining implementation>
```

Place it on temporary controller and page stubs. Remove it when the real provider delegation or completed screen replaces the stub. Do not add `evidence/todo`; the benchmark graph workload is frozen.

Before a phase completes, require no source-owned marker:

```bash
rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'
rg --hidden -n -F '@todo' packages/frontend --glob '*.ts' --glob '*.tsx'
```

## Compiler Gates

Keep backend `pnpm check:watch` and frontend `pnpm dev` running. The compiler owns target resolution, host eligibility, overlap, coverage, and missing acknowledgements.

At each gate, confirm the canonical claim configurations remain unchanged, wait for clean current builds, and run the phase's runtime tests. Never edit a claim population or move a tag merely to silence a diagnostic.
