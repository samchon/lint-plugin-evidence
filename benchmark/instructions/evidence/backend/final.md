# Evidence Backend Final

Finish the backend with the canonical Evidence configuration continuously active; there is no deferred configuration to restore.

Before any action, re-read these exact files in full: `AGENTS.md`, `.agents/skills/project/SKILL.md`, `.agents/skills/requirements/SKILL.md`, `.agents/skills/api/SKILL.md`, `.agents/skills/backend/SKILL.md`, `.agents/skills/backend/testing.md`, `.agents/skills/backend/wiring.md`, `.agents/skills/evidence/SKILL.md`, and `.agents/skills/review/SKILL.md`.

Confirm `packages/backend/lint.config.ts` is unchanged. Empty targets are inactive until real exports activate them, and excluded infrastructure remains outside the configured population.

From `packages/backend`, run serially: `pnpm build:prisma`, `pnpm prepare:database`, `pnpm build:api`, `pnpm build:main`, `pnpm build:sdk`, `pnpm build:test`, `pnpm lint`, `pnpm test`, and live-server checks. Run SDK generation only after operations and DTOs settle.

Then start a fresh review at the first active backend claim population. Any finding, edit, formatting, generated change, diagnostic, or failed gate requires an owning fix and a restart at the first population. From the root, require `rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'` to return no match. Do not accept frontend obligations. Report exact commands and results.
