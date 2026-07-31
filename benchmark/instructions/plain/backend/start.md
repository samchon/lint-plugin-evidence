# Plain Backend Start

Read `AGENTS.md` and every document under `.agents/skills/backend/` in full before working, and obey them throughout this objective.

This stage owns only the complete first implementation of the API and backend. Do not implement the frontend or perform the Plain review yet.

1. Read every file under `docs/analysis/` in full, without omitting a single file, section, or requirement.
2. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. When the whole schema is settled, run `pnpm build:prisma` and `pnpm schema` from `packages/backend`.
3. Design every API operation under `packages/backend/src/controllers/` and every request and response DTO under `packages/api/src/structures/`. Write the complete contracts as controller stubs before implementing business logic.
4. When all controllers and DTOs are settled, run `pnpm build:main` from `packages/backend`.
5. Run `pnpm build:sdk` once to generate the SDK under `packages/api/src/functional/`.
6. Write comprehensive requirement-derived tests under `packages/backend/test/features/` against the fixed API contract.
7. Implement transformers under `packages/backend/src/transformers/`, collectors under `packages/backend/src/collectors/`, and business logic under `packages/backend/src/providers/`. Replace every controller stub with its real provider delegation.
8. Run `pnpm build:test`, `pnpm lint`, and `pnpm test` from `packages/backend`, then launch the backend and verify `/health` and representative requirement-backed operations live.

Run commands only after each complete group is authored. Diagnose and fix the owning source before rerunning a failed command.
