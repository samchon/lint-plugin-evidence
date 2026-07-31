# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Evidence Graph

The evidence graph turns a missing configured acknowledgement into a compile error; every `@evidence` or `@evidenceExclude` citation must also be true. Its claims, automatic claim activation, tag grammar, frozen configuration, diagnostics, and review limits are defined in `.agents/skills/evidence/SKILL.md`.

Claims live in `packages/backend/lint.config.ts` and `packages/frontend/lint.config.ts`. Read the skill in full at the start of every Evidence objective, when a graph diagnostic appears, and again before each phase gate.

### Review

How to review every populated graph acknowledgement as a host-target-reason triple, detect a required artifact hidden by an inactive claim population, distinguish structural coverage from integrity, and revalidate affected claims without adding a Plain-style unconfigured census, `.agents/skills/review/SKILL.md`.

Read Evidence Lint and Review in full, in that order, at the start of every backend, frontend, and overall review or final turn.
