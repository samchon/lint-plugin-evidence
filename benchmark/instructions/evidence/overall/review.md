# Evidence Overall Review

Read `.agents/skills/review/SKILL.md` before working.

Inspect every active `@evidence` and `@evidenceExclude` across the application, including its target, reason, and complete host.

Find and correct every fake tag, especially tags added only to evade compiler errors. Apply the Review skill's proof checks.

Do not edit `lint.config.ts` or lower `evidence/graph` from `error`.

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic and wait for a rebuild without diagnostics. Keep it running.

Ensure `pnpm dev` is running from `packages/backend` and `packages/frontend`. Their output must contain no diagnostics after the last file change.

Run frontend `pnpm lint`. Fix every diagnostic and require exit code 0.

## Final Checklist

- [ ] Every active `@evidence` and `@evidenceExclude`, its target, reason, and complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative and invalidating condition verified; every fake exclusion corrected.
- [ ] `lint.config.ts` remained unchanged and `evidence/graph` remained `error`.
- [ ] Backend `check:watch` completed a rebuild without diagnostics and remains running.
- [ ] Both `pnpm dev` processes reported no diagnostics after the last file change.
- [ ] Frontend `pnpm lint` exited with code 0.

Any unchecked item leaves the Goal active. Complete that item.
