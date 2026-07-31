# Frontend Start

Read `AGENTS.md` and every document under `.agents/skills/frontend/` in full before working, and obey them throughout this objective.

This stage owns only the complete first implementation of the frontend and its live integration. Do not perform the review yet.

Start `pnpm dev` from `packages/frontend` as a persistent background process before implementation, monitor its output, and keep it running through every frontend objective. Fix every type or lint diagnostic it reports, and complete an objective only after the current application reloads without error.

1. Read every file under `docs/analysis/` and `packages/api/src/` in full, without omitting a single requirement, operation, DTO, property, or contract detail.
2. Based on the requirements and the fixed SDK, implement every required screen and user journey under `packages/frontend/src/` without omitting any required behavior or API-backed capability.
3. Write test programs under `packages/frontend/tests/journeys/` that cover every requirement-backed user journey without a single omission.
4. When the frontend implementation is complete, run `pnpm test:e2e` from `packages/frontend` to verify it and fix every failure.
