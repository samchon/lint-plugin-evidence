# Evidence Backend Review

Review the backend only: find and correct every fake `@evidence` and `@evidenceExclude`, especially tags added only to evade compiler errors.

Read `.agents/skills/review/SKILL.md` and `.agents/skills/review/backend.md` before working, and follow them exactly.

## Final Checklist

- [ ] Every active backend `@evidence` and `@evidenceExclude`, its target, reason, and complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative and invalidating condition verified; every fake exclusion corrected.
- [ ] Every backend claim is enabled and `evidence/todo` is `error`; no other rule or claim configuration changed and `evidence/graph` remained `error`.
- [ ] Backend `check:watch` completed a rebuild without diagnostics and remains running.
- [ ] `pnpm test` exits with code 0 after the last correction.

Any unchecked item leaves the Goal active. Complete that item.
