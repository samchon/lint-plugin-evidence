# Evidence Backend Start

Implement the complete API and backend from the requirements. Do not implement the frontend or perform the review yet.

Read `AGENTS.md` and every document under `.agents/skills/backend/` and `.agents/skills/evidence/` in full before working, and obey them throughout.

Start backend `pnpm check:watch` before implementation while every backend claim is disabled, and keep it running through Overall Final.

As each layer completes, delete that claim's `disabled` property in its declaring `lint.config.ts`, in the staged order `.agents/skills/evidence/backend.md` prescribes — never earlier.

Write every `@evidence` and `@evidenceExclude` truthfully; never add a tag only to remove a compiler diagnostic.

## Final Checklist

- [ ] Every required schema model, DTO, controller, public-operation test, and provider implemented.
- [ ] Every published operation has its proving tests.
- [ ] Every backend claim is enabled and `evidence/todo` is `error`; no other rule or claim configuration changed.
- [ ] Each layer's claims were enabled as that layer completed: DB schema first, then DTOs and operations, then tests.
- [ ] Every `@evidence` is on code that implements, represents, or proves its target.
- [ ] Every `@evidenceExclude` sits in its claim's exclusion carrier, names its owner or alternative and invalidating condition, and none stands in for work this layer owes or exists only to remove a diagnostic.
- [ ] The persistent watcher rebuilt without diagnostics after the latest change and remains running.
- [ ] Prisma generation followed the last schema change, SDK generation followed the last API change, and `pnpm test` exits with code 0.

Any unchecked item leaves the Goal active. Complete that item before proceeding.
