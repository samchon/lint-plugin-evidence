---
name: backend
description: Defines backend layer ownership, implementation order, resident checking, generation boundaries, and the backend gate. Read before backend work, then read every sibling topic.
---

# Backend

The backend realizes the requirements as a schema, public contract, business logic, and executable tests. Work in that order so each layer consumes settled decisions from the layer before it.

## Topics

- [database.md](database.md): models, relations, lifecycle, retained state, and schema comments.
- [dtos.md](dtos.md): public request and response types under `packages/api/src/structures/`.
- [controllers.md](controllers.md): operation shape, routes, actor guards, and published JSDoc.
- [providers.md](providers.md): authorization, queries, writes, transformers, collectors, and transactions.
- [testing.md](testing.md): end-to-end scenarios and behavioral proof.
- [typescript.md](typescript.md): recurring TypeScript, typia, and Prisma diagnostics.
- [debugging.md](debugging.md): assigning a failure to its owning layer.

## Layer Ownership

| Layer | Owns |
| --- | --- |
| Schema | Stored facts, relations, constraints, and lifecycle representation |
| DTO | Public request and response shapes |
| Controller | Route, actor guard, parameters, response, and published contract |
| Provider | Business rules, visibility, database access, and transactions |
| Test | Observable proof through public operations |

Fix a defect at its owner. A provider must not compensate for a missing column, a controller must not contain business logic, and a test must not weaken a legitimate requirement.

## Implementation Order

1. Read every requirement under `docs/analysis/`.
2. Design the complete schema under `prisma/schema/`.
3. Run `pnpm build:prisma` and `pnpm schema`.
4. Declare every DTO under `../api/src/structures/` and every operation under `src/controllers/` as a complete contract with a temporary typed stub body.
5. Run `pnpm build:sdk` once after the entire DTO and controller contract settles.
6. Write tests under `test/features/` from the requirements and generated SDK.
7. Implement providers, transformers, collectors, and authorization until the runtime suite passes.

The temporary controller stub declares the real route, signature, JSDoc, and response type. Its body mentions each parameter and returns `typia.random<T>()`, allowing SDK generation before provider logic exists. Remove every stub marker when replacing the body with one provider call.

## Continuous Checking

From `packages/backend`, start this before authoring and keep it resident through Overall Final:

```bash
pnpm check:watch
```

The package's single `tsconfig.json` includes backend source, backend tests, and authored API DTOs. The watcher automatically reloads its lint configuration and reports type, lint, and contributor diagnostics. Fix every diagnostic and require a clean rebuild after the latest change.

Do not create another backend `tsconfig.json` or package-local lint configuration for tests. Do not toggle claim configuration by phase.

## Environment And Runtime

Create the local environment from the example before tests or server startup:

```bash
cp .env.example .env
```

The database is disposable SQLite. `pnpm schema` force-resets it. Do not add deployment abstractions or a server database.

The backend server starts with:

```bash
pnpm dev
```

Start it before live frontend integration and keep it running through Overall Final.

## Generation Boundaries

| Authored change | Action |
| --- | --- |
| Schema model, field, relation, or comment | Settle the schema, then `pnpm build:prisma` and `pnpm schema` |
| DTO or controller contract | Wait for a clean watcher rebuild |
| Complete DTO and controller contract | `pnpm build:sdk` once |
| Provider or test only | Wait for the watcher; do not regenerate |

Run generators serially. They replace shared generated trees while the watcher reads them, so wait for the generator and the watcher's next complete rebuild.

## Backend Gate

The backend gate requires:

1. the active arm's backend review;
2. a clean current `check:watch` rebuild;
3. settled Prisma and SDK generation; and
4. `pnpm test` succeeding against the current implementation.

Do not use the backend aggregate `pnpm build` or workspace-root build as a substitute. They obscure the failing layer and the root build also compiles the unfinished frontend.
