# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Evidence Graph

The evidence graph turns a missing configured acknowledgement into a compile error; every `@evidence` or `@evidenceExclude` citation must also be true. Its claims, tag grammar, diagnostics, and review limits are defined in `.agents/skills/evidence/SKILL.md`.

Claims live in `packages/api/lint.config.ts`, `packages/backend/lint.config.ts`, and `packages/frontend/lint.config.ts`. Read the skill before starting, when a graph diagnostic appears, and before each phase gate.

The template starts with every claim active. During active development, prefer commenting out only whole claim objects for later layers that have not started when their expected diagnostics would bury the current work. Keep the current layer's claims active, restore a deferred claim when its layer starts, restore every claim owned by the active phase before its report, and restore all seven before the overall report.

### Review

How to review every active graph acknowledgement as a host-target-reason triple, distinguish structural coverage from integrity, and revalidate affected claims without adding a Plain-style unconfigured census, `.agents/skills/review/SKILL.md`.

Read it in full and follow the scope named by each backend, frontend, and overall review turn.
