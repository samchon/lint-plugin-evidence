---
name: backend
description: Indexes the backend conventions for this project and states the rules that apply to all of them: the layer boundaries, the phase order, the source-of-truth stack, and what a completed piece of backend work owes. Use before any backend work, then read the linked topic document for the layer you are touching.
---

# Backend

The backend is the whole product surface that realizes `docs/analysis/`. It owns the schema, the public API, the business logic, and the tests that prove the behavior. The generated SDK in `packages/api` is its output, not a place to work.

Read this file first, then the topic document for the layer you are about to touch.

## Topics

- [wiring.md](wiring.md): controller discovery, shared module metadata, the global singleton, the bootstrap, the environment, and the generator commands. **Read this first if the repository is empty**, and again whenever you add a controller, because runtime and generated populations must remain identical.
- [database.md](database.md): schema organization, naming, the documentation-comment contract, stance, temporal and deletion rules, snapshots, ownership. Read before adding or changing a model.
- [dtos.md](dtos.md): what a DTO is named, what each variant means, how every property earns its place, and how relations are shaped. **DTOs live in `packages/api/src/structures`, not in this package.** Read before declaring any type a caller will see.
- [controllers.md](controllers.md): endpoint shape, response cardinality, the request grammar, and the JSDoc that becomes the published contract. Read before adding or changing an endpoint.
- [transformers.md](transformers.md): the read side, one namespace per DTO, holding the selection and the row-to-DTO mapping. Read before returning any DTO.
- [collectors.md](collectors.md): the write side, one namespace per creation DTO, holding the payload assembly. Read before writing any row.
- [providers.md](providers.md): provider structure, pagination, visibility, persistence, error behavior, and the Prisma traps. Read before writing business logic.
- [authorization.md](authorization.md): actors, sessions, grades, ownership and scope guards, and where each check belongs. Read before anything that reads the caller's identity.
- [testing.md](testing.md): end-to-end test structure, composition, and what a test must prove beyond its happy path. Read before writing a test.
- [typescript.md](typescript.md): the recurring TypeScript and typia diagnostics, what causes each, and the one correct fix. Read when a type error repeats, and always before choosing a default for a nullable conversion.
- [debugging.md](debugging.md): how to assign a failure to the layer that owns it before editing anything. Read when something fails and the cause is not obvious.

## Layer Boundaries

Each layer owns one thing, and a defect belongs to the layer that owns it.

| Layer     | Owns                                  |
| --------- | ------------------------------------- |
| Schema    | stored facts and relations            |
| Operation | public behavior and the DTO contract  |
| Provider  | business logic and database access    |
| Test      | observable proof of business behavior |

Do not leak a later layer's detail into an earlier one, and do not use a later layer to invent what an earlier one is missing. A provider must not compensate for a column the schema should have; add the column. An endpoint must not exist because a provider needed a place to put code.

When something will not fit, go back to the layer that owns it and fix it there. That direction is the cheap one, and it is cheapest at the moment you notice. Every workaround hides the defect from every layer after it and commits the later work to the mistake.

## Phase Order

Work the layers in order, and let each one read everything the earlier ones decided.

1. Read every requirement document under `docs/analysis/`.
2. Design the schema under `packages/backend/prisma/schema/`, split by domain, and generate the client from it.
3. Declare and finish the operations under `packages/backend/src/controllers/` and their DTOs under `packages/api/src/structures/` as stubs: the full contract JSDoc, a body that enumerates each parameter once and returns `typia.random<T>()`, and an implementation-pending sentence on each operation naming what realize owes. From the backend package, compile the authored DTO package with `pnpm build:api` and the backend source with `pnpm build:main` while this contract is still changing.
4. Once every operation and DTO is settled, build the SDK into `packages/api/src/functional/`, then write the tests under `packages/backend/test/features/` from the requirements and that fixed contract.
5. Write the transformers under `packages/backend/src/transformers/` and the collectors under `packages/backend/src/collectors/`, one namespace per DTO that needs each.
6. Realize: replace each stub body with its call into a provider under `packages/backend/src/providers/`, remove the implementation-pending sentence, and run the tests until they hold.

**The stub is what makes this order executable.** The SDK generates from controllers, so without stubs the backend tests cannot start until the providers exist; with them, the contract reaches the tests before realization, and the implementation-pending sentences are the exact ledger of what realize still owes. A suite written at step 4 runs red against random stub answers, and that is the point: realize turns it green. The frontend consumes the generated SDK only after the Backend Layer Gate passes.

The read side and the write side come before the provider that composes them. A provider written first inlines a selection and a mapping, and that copy is what the transformer then has to be reconciled with. This section owns the phase order; [wiring.md](wiring.md) owns the discovery, environment, and generation commands used within it.

Reading an earlier layer is itself a review. Hold what you just read against what you are about to build, and treat a contradiction as a finding rather than an obstacle to route around. Each layer is the first place some kind of defect becomes visible: making a rule concrete enough to store is what exposes a rule no set of rows can satisfy, and building a test from a real journey is what exposes a requirement nothing can exercise.

## Source Of Truth

When facts disagree, this is the order:

1. The requirement documents under `docs/analysis/`.
2. The Prisma schema under `packages/backend/prisma/schema/`.
3. The DTOs under `packages/api/src/structures/` and the SDK contract generated into `packages/api/src/functional/`.
4. Existing patterns in this repository.
5. Compiler, lint, and test output.

A convention document teaches the method; it never overrides a contract that already exists. If the schema and a provider disagree, the schema is right and the provider is the defect, unless the schema itself contradicts a requirement.

## Everything Traces To A Requirement

Every table, column, endpoint, DTO, provider branch, and test assertion answers one question: which requirement makes this necessary?

If you cannot answer it, either the artifact should not exist or you have not finished reading the requirements. A pattern being common in similar products is not an answer. This is what prevents duplicated tables, unused DTOs, endpoints nothing calls, and tests that prove the framework's validation rather than the product's behavior.

## Type-Correct Is Not Correct

A semantically wrong value satisfies every checker. `expiredAt ?? new Date()` reads as a harmless default and means "already expired". Aggregating across the wrong relation direction returns a plausible number. A side effect implemented in one view of a contract and not the other passes both compilations.

After any substantial piece of work, ask what `null` means for each field, which direction each relation aggregates, which effects each consumer expects, and what the test actually proves.

## Backend Layer Gate

Passing this gate means the backend layer is internally validated at the current repository state. It is not a project-completion claim; frontend delivery remains a separate obligation.

Apply the active arm's Review skill to the API and backend scope. That skill owns the review population, repetition, and stopping condition. Frontend obligations remain pending rather than accepted.

From `packages/backend`, run `pnpm build:prisma`, prepare the database, run `pnpm build:api`, and run `pnpm build:main`. Only after every operation and DTO is settled, run `pnpm build:sdk` followed by `pnpm build:test`. Then run `pnpm lint`, `pnpm test`, launch `pnpm dev`, and exercise `/health` and representative requirement-backed operations.

Do not use either the backend package's aggregate `pnpm build` or the workspace-root build to judge this gate. The aggregate package build obscures which layer is invalid, and the root build compiles the unfinished frontend. Fix every finding, regenerate only after its authored inputs are settled, rerun the invalidated package command, and apply the active Review skill's stopping condition. Do not begin frontend implementation before this gate passes.

Never report compiled, tested, or complete for something you did not observe. A truthful "blocked on X" outranks a hopeful "done", and it is the one report the next reader can act on.
