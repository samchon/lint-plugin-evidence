# Evidence Backend Start

Build the complete API and backend required by `docs/analysis/**`; do not implement `packages/frontend`.

Before any action, re-read these exact files in full: `AGENTS.md`, `.agents/skills/project/SKILL.md`, `.agents/skills/requirements/SKILL.md`, `.agents/skills/api/SKILL.md`, `.agents/skills/backend/SKILL.md`, `.agents/skills/backend/database.md`, `.agents/skills/backend/dtos.md`, `.agents/skills/backend/transformers.md`, `.agents/skills/backend/collectors.md`, `.agents/skills/backend/providers.md`, `.agents/skills/backend/controllers.md`, `.agents/skills/backend/authorization.md`, `.agents/skills/backend/testing.md`, `.agents/skills/backend/wiring.md`, `.agents/skills/evidence/SKILL.md`, and `.agents/skills/review/SKILL.md`.

Keep `packages/backend/lint.config.ts` fixed. Empty configured targets are inactive until real exports appear; excluded infrastructure stays outside the claim. Execute this dependency order exactly:

1. Read and inventory every requirement.
2. Design the complete Prisma schema.
3. From `packages/backend`, run `pnpm build:prisma` and `pnpm prepare:database`.
4. Author complete flat exported DTOs in `packages/api/src/structures`.
5. Run `pnpm build:api`.
6. Implement transformers, collectors, providers, authorization, and every controller operation.
7. Run `pnpm build:main`.
8. Only after all operations and DTOs settle, run `pnpm build:sdk`.
9. Write comprehensive requirement-derived backend tests.
10. Run `pnpm build:test`, `pnpm lint`, `pnpm test`, and the live-server checks.

Add truthful Evidence annotations as targets activate. Run commands serially; do not use the backend aggregate build or workspace-root build. A missing requirement, false citation, graph diagnostic, stub, failed gate, or stale generated output leaves this objective incomplete. Report exact commands and results.
