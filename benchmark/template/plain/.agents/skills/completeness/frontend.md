# Frontend Check

Read [SKILL.md](SKILL.md) first. This check covers user-visible requirements and published SDK capabilities to screens, then screens to browser journeys and every frontend artifact back to an owner.

## Requirement And SDK Walk

For every user-visible H2/H3 identity, map the reachable route, screen, action, displayed result, failure feedback, authorization state, loading state, empty state, and responsive behavior that realizes it.

Enumerate generated SDK accessors from their exports. For each product-facing operation, map the screen or journey that consumes it or record a requirement-backed deliberate omission in `packages/frontend/wiki/omissions.md`. Infrastructure and administrator-only operations may be omitted only with an explicit owner and reason.

The controller owns an operation and the generated SDK transports it. Never edit `packages/api/src/functional/**`, invent a local DTO, or write an ad hoc fetch path to bypass a missing contract.

## Reverse Walk

Enumerate routes, page components, data hooks, forms, and browser journeys. Map each to requirements and the SDK operations it consumes. Verify that every page is reachable, every mutation's result is surfaced, and no screen exists only because similar products usually have one.

For every screen, require a browser journey or presentation check that exercises its main states. Simulation proves typed shape and interface flow; live verification proves persistence, session, authorization, and side effects. Record those meanings separately.

## Consequences

An API change invalidates its screen and journey mappings. A screen change invalidates affected browser verification. A deliberate omission is a reviewable claim, not a way to close an unmatched SDK row.
