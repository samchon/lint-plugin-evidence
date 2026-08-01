# Evidence Frontend Review

Read `.agents/skills/review/SKILL.md` before working.

The scope is the frontend only. Inspect every active `@evidence` and `@evidenceExclude`, including its target, reason, and complete host.

Find and correct every fake tag, especially tags added only to evade compiler errors. Apply the Review skill's proof checks.

Do not edit `lint.config.ts` or lower `evidence/graph` from `error`.

Ensure `pnpm dev` is running from `packages/backend` and `packages/frontend`. Their output must contain no diagnostics after the last file change.

Run frontend `pnpm lint`. Fix every diagnostic and require exit code 0.

## Final Checklist

- [ ] Every active frontend `@evidence` and `@evidenceExclude`, its target, and its complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative verified; every fake exclusion corrected.
- [ ] `lint.config.ts` remained unchanged and `evidence/graph` remained `error`.
- [ ] Both `pnpm dev` processes reported no diagnostics after the last file change.
- [ ] Frontend `pnpm lint` exited with code 0.

Any unchecked item leaves the Goal active. Complete that item.
