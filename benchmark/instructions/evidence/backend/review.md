# Evidence Backend Review

Read `.agents/skills/review/SKILL.md` before working.

Review whether every backend `@evidence` and `@evidenceExclude` reason precisely and truthfully explains why it applies. Read each complete `@evidence` host and each exclusion's claimed owner or observable alternative, not only its reason, and reject every acknowledgement created only to pass the compiler. Do not review the frontend.

Start `pnpm check:watch` from `packages/backend` so the compiler catches invalid evidence references and missing coverage. Fix every diagnostic, wait for a clean rebuild, then stop the watcher before completing.
