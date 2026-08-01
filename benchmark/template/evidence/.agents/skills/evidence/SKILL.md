---
name: evidence
description: Defines Evidence Graph claims, zero-host activation, truthful behavioral proof, acknowledgement syntax, placement, exclusions, frozen configuration, and compiler gates. Read before Evidence implementation or handling a graph diagnostic.
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

Every `@evidence` and `@evidenceExclude` must truthfully describe the current host's relation to the target. Never write, move, consolidate, or invent an acknowledgement only to pass the compiler. A diagnostic identifies an obligation, not the truthful acknowledgement for it. A clean graph proves structure, not truth.

Several hosts may cite the same target when each independently implements or proves it. One host cites one resolved target once. Within one claim-reference obligation, `@evidenceExclude` scopes must never overlap, even across carriers, and must never overlap `@evidence`. A parent target is truthful only when the host owns the complete selected subtree.

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

The sealed `NESTIA_SDK_TRANSFORM=1` guard disables the graph only inside Nestia's private transform. It must be absent from every benchmark compiler gate; a result produced with it present is invalid.

## Placement

| Claim | `@evidence` host | Exclusion carrier |
| --- | --- | --- |
| `schema-models` | model `///` comment | `prisma/schema/exclude.schema` |
| `dto-types`, `dto-properties` | exported type or property JSDoc | `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` |
| `api-operations` | controller method JSDoc | `src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts` |
| `backend-tests` | exported test function JSDoc | `test/features/TEST_EVIDENCE_EXCLUDE.ts` |
| `frontend-screens` | exported page function JSDoc | `src/components/SCREEN_EVIDENCE_EXCLUDE.ts` |
| `frontend-journeys` | exported journey function JSDoc | `tests/journeys/JOURNEY_EVIDENCE_EXCLUDE.ts` |

Keep ownership evidence on the actual selected host. Exclusion carriers contain only one reviewed exclusion per target scope and never contain ownership evidence. Providers are not selected hosts and carry neither tag.

## Behavioral Proof

Proof must be target-specific. A test or journey must perform the relevant action and assert the claimed result, refusal, state, or effect. Imports, registries, callability checks, and route or rendering smoke prove only availability or reachability; they cannot carry unrelated requirements.

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

Do not start backend `pnpm check:watch` while the first backend draft is still being populated. The first selected host activates its complete claim, so an incomplete draft can produce graph-wide diagnostics for artifacts that are about to be created.

Confirm `NESTIA_SDK_TRANSFORM` is absent. Complete the first backend draft, then start `pnpm check:watch`. The compiler owns target resolution, host eligibility, overlap, coverage, and missing acknowledgements. Fix the complete diagnostic batch and wait for a clean rebuild. Stop the watcher afterward so this compiler gate remains a bounded check of the current graph and cannot overlap the next generator, runtime command, or phase.

At each gate, confirm the canonical claim configurations remain unchanged, wait for clean current builds, and run the phase's runtime tests. Never weaken the graph or falsify an acknowledgement to silence a diagnostic.

## Final Checklist

- [ ] Canonical claims remain unchanged and `evidence/graph` remains `error`.
- [ ] `NESTIA_SDK_TRANSFORM` was absent from every compiler gate.
- [ ] Every acknowledgement truthfully matches its target and actual host; none exists only to satisfy the compiler.
- [ ] Every behavioral acknowledgement is supported by the target-specific action and assertion it claims.
- [ ] Every exclusion names the actual owner or observable alternative and a concrete invalidating condition.
- [ ] Current compiler and runtime gates passed after the latest scoped change.

Any unchecked item leaves the current Goal active. Fix its cause and rerun every affected current-state gate.
