# Evidence Backend Start

Read `AGENTS.md` and every document under `.agents/skills/backend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

Implement the complete API and backend from the requirements. Do not implement the frontend or perform the review yet.

Add each `@evidence` acknowledgement to the artifact that actually owns the cited target, and state the exact responsibility that connects them. Use `@evidenceExclude` only when the target does not belong to the claim; name the actual owner or observable alternative and the condition that would invalidate the exclusion.

1. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. Each model must cite the exact requirement it stores. When the schema is settled, run `pnpm build:prisma` and `pnpm schema` from `packages/backend`.
2. Design every API controller under `packages/backend/src/controllers/` and every DTO under `packages/api/src/structures/`. Each DTO type must cite its requirement and model, each DTO property its column, and each operation its requirement and model.
3. Run `pnpm build:sdk` from `packages/backend`.
4. Write test programs under `packages/backend/test/features/` for every requirement and API operation. Each test must cite the requirement, operation, and DTO contract it proves.
5. Complete the first draft of all backend logic before starting the Evidence compiler gate.
6. Start `pnpm check:watch` from `packages/backend`. Fix every diagnostic in complete graph-wide batches, wait for a clean rebuild, then stop the watcher before continuing.
7. Run `pnpm test` from `packages/backend` and fix every failure. Complete only after the clean watcher rebuild and runtime suite both succeed.
