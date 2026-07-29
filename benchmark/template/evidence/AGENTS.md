# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Evidence Graph

The evidence graph turns a missing configured acknowledgement into a compile error; every `@evidence` or `@evidenceExclude` citation must also be true. Its claims, tag grammar, diagnostics, and review limits are defined in `.agents/skills/evidence/SKILL.md`.

Claims live in `packages/api/lint.config.ts`, `packages/backend/lint.config.ts`, and `packages/frontend/lint.config.ts`. Read the skill before starting, when a graph diagnostic appears, and before each phase gate.

During active development, if excessive lint-rule compile errors bury the working context, you may temporarily comment out the affected claim objects at your discretion; restore every claim owned by the active phase before its report and all seven claims before the overall report.

### Review

How to review each graph edge as a claim, claiming artifact, and named source; how to distinguish structural coverage from integrity; and how source changes invalidate accepted reasons, `.agents/skills/review/SKILL.md`.

Read it in full and follow the scope named by each backend, frontend, and overall review turn.
