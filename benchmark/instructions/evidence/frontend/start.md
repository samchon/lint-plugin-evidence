# Evidence Frontend Start

Read `AGENTS.md` and every document under `.agents/skills/frontend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

Implement the complete frontend against the fixed SDK and live backend. Do not perform the review yet.

Add each `@evidence` acknowledgement to the screen or journey that actually owns the cited target, and state the exact responsibility that connects them. Use `@evidenceExclude` only when the target does not belong to the claim; name the actual owner or observable alternative and the condition that would invalidate the exclusion.

Start `pnpm dev` from `packages/frontend` as a persistent background process before implementation, monitor its output, and keep it running through every frontend objective. Fix every type, lint, or Evidence diagnostic it reports, and complete an objective only after the current application reloads without error.

1. Implement every required screen and user journey under `packages/frontend/src/`. Each screen must cite the exact requirement it delivers.
2. Write test programs under `packages/frontend/tests/journeys/` for every requirement-backed user journey. Each journey must cite the requirement and screens it exercises.
3. Complete the live-backend integration, then run `pnpm test:e2e` from `packages/frontend` and fix every failure.
