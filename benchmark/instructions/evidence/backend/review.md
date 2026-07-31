# Evidence Backend Review

Read `.agents/skills/review/SKILL.md` before working.

Review whether every backend `@evidence` and `@evidenceExclude` reason precisely and truthfully explains why it applies. Do not review the frontend.

Ensure `pnpm check:watch` is running from `packages/backend` so the compiler catches invalid evidence references and missing coverage. Fix every diagnostic, and complete only after the latest rebuild succeeds.
