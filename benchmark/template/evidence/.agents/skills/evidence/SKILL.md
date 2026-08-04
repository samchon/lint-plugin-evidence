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

A claim with `disabled: true` is inactive even when its selector materializes a host. Its configuration is still validated.

When the layer named by the adjacent comment is complete, delete that comment and the claim's final `disabled: true` property, and nothing else. Delete it in the configuration that declares that claim, which the Configured Claims table names. Do not replace it with `false` or restore it later.

An enabled claim is active only when its own `root`, `files`, and `symbol` selector materializes at least one selected host. If the successfully loaded host population is empty, the entire claim is inactive and none of its reference obligations runs.

This rule applies equally to TypeScript, Prisma, and Markdown claims.

For TypeScript, the selector uses semantic exported symbols. With `symbol: "function"`, a file containing only exported non-function variables has zero selected hosts and the claim remains inactive. An exported `const` initialized with an arrow or function expression is a function; an ordinary exported variable is a property.

For Prisma, a claim selecting `model` remains inactive until a matching schema input contains a model. For Markdown, a claim remains inactive until its matching documents contain a host selected by its symbol selector.

An unreadable or invalid configured input is not an empty population. Loader and parse failures remain diagnostics. Inactivity prevents future-layer coverage from firing before that layer has a host; it does not prove the requirements need no host.

Do not add or remove claim objects or change any other claim field as implementation advances. After `disabled` is deleted, activation follows the current selected host population automatically.

## Configured Claims

| Configuration | Claim | Host | References |
| --- | --- | --- | --- |
| `packages/backend/test/lint.config.ts` | `schema-models` | Prisma models | requirement H2/H3 |
| same | `api-operations` | exported controller functions | requirement H2/H3 and Prisma models |
| `packages/api/lint.config.ts` | `dto-types` | exported DTO types | requirement H2/H3 and Prisma models |
| same | `dto-properties` | exported DTO properties | Prisma columns |
| `packages/backend/test/lint.config.ts` | `backend-tests` | exported test functions | requirements and SDK operations |
| `packages/frontend/lint.config.ts` | `frontend-screens` | exported page functions | requirement H2/H3 and hook functions |
| same | `frontend-journeys` | exported journey functions | requirements and page functions |
| same | `frontend-hooks` | exported hook functions | SDK operations |

A claim is declared in the configuration of the Program its hosts live in, and a claim cannot reach a population its own `tsconfig` does not include. The authored DTOs under `packages/api/src/structures/` belong to the API Program, so `dto-types` and `dto-properties` are declared in `packages/api/lint.config.ts`. Every backend claim is declared in `packages/backend/test/lint.config.ts`, because `test/tsconfig.json` compiles the backend source together with the tests and is therefore the one Program that holds controllers and test functions alike; the package Program sees only `src/` and could never reach `test/features/`. The frontend is one Program and one configuration.

The frontend claims form one chain: a hook answers for the operations it calls, a screen answers for the hooks it uses, and a journey answers for the screens it walks. Owning an operation is not delivering it, so a hook wrapping an accessor no screen renders fails at the screen claim rather than passing on the hook claim alone.

Both SDK operation obligations refuse `@evidenceExclude`. Every published operation is proved by a backend test and called by a frontend hook, or the product is incomplete, and "not applicable" is the sentence that hides the second case.

They differ in cardinality. A backend test admits exactly one operation, because a test citing eight operations proves only that eight names appear in its JSDoc — cite the one it answers for and let its prerequisites stay uncited. A hook may cite as many as it calls, because consuming the published surface is the obligation and how the calls are grouped is not.


All three configuration files and all claim objects are frozen except for the prescribed deletion of each predeclared `disabled` property. Keep `evidence/graph` at `error`. Each backend Program has its own `tsconfig.json`, and the test one compiles the backend source together with the tests. Do not create phase-specific config or compiler files.

No environment value turns the graph off. `evidence/graph` is `error` in every gate, and a result produced with it weakened is invalid.

## Placement

| Claim | `@evidence` host | Exclusion carrier |
| --- | --- | --- |
| `schema-models` | model `///` comment | `prisma/schema/exclude.schema` |
| `dto-types`, `dto-properties` | exported type or property JSDoc | `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` |
| `api-operations` | controller method JSDoc | `src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts` |
| `backend-tests` | exported test function JSDoc | `test/features/TEST_EVIDENCE_EXCLUDE.ts`, requirements only |
| `frontend-screens` | exported page function JSDoc | `src/components/SCREEN_EVIDENCE_EXCLUDE.ts`, requirements only |
| `frontend-journeys` | exported journey function JSDoc | `tests/journeys/JOURNEY_EVIDENCE_EXCLUDE.ts` |
| `frontend-hooks` | exported hook function JSDoc | none; operations admit no exclusion |

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

TypeScript targets use imported inline links, resolved through the citing module's own imports:

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

The cited operation is the one the test proves. Prerequisite and follow-up calls are not cited; they are setup and observation, and the operation reference admits one citation per test.

Import the SDK as a namespace. A default import binds the target name under `default`, so `{@link api.functional...}` then resolves to nothing. Use `import type` for a citation-only type import. Braces in `{@link ...}` are required.

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

Mark unfinished work with:

```text
@todo <specific remaining implementation>
```

Place it on temporary controller and page stubs. Remove it when the real provider delegation or completed screen replaces the stub. Do not add `evidence/todo`; the graph workload is frozen.

Before a phase completes, require no source-owned marker:

```bash
rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'
rg --hidden -n -F '@todo' packages/frontend --glob '*.ts' --glob '*.tsx'
```

## Compiler Gates

Start backend `pnpm check:watch` once before implementation while every backend claim is disabled. Start frontend `pnpm dev` once before frontend implementation while every frontend claim is disabled. After `disabled` is removed, the first selected host activates its complete claim, so an incomplete layer can produce graph-wide diagnostics for artifacts that are about to be created.

At each completed layer, delete the prescribed `disabled` property from the configuration that declares that claim. The compiler owns target resolution, host eligibility, overlap, coverage, and missing acknowledgements. Fix the complete diagnostic batch and wait for a clean rebuild or reload. Keep both compiler processes running through Overall Final.

At each gate, confirm no other claim configuration changed and wait for clean current builds. Run the runtime tests your objective requires; where it leaves them to your judgement, weigh that the compiler processes report type and lint diagnostics only and cannot tell you a behavior stopped working. Never weaken the graph or falsify an acknowledgement to silence a diagnostic.

## Final Checklist

- [ ] Every claim for the current phase is enabled; all other claim configuration remains unchanged and `evidence/graph` remains `error`.
- [ ] Every acknowledgement truthfully matches its target and actual host; none exists only to satisfy the compiler.
- [ ] Every behavioral acknowledgement is supported by the target-specific action and assertion it claims.
- [ ] Every exclusion names the actual owner or observable alternative and a concrete invalidating condition.
- [ ] Current compiler and runtime gates passed after the latest scoped change.

Any unchecked item leaves the current Goal active. Fix its cause and rerun every affected current-state gate.
