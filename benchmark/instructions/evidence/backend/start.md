# Evidence Backend Start

Read `AGENTS.md` and every document under `.agents/skills/backend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

This stage owns only the complete first implementation of the API and backend. Do not implement the frontend or perform the review yet. Add truthful Evidence annotations to real claim hosts as they appear; never create an artifact merely to activate a claim.

1. Read every file under `docs/analysis/` in full, without omitting a single file, section, or requirement.
2. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. When the whole schema is settled, run `pnpm build:prisma`, `pnpm schema`, and `pnpm lint` from `packages/backend`.
3. Based on the requirements under `docs/analysis/` and the database design under `packages/backend/prisma/schema/`, design every API controller under `packages/backend/src/controllers/` and every DTO under `packages/api/src/structures/` without omitting any required operation or data contract. When the complete contract is settled, run `pnpm build:main` and `pnpm lint` from `packages/backend`.
4. Run `pnpm build:sdk` and then `pnpm lint` from `packages/backend`, then write test programs under `packages/backend/test/features/` that cover every requirement and API operation without a single omission.
5. When the backend implementation is complete, run `pnpm lint` and `pnpm test` from `packages/backend` to verify it and fix every failure.
