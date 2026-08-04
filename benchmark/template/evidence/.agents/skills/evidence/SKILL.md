---
name: evidence
description: Defines the Evidence Graph tag grammar, truthfulness rules, claim activation, configured claims, placement, exclusions, frozen configuration, and compiler gates. Read before Evidence implementation or handling a graph diagnostic; backend.md and frontend.md carry the per-phase configuration and unlock procedures.
---

# Evidence Graph

## Topics

- [backend.md](backend.md): which configuration declares which backend claim, the staged unlock order, and the operation reference. Read before Backend Start.
- [frontend.md](frontend.md): the frontend claim chain and its staged unlock order. Read before Frontend Start.

## Tags

```text
@evidence <target> <reason>
@evidenceExclude <target> <reason>
```

`@evidence` states that the host implements, represents, or proves the target. `@evidenceExclude` states that the claim does not apply to the target and names the actual owner or observable alternative plus the condition that would invalidate the exclusion.

Target and non-empty reason are mandatory. One acknowledgement covers the selected target and its selected descendants. Write the reason as a specific responsibility current code could falsify, not a restatement of the target name.

Every tag must truthfully describe the current host's relation to the target. Never write, move, consolidate, or invent an acknowledgement to pass the compiler: a diagnostic identifies an obligation, not the truthful acknowledgement for it, and a clean gate proves structure, not truth.

- Several hosts may cite the same target when each independently implements or proves it.
- One host cites one resolved target once.
- Within one claim-reference obligation, `@evidenceExclude` scopes never overlap each other or any `@evidence` scope, even across carriers.
- A parent target is truthful only when the host owns the complete selected subtree.

## Claim Activation

A claim with `disabled: true` is inactive even when its selector materializes a host; its configuration is still validated.

When the layer named by the adjacent comment is complete, delete that comment and the claim's final `disabled: true` property — nothing else — in the configuration that declares the claim. Do not replace it with `false` or restore it later.

An enabled claim is active only when its own `root`, `files`, and `symbol` selector materializes at least one selected host. With zero selected hosts the entire claim is inactive and none of its reference obligations runs. This applies to TypeScript, Prisma, and Markdown claims alike:

- TypeScript selects semantic exported symbols. Under `symbol: "function"`, an exported `const` initialized with an arrow or function expression is a function; an ordinary exported variable is a property and selects nothing.
- A Prisma `model` claim stays inactive until a matching schema input contains a model.
- A Markdown claim stays inactive until a matching document contains a selected host.

An unreadable or invalid configured input is not an empty population; loader and parse failures remain diagnostics. Do not add, remove, or change claim objects as implementation advances — after `disabled` is deleted, activation follows the selected host population automatically.

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

A claim is declared in the configuration of the Program its hosts live in. [backend.md](backend.md) states which backend configuration declares which claim and why; the frontend is one Program and one configuration.

All three configuration files and every claim object are frozen except the prescribed `disabled` deletions. Keep `evidence/graph` at `error` in every gate; no environment value turns the graph off, and a result produced with it weakened is invalid. Do not create phase-specific config or compiler files.

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

Keep ownership evidence on the actual selected host. An exclusion carrier holds one reviewed exclusion per target scope and never holds ownership evidence. Providers are not selected hosts and carry neither tag.

## Behavioral Proof

Proof must be target-specific: the test or journey performs the relevant action and asserts the claimed result, refusal, state, or effect. Imports, registries, callability checks, and route or rendering smoke prove only availability and cannot carry unrelated requirements.

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

Import the SDK as a namespace — a default import binds the target under `default`, so `{@link api.functional...}` resolves to nothing. `import type` works for a citation-only type import. The braces in `{@link ...}` are required.

The cited operation is the one the test proves. Prerequisite and follow-up calls are setup and observation; leave them uncited.

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

"Not applicable", "internal", "future work", and "not implemented" are conclusions, not reasons; name the actual owner or observable alternative and a concrete invalidating condition.

Schema exclusions are unattached top-level `/// @evidenceExclude` lines in `exclude.schema`, a lint-only file that is not a Prisma generation input.

## Stub Marker

Mark unfinished work with:

```text
@todo <specific remaining implementation>
```

Place it on temporary controller and page stubs; remove it when the real provider delegation or completed screen replaces the stub. `evidence/todo` fails the backend build on every remaining tag, where [backend.md](backend.md) states. The rule set is frozen: do not add or remove a rule.

Before a phase completes, both commands must return nothing:

```bash
rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'
rg --hidden -n -F '@todo' packages/frontend --glob '*.ts' --glob '*.tsx'
```

## Compiler Gates

After a claim's `disabled` is deleted, the first selected host activates the complete claim, so an incomplete layer floods the output with diagnostics for artifacts not yet created. Delete each `disabled` only at the staged point [backend.md](backend.md) or [frontend.md](frontend.md) prescribes, with that phase's compiler process already running.

The compiler owns target resolution, host eligibility, overlap, coverage, and missing acknowledgements. Fix the complete diagnostic batch and wait for a clean rebuild or reload; confirm no other claim configuration changed. The compiler processes report type and lint diagnostics only — they cannot tell you a behavior stopped working — so run the runtime tests your objective requires. Never weaken the graph or falsify an acknowledgement to silence a diagnostic.

## Final Checklist

- [ ] Every claim for the current phase is enabled; all other claim configuration remains unchanged and `evidence/graph` remains `error`.
- [ ] Every acknowledgement truthfully matches its target and actual host; none exists only to satisfy the compiler.
- [ ] Every behavioral acknowledgement is supported by the target-specific action and assertion it claims.
- [ ] Every exclusion names the actual owner or observable alternative and a concrete invalidating condition.
- [ ] Current compiler and runtime gates passed after the latest scoped change.

Any unchecked item leaves the current Goal active. Fix its cause and rerun every affected current-state gate.
