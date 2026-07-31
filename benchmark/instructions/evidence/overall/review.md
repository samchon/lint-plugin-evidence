# Evidence Overall Review

Read `.agents/skills/review/SKILL.md` before working.

Review whether every `@evidence` and `@evidenceExclude` reason in the application precisely and truthfully explains why it applies.

Start backend `pnpm check:watch` so the compiler catches invalid evidence references and missing coverage against the live application. Fix every diagnostic, wait for a clean rebuild, then stop the watcher. Ensure backend `pnpm dev` and frontend `pnpm dev` remain clean before completing.
