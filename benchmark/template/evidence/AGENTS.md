# AGENTS.md

<!-- benchmark-template-splice: base-body -->
{{base}}

### Evidence Graph

**Mandatory.** The evidence graph this repository is checked against: what each obligation means, how a citation is written and where it belongs, what each diagnostic is telling you, which `lint.config.ts` owns each claim, and which failures the build cannot see, `.agents/skills/evidence/SKILL.md`.

A missed requirement is a compile error here rather than something you have to notice. The lint stage names the exact target nothing acknowledges, so your job is not to hunt for gaps but to make every citation say something true.

The graph is split across `packages/api/lint.config.ts`, `packages/backend/lint.config.ts`, and `packages/frontend/lint.config.ts`. Read the skill before starting work, whenever a graph diagnostic appears, and before believing a green build.

During active development, if excessive lint-rule compile errors bury the working context, you may temporarily comment out the affected claim objects at your discretion; restore every claim before completion.

### Review

**Mandatory.** How to review each graph edge as a claim, claiming artifact, and named source; how to distinguish structural coverage from integrity; and how source changes invalidate accepted reasons, `.agents/skills/review/SKILL.md`.

Read it in full and follow it literally before every completion report.
