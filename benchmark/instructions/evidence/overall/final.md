# Evidence Overall Final

Complete the Evidence application only when every requirement, canonical claim, package gate, browser journey, and live check is current and green.

Before any action, re-read these exact files in full: `AGENTS.md`, `.agents/skills/project/SKILL.md`, `.agents/skills/requirements/SKILL.md`, `.agents/skills/api/SKILL.md`, `.agents/skills/backend/SKILL.md`, `.agents/skills/frontend/SKILL.md`, `.agents/skills/evidence/SKILL.md`, and `.agents/skills/review/SKILL.md`.

Keep `packages/backend/lint.config.ts` and `packages/frontend/lint.config.ts` unchanged. Empty targets activate automatically when populated; excluded infrastructure stays excluded.

From the root, run `pnpm format`, `pnpm build`, `pnpm lint`, `pnpm prepare:database`, and `pnpm test`. From `packages/frontend`, run `pnpm ui:review`, then complete live-backend and browser verification.

After all gates, start a fresh whole-project Evidence review at the first active population. A prior review, digest, inventory, graph result, or gate is not review evidence. Any source, configuration, generated, formatting, diagnostic, or gate change invalidates the traversal; fix, regenerate, re-run affected gates, and restart from the first population.

Require `rg --hidden -n -F '@todo' packages --glob '*.ts' --glob '*.tsx'` to return no match. Any false citation, unverified active target, marker, failed gate, or unrealized requirement leaves this objective incomplete. Report exact commands and results.
