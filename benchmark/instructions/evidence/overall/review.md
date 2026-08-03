# Evidence Overall Review

Read `.agents/skills/review/SKILL.md` and `.agents/skills/backend/testing.md` before working.

Confirm every claim is enabled. If an earlier stage left a prescribed `disabled` property, delete it before review. Inspect every active `@evidence` and `@evidenceExclude` across the application, including its target, reason, and complete host. Find and correct every fake tag, especially tags added only to evade compiler errors. Apply the Review skill's proof checks.

For the product-operation reference, inspect the complete operation-keyed scenario report and every owned test host. Verify each operation has at least two semantically distinct scenarios and each test cites only its primary target; counts and a clean graph do not prove this.

Do not make any other `lint.config.ts` change or lower `evidence/graph` from `error`. Use the backend `pnpm check:watch` process kept running by Backend Start; fix every diagnostic, wait for a rebuild without diagnostics, and keep it running. Ensure `pnpm dev` is running from `packages/backend` and `packages/frontend`; their output must contain no diagnostics after the last file change.

Run backend `pnpm test` after the last correction and fix every failure.

## Final Checklist

- [ ] Every active `@evidence` and `@evidenceExclude`, its target, reason, and complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative and invalidating condition verified; every fake exclusion corrected.
- [ ] Every claim is enabled; no other claim configuration changed and `evidence/graph` remained `error`.
- [ ] Backend `check:watch` completed a rebuild without diagnostics and remains running.
- [ ] Both `pnpm dev` processes reported no diagnostics after the last file change.
- [ ] Backend `pnpm test` passed with complete operation-scenario coverage.

Any unchecked item leaves the Goal active. Complete that item.
