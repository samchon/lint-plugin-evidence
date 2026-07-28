# Operations

The `api-operations` claim selects exported controller operations and independently requires acknowledgement of Markdown H2/H3 sections and Prisma models. Read [the API completeness check](../completeness/api.md) before declaring a stub.

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

An exclusion may use any selected operation as its carrier because it records a claim-wide non-exposure rather than a relationship to that operation. Choose a stable operation in the target's domain, and write a reason that names the actual owner or architectural consequence.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Contract Change

Regenerate the SDK and OpenAPI document, then invalidate provider, test, and frontend reviews that depended on the previous contract. Do not edit the frozen graph configuration to silence a diagnostic.
