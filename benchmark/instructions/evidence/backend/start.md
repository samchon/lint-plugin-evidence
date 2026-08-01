# Evidence Backend Start

Read `AGENTS.md` and every document under `.agents/skills/backend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

Implement the complete API and backend from the requirements. Do not implement the frontend or perform the review yet.

Write every `@evidence` and `@evidenceExclude` as the Evidence skill requires. Do not add either tag only to remove a compiler diagnostic.

## First Draft

Complete the first draft in this order before starting `pnpm check:watch`.

1. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. Run backend `pnpm build:prisma` and `pnpm schema`.
2. Design every controller under `packages/backend/src/controllers/` and every DTO under `packages/api/src/structures/`. Run backend `pnpm build:sdk`.
3. Write public-operation tests under `packages/backend/test/features/` for every requirement and API operation.
4. Finish every provider. Replace every controller stub and remove every source-owned `@todo` under `packages/api` and `packages/backend`.

## Bounded Compiler Gate

`evidence/graph` starts checking `@evidence` and `@evidenceExclude` when the first Prisma model, DTO, controller operation, or test function exists.

Starting before that layer is complete emits hundreds or thousands of errors for tags not written yet. The output fills context and impairs implementation decisions.

After every first-draft schema model, DTO, controller, provider, and public-operation test is present, confirm `NESTIA_SDK_TRANSFORM` is absent and start backend `pnpm check:watch`.

Fix the complete diagnostic batch and wait for a clean rebuild, then stop the watcher after that rebuild so it cannot overlap another command or objective. Run backend `pnpm test` after the watcher stops and fix every failure. Any fix requires another bounded `pnpm check:watch` clean rebuild and stop before rerunning the tests.

## Final Checklist

- [ ] Every required schema model, DTO, controller, public-operation test, and provider implemented.
- [ ] Every `@evidence` is on code that implements, represents, or proves its linked requirement, Prisma item, API operation, or DTO.
- [ ] Every `@evidenceExclude` names its owner or alternative and invalidating condition; none exists only to remove a diagnostic.
- [ ] The bounded backend watcher stopped after a rebuild without diagnostics after the last backend change.
- [ ] Prisma generation followed the last schema change, SDK generation followed the last API change, and `pnpm test` exits with code 0.

Any unchecked item leaves the Goal active. Complete that item before proceeding.
