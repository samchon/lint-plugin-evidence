# Screens

The `frontend-screens` claim selects exported page functions and references Markdown H2/H3 sections. The `frontend-journeys` claim references those page functions from browser journeys. The following declaration excerpt demonstrates tag placement only; the base Screens skill still owns the complete component body.

```tsx
/**
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Lets a
 *           customer search, filter, and page through visible sales.
 */
export function CatalogPage() {}
```

State what a user can do, not merely what data renders. Prefer leaf H3 targets; a broad H2 requires an audit of every selected descendant.

## Evidence Stub Marker

In the Evidence arm, write `@todo <remaining implementation>` in place of the base screen guide's general implementation-pending sentence. Keep the tag while the page returns its placeholder body, make its text enumerate the states and integration still owed, and remove it only after the screen is complete against simulation with its gallery rows.

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

[Evidence Lint](../evidence/SKILL.md) owns the common exclusion rules. This carrier settles only `frontend-screens`; every other claim remains independent.

<!-- benchmark-template-splice: base-body -->
{{base}}

## SDK Consumption

No claim mechanically binds SDK accessors to screens. The base Frontend skill and omission log own complete product consumption; Evidence review does not add a second unconfigured SDK-to-screen census. Never edit generated accessors or add an ad hoc transport path.
