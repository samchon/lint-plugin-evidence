# Evidence Backend Start

Read `AGENTS.md` and the skill documents relevant to this objective before working.

Implement the complete API and backend from the requirements. Do not implement the frontend or perform the review yet.

Add each `@evidence` acknowledgement to the artifact that actually owns the cited target, and state the exact responsibility that connects them. Use `@evidenceExclude` only when the target does not belong to the claim; name the actual owner or observable alternative and the condition that would invalidate the exclusion.

Work in complete layer-sized batches. Never run build or lint commands after individual files or small edits; run each gate once after its entire batch is complete.

1. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. Each model must cite the exact requirement it stores. When the schema is settled, run `pnpm build:prisma`, `pnpm schema`, and `pnpm lint` from `packages/backend`.
2. Design every API controller under `packages/backend/src/controllers/` and every DTO under `packages/api/src/structures/`. Each DTO type must cite its requirement and model, each DTO property its column, and each operation its requirement and model. When the contract is settled, run `pnpm build:main` from `packages/backend`.
3. Run `pnpm build:sdk` from `packages/backend`.
4. Write test programs under `packages/backend/test/features/` for every requirement and API operation. Each test must cite the requirement, operation, and DTO contract it proves.
5. Complete the backend logic, then run `pnpm build:test` and `pnpm test` from `packages/backend` and fix every failure.
