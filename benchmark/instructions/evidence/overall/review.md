# Evidence Overall Review

Read `.agents/skills/review/SKILL.md` before working.

Review whether every `@evidence` and `@evidenceExclude` reason in the application precisely and truthfully explains why it applies.

Ensure backend `pnpm check:watch`, backend `pnpm dev`, and frontend `pnpm dev` are running so the compiler catches invalid evidence references and missing coverage against the live application. Fix every diagnostic, and complete only after both current builds are clean.
