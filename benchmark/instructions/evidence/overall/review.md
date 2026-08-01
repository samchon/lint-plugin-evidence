# Evidence Overall Review

Read `.agents/skills/review/SKILL.md` before working.

Inspect every active `@evidence` and `@evidenceExclude` across the application. Read each target, reason, and complete host. Correct every fake citation or exclusion created solely to evade compiler errors.

Start a bounded backend `pnpm check:watch` with the canonical graph active, wait for a clean rebuild, then stop the watcher. Require clean current development processes and frontend `pnpm lint`.

## Final Checklist

- [ ] Every active acknowledgement inspected; every fake citation or exclusion created solely to evade compiler errors corrected.
- [ ] Canonical graph configuration stayed active and current backend graph, frontend lint, and development gates passed.

Any unchecked item leaves the Goal active. Complete the missing review or correction.
