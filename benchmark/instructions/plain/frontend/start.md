# Frontend Start

Read `AGENTS.md` and every document under `.agents/skills/frontend/` in full before working, and obey them throughout this objective.

This stage owns only the complete first implementation of the frontend and its live integration. Do not perform the review yet.

Ensure `pnpm dev` is running from `packages/backend`. Start `pnpm dev` from `packages/frontend` as a persistent background process before implementation, monitor both processes, and keep them running through Overall Final. Fix every type or lint diagnostic they report, and complete an objective only after the current live application reloads without error.

1. Read every file under `docs/analysis/` and `packages/api/src/` in full, without omitting a single requirement, operation, DTO, property, or contract detail.
2. Based on the requirements and the fixed SDK, implement every domain hook under `packages/frontend/src/lib/`, so that every published accessor is called by a hook. Then implement every required screen and user journey under `packages/frontend/src/` without omitting any required behavior or API-backed capability.
3. Write test programs under `packages/frontend/tests/journeys/` that cover every requirement-backed user journey without a single omission.
4. When the frontend implementation is complete, run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false` to verify it and fix every failure.

## Final Checklist

- [ ] Every required domain hook, screen, state, interaction, and browser journey implemented.
- [ ] Every published SDK accessor is called by a hook, every hook is used by a screen, and every screen is walked by a journey.
- [ ] Every upstream correction regenerated the SDK and re-passed the backend gate.
- [ ] Backend and frontend processes reloaded cleanly after the latest scoped change.
- [ ] Live-backend `pnpm test:e2e` passed against the current implementation.

Any unchecked item leaves the Goal active. Complete it and rerun every affected current-state gate.
