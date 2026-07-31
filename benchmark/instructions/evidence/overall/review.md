# Evidence Overall Review

Read `.agents/skills/review/SKILL.md` before working.

Review whether every `@evidence` and `@evidenceExclude` reason in the application precisely and truthfully explains why it applies.

Keep backend `pnpm check:watch` and frontend `pnpm dev` running so the compiler catches invalid evidence references and missing coverage. Fix every diagnostic, and complete only after both current builds are clean.
