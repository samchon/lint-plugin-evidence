# Evidence Frontend Review

Read `.agents/skills/review/SKILL.md` before working.

Review whether every frontend `@evidence` and `@evidenceExclude` reason precisely and truthfully explains why it applies. Read each complete `@evidence` host and each exclusion's claimed owner or observable alternative, not only its reason, and reject every acknowledgement created only to pass the compiler.

Ensure backend `pnpm dev` and frontend `pnpm dev` are running so the current application uses the live backend and the compiler catches invalid evidence references and missing coverage. Fix every diagnostic, and complete only after the current application reloads without error.
