# Frontend Check

Read [SKILL.md](SKILL.md) first. The `frontend-screens` and `frontend-journeys` claims cover requirement-to-screen and requirement/screen-to-journey acknowledgement. SDK-to-frontend consumption remains a manual residual edge in both arms.

## Screen And Journey Evidence

Put requirement citations on the exported page function selected by `frontend-screens`. Put requirement and `{@link PageFunction}` citations on the exported browser-journey function selected by `frontend-journeys`; the page symbol must resolve through an import in that file.

Use the narrowest leaf requirement. An H2 scope requires a recorded audit of every selected H3 descendant. A deliberate screen omission uses `@evidenceExclude` only with a requirement-backed reason, named alternative owner, and veto condition; “not needed for MVP” does not satisfy a fixed specification.

## SDK Residual Edge

Enumerate generated SDK accessors from exports. Map every product-facing operation to consuming screens or journeys, or to a reasoned omission in `packages/frontend/wiki/omissions.md`. Then walk every route, page, hook, form, and journey back to requirements and consumed operations. Record the current mapping in `wiki/completeness/residual.md`.

The controller owns the operation; generated `packages/api/src/functional/**` transports it. Never edit generated accessors, redeclare DTOs, or add an ad hoc fetch path to bypass a missing public contract.

## Integrity

Verify reachability, action/results, loading, empty, error, authorization, responsive layout, and main browser journeys. Simulation proves typed shape and UI flow. Live verification proves persistence, sessions, authorization, and side effects. Keep those verdicts separate.
