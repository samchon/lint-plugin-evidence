# Plain Backend Start

Read `AGENTS.md` and every document under `.agents/skills/backend/` in full before working, and obey them throughout this objective.

This stage owns only the complete first implementation of the API and backend. Do not implement the frontend or perform the Plain review yet.

1. Read every file under `docs/analysis/` in full, without omitting a single file, section, or requirement.
2. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. When the whole schema is settled, run `pnpm build:prisma` and `pnpm schema` from `packages/backend`.
3. Design every API operation under `packages/backend/src/controllers/` and every request and response DTO under `packages/api/src/structures/`. Write the complete contracts as controller stubs before implementing business logic.
4. Compare the complete requirement inventory with the controller and DTO inventory. Do not proceed while any requirement, API operation, request, response, or contract detail is omitted.
5. When all controllers and DTOs are settled, run `pnpm build:main` from `packages/backend`.
6. Before writing any test program, run `pnpm build:sdk` once to generate the fixed SDK under `packages/api/src/functional/`.
7. Write comprehensive tests under `packages/backend/test/features/` that cover every requirement and API operation without a single omission.
8. Implement the complete backend logic and replace every controller stub with its real implementation.
9. Run `pnpm build:test`, `pnpm lint`, and `pnpm test` from `packages/backend`, then launch the backend and verify `/health` and representative requirement-backed operations live.

Run commands only after each complete group is authored. Diagnose and fix the owning source before rerunning a failed command.
