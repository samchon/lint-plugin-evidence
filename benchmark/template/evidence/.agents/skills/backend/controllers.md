# Operations

The `api-operations` claim selects exported controller operations and independently requires acknowledgement of Markdown H2/H3 sections and Prisma models.

Write the operation's narrowest truthful citations when its public contract is declared. The operation host owns route, actor, authorization, parameters, response, failures, and exposed models; the provider later owns implementation.

```ts
/**
 * Lists sales visible to the authenticated seller.
 *
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Serves the
 *           seller's visibility-filtered browsing capability.
 * @evidence prisma:shopping_sales Exposes persisted sale identity and lifecycle.
 */
@core.TypedRoute.Patch()
public async index(): Promise<IPage<IShoppingSale.ISummary>> {
  // ...
}
```

## Evidence Stub Marker

In the Evidence arm, write `@todo <remaining implementation>` in place of the base controller guide's general implementation-pending sentence. Keep the tag on every random-answer operation stub, make its text name the provider work still owed, and remove it only when the stub body becomes its real provider delegation.

## Excluding A Requirement Or Model From Operations

Collect `api-operations` exclusions on the exported const in `packages/backend/src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts`. The const is a claim-local carrier rather than an operation owner; keep truthful `@evidence` on selected controller methods.

```ts
/**
 * @evidenceExclude docs/analysis/05-user-experience.md#empty-state-copy
 *                  CatalogPage owns this presentation-only requirement; reject
 *                  this exclusion if it gains an API response or failure rule.
 * @evidenceExclude prisma:shopping_login_attempts
 *                  AuthenticationProvider owns this internal security record;
 *                  reject this exclusion if any endpoint exposes it.
 */
export const CONTROLLER_EVIDENCE_EXCLUDE = true;
```

[Evidence Lint](../evidence/SKILL.md) owns the common exclusion rules. This carrier settles only `api-operations`; every other claim remains independent.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Contract Change

Regenerate the SDK and OpenAPI document, then invalidate provider, test, and frontend reviews that depended on the previous contract. Never edit a graph population to silence a diagnostic. The configured `api-operations` claim activates automatically when its first selected exported operation appears; [Evidence Lint](../evidence/SKILL.md) owns that activation boundary.
