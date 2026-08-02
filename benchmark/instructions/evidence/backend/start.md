# Evidence Backend Start

Read `AGENTS.md` and every document under `.agents/skills/backend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

Implement the complete API and backend from the requirements. Do not implement the frontend or perform the review yet.

Write every `@evidence` and `@evidenceExclude` as the Evidence skill requires. Do not add either tag only to remove a compiler diagnostic.

## Development Stages

Complete these stages in order.

1. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. Run backend `pnpm build:prisma` and `pnpm schema`.
2. Design every controller under `packages/backend/src/controllers/` and every DTO under `packages/api/src/structures/`. Run backend `pnpm build:sdk`.
3. Write public-operation tests under `packages/backend/test/features/` for every requirement and API operation.
4. Finish every provider. Replace every controller stub and remove every source-owned `@todo` under `packages/api` and `packages/backend`.

## Compiler Check

`evidence/graph` starts checking `@evidence` and `@evidenceExclude` when the first Prisma model, DTO, controller operation, or test function exists.

Starting before that layer is complete emits hundreds or thousands of errors for tags not written yet. The output fills context and impairs implementation decisions.

1. After the Prisma schema is complete, start `pnpm check:watch`.
   - Fix every diagnostic.
   - Stop it after a rebuild without diagnostics.
2. After every DTO and controller is complete, start `pnpm check:watch` again.
   - Fix every diagnostic.
   - Stop it after a rebuild without diagnostics.
3. After every public-operation test is written, start `pnpm check:watch` again.
   - Fix every diagnostic and wait for a rebuild without diagnostics.
   - Keep it running through Frontend Final.
4. Finish every provider and controller body while the watcher runs.
   - Fix every new diagnostic and wait for a rebuild without diagnostics.
   - Run `pnpm test` and fix every failure.

Keep the watcher running because `pnpm test` does not report every type or lint diagnostic.

## Final Checklist

- [ ] Every required schema model, DTO, controller, public-operation test, and provider implemented.
- [ ] Every `@evidence` is on code that implements, represents, or proves its linked requirement, Prisma item, API operation, or DTO.
- [ ] Every `@evidenceExclude` names its owner or alternative and invalidating condition; none exists only to remove a diagnostic.
- [ ] The schema and API watchers stopped after a rebuild without diagnostics; the test-stage watcher remains running without diagnostics.
- [ ] Prisma generation followed the last schema change, SDK generation followed the last API change, and `pnpm test` exits with code 0.

Any unchecked item leaves the Goal active. Complete that item before proceeding.
