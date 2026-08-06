# Evidence Overall Review

Review the whole application: find and correct every fake `@evidence` and `@evidenceExclude`, especially tags added only to evade compiler errors, and every place the code contradicts a requirement it cites.

Read `.agents/skills/review/SKILL.md` and `.agents/skills/review/overall.md` before working, and follow them exactly.

## Final Checklist

- [ ] Every active `@evidence` and `@evidenceExclude`, its target, reason, and complete host inspected.
- [ ] Every fake `@evidence`, including any added only to evade compiler errors, corrected.
- [ ] Every cited requirement read and the host checked against it; each disagreement resolved in whichever is wrong — the code, the reason, or the target — never in the requirement.
- [ ] Every exclusion carrier read in full and every entry decided; each names its owner or alternative and invalidating condition, and every fake exclusion corrected.
- [ ] No exclusion stands in for an artifact this scope owes, and none sits on a working host instead of its carrier.
- [ ] Every claim is enabled and `evidence/todo` is `error`; no other rule or claim configuration changed and `evidence/graph` remained `error`.
- [ ] Backend `check:watch` completed a rebuild without diagnostics and remains running.
- [ ] Both `pnpm dev` processes reported no diagnostics after the last file change.
- [ ] Backend `pnpm test` and live-backend `pnpm test:e2e` exit with code 0 after the last correction.

Any unchecked item leaves the Goal active. Complete that item.
