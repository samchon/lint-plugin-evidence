# Evidence Frontend Start

Read `AGENTS.md` and every document under `.agents/skills/frontend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

Implement the complete frontend against the fixed SDK and live backend. Do not perform the review yet.

Write every `@evidence` and `@evidenceExclude` as the Evidence skill requires. Do not add either tag only to remove a compiler diagnostic.

## Development Stages

Complete these stages in order.

1. Implement every required screen, state, and interaction under `packages/frontend/src/`.
2. Write every requirement-backed journey under `packages/frontend/tests/journeys/`.

## Compiler Check

`evidence/graph` starts checking `@evidence` and `@evidenceExclude` when a claim's `disabled` property is removed and the first page or journey function exists.

Removing `disabled` before that layer is complete emits hundreds or thousands of errors for tags not written yet. The output fills context and impairs implementation decisions.

Start `pnpm dev` from `packages/frontend` before implementation while every frontend claim is disabled.

1. After every screen is complete, delete `disabled` from `frontend-screens`.
   - Fix every diagnostic and complete their truthful evidence mappings.
   - Wait for a reload without diagnostics.
2. After every journey is complete, delete `disabled` from `frontend-journeys`.
   - Fix every diagnostic, complete their truthful evidence mappings, and wait for a reload without diagnostics.
   - Keep it running through Overall Final.

## Runtime Check

Remove every source-owned `@todo` under `packages/frontend`.

Start `pnpm dev` from `packages/backend`. Frontend `pnpm dev` is already running. Keep both running through Overall Final.

Run `pnpm test:e2e` with `VITE_API_SIMULATE=false`. Fix every failure. After the last fix, require a frontend reload without diagnostics and an E2E exit code of 0.

## Final Checklist

- [ ] Every required screen, state, interaction, and journey implemented.
- [ ] Every frontend claim is enabled; no other claim configuration changed.
- [ ] `frontend-screens` was enabled before journey implementation began.
- [ ] Every `@evidence` is on a page or journey that delivers or proves its linked requirement or page function.
- [ ] Every `@evidenceExclude` names its owner or alternative and invalidating condition; none exists only to remove a diagnostic.
- [ ] The persistent frontend `pnpm dev` process reloaded without diagnostics after the latest change and remains running.
- [ ] Live-backend `pnpm test:e2e` exits with code 0 after the last frontend change.

Any unchecked item leaves the Goal active. Complete that item before proceeding.
