# Evidence Backend Review

Read `.agents/skills/review/SKILL.md` before working.

The scope is the backend only. Inspect every active `@evidence` and `@evidenceExclude`, including each target, reason, and complete host. Correct every fake citation or exclusion created solely to evade compiler errors.

Start backend `pnpm check:watch` with the canonical graph active, wait for a clean rebuild, then stop the watcher.

## Final Checklist

- [ ] Every active backend acknowledgement inspected; every fake citation or exclusion created solely to evade compiler errors corrected.
- [ ] Canonical graph configuration stayed active and the current compiler gate passed.

Any unchecked item leaves the Goal active. Complete the missing review or correction.
