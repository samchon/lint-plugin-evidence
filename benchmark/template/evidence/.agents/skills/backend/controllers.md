# Operations

The `api-operations` claim selects exported controller operations and independently requires acknowledgement of Markdown H2/H3 sections and Prisma models.

Write the operation's narrowest truthful citations when its public contract is declared. The operation host owns route, actor, authorization, parameters, response, failures, and exposed models; the provider later owns implementation.

```ts
/**
 * Lists sales visible to the authenticated seller.
 *
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Serves the
 *           seller's visibility-filtered browsing capability.
 * @evidence prisma:ShoppingSale Exposes persisted sale identity and lifecycle.
 */
@core.TypedRoute.Patch()
public async index(): Promise<IPage<IShoppingSale.ISummary>> {
  // ...
}
```

## Excluding A Requirement Or Model From Operations

Collect `api-operations` exclusions on the exported const in `packages/backend/src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts`. The const is a claim-local carrier rather than an operation owner; keep truthful `@evidence` on selected controller methods.

```ts
/**
 * @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
 *                  CatalogPage owns this presentation-only requirement; reject
 *                  this exclusion if it gains an API response or failure rule.
 * @evidenceExclude prisma:LoginAttempt
 *                  AuthenticationProvider owns this internal security record;
 *                  reject this exclusion if any endpoint exposes it.
 */
export const CONTROLLER_EVIDENCE_EXCLUDE = true;
```

Name the actual owner plus a condition that would veto the exclusion. A Markdown H2 exclusion also covers every selected H3 descendant, and a Prisma model target covers that selected model scope, so use the narrowest truthful target. Keep evidence and exclusion scopes disjoint within this claim-reference obligation. The decision satisfies only `api-operations`; schema, DTO, test, and frontend claims remain independent.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Contract Change

Regenerate the SDK and OpenAPI document, then invalidate provider, test, and frontend reviews that depended on the previous contract. Never narrow a graph population to silence a diagnostic; temporary whole-claim deferral is governed by [Evidence Lint](../evidence/SKILL.md) and must be restored before completion.
