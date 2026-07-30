# Screens

The `frontend-screens` claim selects exported page functions and references Markdown H2/H3 sections. The `frontend-journeys` claim references those page functions from browser journeys.

```tsx
/**
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Lets a
 *           customer search, filter, and page through visible sales.
 */
export function CatalogPage() {}
```

State what a user can do, not merely what data renders. Prefer leaf H3 targets; a broad H2 requires an audit of every selected descendant.

## Excluding A Requirement From Screens

Put `@evidenceExclude` on `packages/frontend/src/components/SCREEN_EVIDENCE_EXCLUDE.ts` when `frontend-screens` intentionally has no screen responsibility for a Markdown H2/H3 requirement.

```tsx
/**
 * @evidenceExclude docs/analysis/04-business-rules.md#idempotent-retry
 *                  CheckoutProvider and backend tests own this server-only
 *                  invariant; reject this exclusion if users can observe or
 *                  control retry state.
 */
export const SCREEN_EVIDENCE_EXCLUDE = true;
```

Name the actual owner and a condition that would veto the exclusion. “Backend-only” without naming the enforcing owner and observable boundary is insufficient. An H2 exclusion covers every selected H3 descendant, so use a leaf unless one omission decision is true for all descendants. Keep evidence and exclusion scopes disjoint within this claim-reference obligation. The exclusion says nothing about `frontend-journeys` or any backend claim.

<!-- benchmark-template-splice: base-body -->
{{base}}

## SDK Consumption

No claim mechanically binds SDK accessors to screens. The common Review skill still requires the complete SDK-to-screen population in both arms. Never edit generated accessors or add an ad hoc transport path.
