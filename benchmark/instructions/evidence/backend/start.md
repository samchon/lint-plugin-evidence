# Evidence Backend Start

Read `AGENTS.md` and every document under `.agents/skills/backend/` and `.agents/skills/evidence/` in full before working, and obey them throughout this objective.

Implement the complete API and backend from the requirements. Do not implement the frontend or perform the review yet.

Add each `@evidence` acknowledgement to the artifact that actually owns the cited target, and state the exact responsibility that connects them. Use `@evidenceExclude` only when the target does not belong to the claim; name the actual owner or observable alternative and the condition that would invalidate the exclusion. Never create a fake citation or exclusion solely to evade compiler errors.

1. Design the complete requirement-derived database under `packages/backend/prisma/schema/`. Each model must cite the exact requirement it stores. When the schema is settled, run `pnpm build:prisma` and `pnpm schema` from `packages/backend`.
2. Design every API controller under `packages/backend/src/controllers/` and every DTO under `packages/api/src/structures/`. Each DTO type must cite its requirement and model, each DTO property its column, and each operation its requirement and model.
3. Run `pnpm build:sdk` from `packages/backend`.
4. Write test programs under `packages/backend/test/features/` for every requirement and API operation. Each test must cite the requirement, operation, and DTO contract it proves.
5. Complete the first draft of all backend logic before starting the Evidence compiler gate.
6. With the canonical graph active, start `pnpm check:watch` from `packages/backend`. Waiting until now avoids graph-wide diagnostics for hosts that did not exist during the first draft. Fix the complete diagnostic batch, wait for a clean rebuild, then stop the watcher so it cannot overlap the runtime gate or next phase.
7. Run `pnpm test` from `packages/backend` and fix every failure. Complete only after the clean watcher rebuild and runtime suite both succeed.

## Final Checklist

- [ ] Complete schema, API, backend behavior, and tests implemented.
- [ ] Every `@evidence` is a justified citation and every `@evidenceExclude` a genuine exclusion; none was created solely to evade compiler errors.
- [ ] Canonical graph configuration stayed active and the current compiler gate passed.
- [ ] Prisma and SDK output are current and `pnpm test` passes.

Any unchecked item leaves the Goal active. Complete it and rerun every affected current-state gate.
