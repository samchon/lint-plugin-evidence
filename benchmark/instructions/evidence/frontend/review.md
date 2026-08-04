# Evidence Frontend Review

Review the frontend only: find and correct every fake `@evidence` and `@evidenceExclude`, especially tags added only to evade compiler errors.

Read `.agents/skills/review/SKILL.md` and `.agents/skills/review/frontend.md` before working, and follow them exactly.

## Final Checklist

- [ ] Every active frontend `@evidence` and `@evidenceExclude`, its target, reason, and complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every `@evidenceExclude` owner or alternative and invalidating condition verified; every fake exclusion corrected.
- [ ] Every frontend claim is enabled; no other claim configuration changed and `evidence/graph` remained `error`.
- [ ] Both `pnpm dev` processes reported no diagnostics after the last file change.
- [ ] Live-backend `pnpm test:e2e` exits with code 0 after the last correction.

Any unchecked item leaves the Goal active. Complete that item.
