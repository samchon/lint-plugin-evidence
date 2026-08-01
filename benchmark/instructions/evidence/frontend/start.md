# Evidence Frontend Start

Read `AGENTS.md` and every document under `.agents/skills/frontend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

Implement the complete frontend against the fixed SDK and live backend. Do not perform the review yet.

Add each `@evidence` acknowledgement to the screen or journey that actually owns the cited target, and state the exact responsibility that connects them. Use `@evidenceExclude` only when the target does not belong to the claim; name the actual owner or observable alternative and the condition that would invalidate the exclusion. Never create a fake citation or exclusion solely to evade compiler errors.

Ensure `pnpm dev` is running from `packages/backend`. Start `pnpm dev` from `packages/frontend` before implementation and keep both processes running through Overall Final because the live application and Vite's incremental compiler are the frontend execution and diagnostic environment. Do not chase graph-wide missing-coverage diagnostics one by one while the first draft is still gaining screens and journeys; after the complete first draft exists, fix the current diagnostic batch and require an error-free reload.

1. Implement every required screen and user journey under `packages/frontend/src/`. Each screen must cite the exact requirement it delivers.
2. Write test programs under `packages/frontend/tests/journeys/` for every requirement-backed user journey. Each journey must cite the requirement and screens it exercises.
3. After the complete frontend draft, start a bounded backend `pnpm check:watch` with the canonical graph active, wait for a clean rebuild, then stop the watcher. Require clean frontend `pnpm lint`.
4. Complete the live-backend integration, then run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false` and fix every failure.

## Final Checklist

- [ ] Every required screen, state, interaction, and journey implemented.
- [ ] Every `@evidence` is a justified citation and every `@evidenceExclude` a genuine exclusion; none was created solely to evade compiler errors.
- [ ] Canonical graph configuration stayed active and current backend graph and frontend lint gates passed.
- [ ] Live-backend `pnpm test:e2e` passes against the current implementation.

Any unchecked item leaves the Goal active. Complete it and rerun every affected current-state gate.
