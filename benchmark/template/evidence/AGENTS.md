# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Evidence Graph

The evidence graph turns a missing configured acknowledgement into a compile error; every `@evidence` or `@evidenceExclude` citation must also be true. Its claims, tag grammar, configuration, and diagnostics are defined in `.agents/skills/evidence/SKILL.md`.

Claims live in `packages/api/lint.config.ts`, `packages/backend/lint.config.ts`, and `packages/frontend/lint.config.ts`. Read the skill before starting, when a graph diagnostic appears, and before each phase gate.
