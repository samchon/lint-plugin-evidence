# Evidence Skills Contract

Treat this as one read-only objective. Before implementation, generation, commands, or edits, read these exact files in full: `AGENTS.md`, `.agents/skills/project/SKILL.md`, `.agents/skills/requirements/SKILL.md`, `.agents/skills/api/SKILL.md`, `.agents/skills/backend/SKILL.md`, `.agents/skills/frontend/SKILL.md`, `.agents/skills/evidence/SKILL.md`, and `.agents/skills/review/SKILL.md`. Follow every linked topic's read condition and read each topic that can apply to the complete benchmark.

These rules bind every later Evidence objective:

- `docs/analysis/**` is immutable, authoritative input. Implement it without editing, repairing, validating, or weakening it.
- `packages/backend/lint.config.ts` and `packages/frontend/lint.config.ts` are canonical and fixed. A claim with no exported symbol in its configured target is inactive; it activates automatically when real requirement-derived symbols appear.
- `HealthController.ts` is outside the configured claim target. Do not cite excluded infrastructure, create placeholder exports, or change target populations to stage the build.
- Every citation must truthfully and specifically explain the host artifact's responsibility. Graph silence does not prove that a missing artifact exists.
- Correct authored sources and regenerate owned outputs. Never hand-edit generated files or weaken compiler, lint, test, browser, live-runtime, or Evidence gates.

Report the exact files read, confirm no implementation work began, and carry this contract into every later objective.
