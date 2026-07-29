# Screens

Every user-visible requirement needs a reachable screen and every screen needs requirement and SDK-operation owners. A type-correct frontend can still omit the entire user journey.

Map every user-visible requirement forward to its reachable route, action, visible result, consumed SDK operation, and browser journey. Include loading, empty, error, retry, invalidation, permission, refusal, and responsive states. Then reverse-walk every route, page, hook, form, and action to a requirement and public operation owner.

<!-- benchmark-template-splice: base-body -->
{{base}}

## SDK Ownership

Controllers own public operations; generated accessors transport them. Map product-facing accessors to consuming screens/journeys or reviewed requirement-backed omissions. Never edit generated accessors, redeclare DTOs, or add an ad hoc fetch path.

After a contract or screen change, recheck every affected screen and browser journey against the changed source. Record project-specific screen ownership in the existing screen plan, never by editing the frozen method.
