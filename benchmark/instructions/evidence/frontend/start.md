# Evidence Frontend Start

Implement the complete frontend against the fixed SDK and live backend. Do not perform the review yet.

Add each `@evidence` acknowledgement to the screen or journey that actually owns the cited target, and state the exact responsibility that connects them. Use `@evidenceExclude` only when the target does not belong to the claim; name the actual owner or observable alternative and the condition that would invalidate the exclusion.

1. Implement every required screen and user journey under `packages/frontend/src/`. Each screen must cite the exact requirement it delivers.
2. Write test programs under `packages/frontend/tests/journeys/` for every requirement-backed user journey. Each journey must cite the requirement and screens it exercises.
3. Complete the live-backend integration, then run `pnpm lint` and `pnpm test:e2e` from `packages/frontend` and fix every failure.
