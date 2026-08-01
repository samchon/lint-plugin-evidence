# Evidence Backend Review

Read `.agents/skills/review/SKILL.md` before working.

The scope is the backend only. Inspect every active `@evidence` and `@evidenceExclude`, including its target, reason, and complete host.

Find and correct every fake tag, especially tags added only to evade compiler errors. Apply the Review skill's proof checks.

Do not edit `lint.config.ts` or lower `evidence/graph` from `error`.

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic and wait for a rebuild without diagnostics. Keep it running.

## Final Checklist

- [ ] Every active backend `@evidence` and `@evidenceExclude`, its target, and its complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative verified; every fake exclusion corrected.
- [ ] `lint.config.ts` remained unchanged and `evidence/graph` remained `error`.
- [ ] Backend `check:watch` completed a rebuild without diagnostics and remains running.

Any unchecked item leaves the Goal active. Complete that item.
