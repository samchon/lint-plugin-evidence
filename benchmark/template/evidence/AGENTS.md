# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Evidence Graph

How the evidence graph maps claims to sources, which `lint.config.ts` owns each claim, and the fully active state required at completion, `.agents/skills/evidence/SKILL.md`.

The graph is split across `packages/api/lint.config.ts`, `packages/backend/lint.config.ts`, and `packages/frontend/lint.config.ts`. While the application is still under active development, if some claims produce enough diagnostics to overwhelm the working context, you may temporarily comment out only those affected whole claim objects. Follow the skill's exact deferral procedure and restore every claim before completion.

Read it before editing an evidence lint configuration, adding `@evidence` or `@evidenceExclude`, or responding to graph diagnostics.

### Review

**Mandatory.** How to review each graph edge as a claim, claiming artifact, and named source; how to distinguish structural coverage from integrity; and how source changes invalidate accepted reasons, `.agents/skills/review/SKILL.md`.

Read it in full and follow it literally before every completion report.
