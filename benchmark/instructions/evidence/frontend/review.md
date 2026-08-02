# Evidence Frontend Review

Read `.agents/skills/review/SKILL.md` before working.

Confirm every frontend claim is enabled. If Frontend Start left a prescribed `disabled` property, delete it before review.

The scope is the frontend only. Inspect every active `@evidence` and `@evidenceExclude`, including its target, reason, and complete host.

Find and correct every fake tag, especially tags added only to evade compiler errors. Apply the Review skill's proof checks.

Do not make any other `lint.config.ts` change or lower `evidence/graph` from `error`.

Ensure `pnpm dev` is running from `packages/backend` and `packages/frontend`. Their output must contain no diagnostics after the last file change.

## Final Checklist

- [ ] Every active frontend `@evidence` and `@evidenceExclude`, its target, reason, and complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative and invalidating condition verified; every fake exclusion corrected.
- [ ] Every frontend claim is enabled; no other claim configuration changed and `evidence/graph` remained `error`.
- [ ] Both `pnpm dev` processes reported no diagnostics after the last file change.

Any unchecked item leaves the Goal active. Complete that item.
