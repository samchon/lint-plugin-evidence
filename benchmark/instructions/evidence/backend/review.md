# Evidence Backend Review

Read `.agents/skills/review/SKILL.md` and `.agents/skills/backend/testing.md` before working.

Confirm every backend claim is enabled. If Backend Start left a prescribed `disabled` property, delete it before review.

The scope is the backend only. Inspect every active `@evidence` and `@evidenceExclude`, including its target, reason, and complete host.

Find and correct every fake tag, especially tags added only to evade compiler errors. Apply the Review skill's proof checks.

For the product-operation reference, inspect the complete operation-keyed scenario report and every owned test host. Verify each operation has at least two semantically distinct scenarios and each test cites only its primary target; counts and a clean graph do not prove this.

Do not make any other `lint.config.ts` change or lower `evidence/graph` from `error`.

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic and wait for a rebuild without diagnostics. Keep it running.

Run backend `pnpm test` after the last correction and fix every failure.

## Final Checklist

- [ ] Every active backend `@evidence` and `@evidenceExclude`, its target, reason, and complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative and invalidating condition verified; every fake exclusion corrected.
- [ ] Every backend claim is enabled; no other claim configuration changed and `evidence/graph` remained `error`.
- [ ] Backend `check:watch` completed a rebuild without diagnostics and remains running.
- [ ] Backend `pnpm test` passed with complete operation-scenario coverage.

Any unchecked item leaves the Goal active. Complete that item.
