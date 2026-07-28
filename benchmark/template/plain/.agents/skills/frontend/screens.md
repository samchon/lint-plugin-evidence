# Screens

Every user-visible requirement needs a reachable screen and every screen needs requirement and SDK-operation owners. A type-correct frontend can still omit the entire user journey.

Read [the frontend completeness check](../completeness/frontend.md) before screen work. Record the route, user action, visible result, required states, consumed SDK operations, and browser journey for each page, then walk every route/page/hook/form back to those owners.

<!-- benchmark-template-splice: base-body -->
{{base}}

## SDK Ownership

Controllers own public operations; generated accessors transport them. Map product-facing accessors to consuming screens/journeys or reviewed requirement-backed omissions. Never edit generated accessors, redeclare DTOs, or add an ad hoc fetch path.

After a contract or screen change, invalidate affected frontend and browser-journey mappings at the current digest. Record project-specific structure in the project ledger, never by editing the frozen method.
