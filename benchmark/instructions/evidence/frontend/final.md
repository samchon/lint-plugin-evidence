# Evidence Frontend Final

Finish the frontend with canonical claims continuously active.

Before any action, re-read these exact files in full: `AGENTS.md`, `.agents/skills/project/SKILL.md`, `.agents/skills/requirements/SKILL.md`, `.agents/skills/api/SKILL.md`, `.agents/skills/frontend/SKILL.md`, `.agents/skills/frontend/architecture.md`, `.agents/skills/frontend/sdk.md`, `.agents/skills/frontend/screens.md`, `.agents/skills/frontend/verification.md`, `.agents/skills/evidence/SKILL.md`, and `.agents/skills/review/SKILL.md`.

Keep `packages/backend/lint.config.ts` and `packages/frontend/lint.config.ts` unchanged. Empty configured targets activate automatically when real exports exist.

From `packages/frontend`, run `pnpm build`, `pnpm test:e2e`, and `pnpm ui:review`; run required journeys against the live backend and inspect browser output. Backtrack and re-pass the backend gate if this stage proves or causes an owning backend defect.

Then start a fresh review at the first active frontend population. Any finding, edit, formatting, generated change, diagnostic, or failed gate requires an owning fix and complete restart. Require `rg --hidden -n -F '@todo' packages/frontend --glob '*.ts' --glob '*.tsx'` to return no match. Do not run the root build or claim overall completion. Report exact results.
