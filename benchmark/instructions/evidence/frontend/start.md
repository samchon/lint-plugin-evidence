# Evidence Frontend Start

Read `AGENTS.md` and every document under `.agents/skills/frontend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

Implement the complete frontend against the fixed SDK and live backend. Do not perform the review yet.

Write every `@evidence` and `@evidenceExclude` as the Evidence skill requires. Do not add either tag only to remove a compiler diagnostic.

## Development Stages

Complete these stages in order.

1. Implement every required screen, state, and interaction under `packages/frontend/src/`.
2. Write every requirement-backed journey under `packages/frontend/tests/journeys/`.

## Compiler Check

`evidence/graph` starts checking `@evidence` and `@evidenceExclude` when the first page or journey function exists.

Starting before that layer is complete emits hundreds or thousands of errors for tags not written yet. The output fills context and impairs implementation decisions.

1. After every screen is complete, start frontend `pnpm dev`.
   - Fix every diagnostic.
   - Stop it after a reload without diagnostics.
2. After every journey is complete, start frontend `pnpm dev` again.
   - Fix every diagnostic and wait for a reload without diagnostics.
   - Stop it after that clean reload.

Run frontend `pnpm lint` and fix every diagnostic. Require exit code 0.

## Runtime Check

Remove every source-owned `@todo` under `packages/frontend`.

Start `pnpm dev` from `packages/backend` and `packages/frontend` for the live integration check.

Run `pnpm test:e2e` with `VITE_API_SIMULATE=false`. Fix every failure. After the last fix, require a frontend reload without diagnostics and an E2E exit code of 0. Stop both development servers afterward so they cannot overlap the next objective.

## Final Checklist

- [ ] Every required screen, state, interaction, and journey implemented.
- [ ] The screen check finished before journey implementation began.
- [ ] Every `@evidence` is on a page or journey that delivers or proves its linked requirement or page function.
- [ ] Every `@evidenceExclude` names its owner or alternative and invalidating condition; none exists only to remove a diagnostic.
- [ ] Both frontend compiler checks stopped after a reload without diagnostics and frontend lint passes.
- [ ] Live-backend `pnpm test:e2e` exits with code 0 after the last frontend change.
- [ ] The backend and frontend development servers used by E2E stopped afterward.

Any unchecked item leaves the Goal active. Complete that item before proceeding.
