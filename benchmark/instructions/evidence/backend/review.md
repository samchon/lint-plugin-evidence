# Evidence Backend Review

Read `.agents/skills/review/SKILL.md` before working.

The scope is the backend only. Inspect every active `@evidence` and `@evidenceExclude`, including its target, reason, and complete host.

Find and correct every fake tag, especially tags added only to evade compiler errors. Apply the Review skill's proof checks.

Do not edit `lint.config.ts` or lower `evidence/graph` from `error`.

After the last review correction, start backend `pnpm check:watch`. Fix every diagnostic, wait for a clean rebuild, and stop the watcher so it cannot overlap another command or objective.

## Final Checklist

- [ ] Every active backend `@evidence` and `@evidenceExclude`, its target, reason, and complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative and invalidating condition verified; every fake exclusion corrected.
- [ ] `lint.config.ts` remained unchanged and `evidence/graph` remained `error`.
- [ ] Backend `check:watch` completed a rebuild without diagnostics after the last backend change and stopped.

Any unchecked item leaves the Goal active. Complete that item.
