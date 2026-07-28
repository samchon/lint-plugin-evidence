# Screens

The `frontend-screens` claim selects exported page functions and references Markdown H2/H3 sections. The `frontend-journeys` claim references those page functions from browser journeys. Read [the frontend completeness check](../completeness/frontend.md) first.

```tsx
/**
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Lets a
 *           customer search, filter, and page through visible sales.
 */
export function CatalogPage() {}
```

State what a user can do, not merely what data renders. Prefer leaf H3 targets; a broad H2 requires an audit of every selected descendant. An exclusion needs a requirement-backed omission, actual owner, and veto condition.

<!-- benchmark-template-splice: base-body -->
{{base}}

## SDK Residual Edge

No claim mechanically binds SDK accessors to screens. Manually map every product-facing operation to consuming screens/journeys or a reviewed omission, and map every screen back to its requirements and consumed operations. Never edit generated accessors or add an ad hoc transport path.
