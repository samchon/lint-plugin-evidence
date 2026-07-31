# Plain Backend Start

Read `AGENTS.md` and every document under `.agents/skills/backend/` in full before working, and obey them throughout this objective.

This stage owns only the complete first implementation of the API and backend. Do not implement the frontend or perform the Plain review yet.

1. Read every file under `docs/analysis/` in full, without omitting a single file, section, or requirement.
2. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. When the whole schema is settled, run `pnpm build:prisma` and `pnpm schema` from `packages/backend`.
3. Design every API operation under `packages/backend/src/controllers/` and every request and response DTO under `packages/api/src/structures/`. Compare them with the complete requirement inventory and do not proceed while any requirement, API operation, request, response, or contract detail is omitted.
4. When the API is ready, run `pnpm build:sdk` from `packages/backend`, then write test programs under `packages/backend/test/features/` that cover every requirement and API operation without a single omission.
5. Run `pnpm test` from `packages/backend`.
