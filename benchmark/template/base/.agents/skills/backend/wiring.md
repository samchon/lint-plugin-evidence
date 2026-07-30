# Wiring

This document owns everything between "the code exists" and "the server answers": controller discovery, shared module metadata, the global singleton, the bootstrap, the environment, and the generation commands.

Nothing here is optional. Runtime and Nestia generation must discover the same authored controller directory, and every generated population must be checked before downstream work accepts it.

## The Controller Directory Is The Module

Every controller lives below `packages/backend/src/controllers/`. `MyModule.mount()` recursively discovers that directory with Nestia `DynamicModule` and filters exports by Nest controller metadata. Adding a controller is one edit: write its defining file below that root.

Do not create leaf, actor, or root modules only to list controllers. Do not add a static controller import to `MyModule`, and do not re-export a controller from another file inside the discovery root. The loader reads every file independently, so a barrel re-export would present the same controller twice.

Common Nest metadata remains central without bringing back a controller list:

```ts
import { MyModule } from "./MyModule";
import { MyProvider } from "./providers/MyProvider";

const module = await MyModule.mount({
  providers: [MyProvider],
});
```

Runtime discovery uses `__dirname/controllers`, which resolves to `src/controllers` under `ttsx` and `lib/controllers` after `ttsc`. Nestia generation reads the authored source directly with `input: ["src/controllers"]`; this working-directory-relative input is stable even though Nestia compiles its configuration under a temporary loader directory. These are two views of the same relative tree.

After generation, inspect the actual controller count, Swagger paths, and SDK accessors. An exported const, helper function, or ordinary class has no Nest controller metadata and must not appear in any of those outputs. The scaffold's health controller is discovered by its defining file exactly like every product controller.

## The Global Singleton

`MyGlobal` in the backend root owns the running application's environment and database client. Runtime code reads application settings from there, and providers never construct their own client or read `process.env` directly.

Standalone tools have a separate process boundary. The Swagger UI executable reads its optional `SWAGGER_PORT` directly, and Nestia evaluates `nestia.config.ts` in its own loader process. Tool-only process controls do not belong in `MyGlobal.IEnvironments`; variables consumed by the running application do.

Two things about it are load-bearing.

**The environment is a typed interface, validated at first read.** A missing secret then fails at startup with the name of the variable, rather than at the first request that needs it, in a stack trace that names a cipher function.

**The port is typed as a numeric string and converted by `MyConfiguration.API_PORT()`.** The conversion rejects non-integers and values outside the valid listener range of 1 through 65535 before Nest starts listening.

Declare every variable the application needs in that interface, and keep an example environment file listing them with safe defaults.

Create the local backend environment from that example before running the server or backend tests:

```bash
cp packages/backend/.env.example packages/backend/.env
```

The frontend already has working defaults. Copy `packages/frontend/.env.example` to `.env` only when overriding those defaults.

## The Bootstrap

`MyBackend` owns startup order: mount the controllers, then listen. `src/executable/server.ts` is the entry point that calls it and handles the termination signal.

The executable imports one class and calls one method. Parsing, orchestration, and setup live in the class, never in the entry point.

Database preparation is a separate explicit step. `pnpm prepare` pushes the Prisma schema to the SQLite file without resetting existing data. `pnpm schema` enters the guarded `MySetupWizard` path and force-resets the local database. `MyBackend.open()` does neither.

## Database Errors Are Mapped At The Boundary, Once

A provider that uses the throwing finder expects a missing row to become a `404`. That does not happen by itself. `PrismaErrorUtil` maps the client codes and `MyConfiguration`, beside `MyGlobal` at the backend root, registers it; without that registration a missing row is a `500`, and something worse also happens.

**A Prisma error message interpolates the model, the field, the constraint, the table, the column, the offending value, and query fragments.** That message must never reach an HTTP client. Registering the mapper is what stops your schema from being readable from the outside.

Three details of that registration are load-bearing.

- **The message is replaced, not passed through.** Every branch returns a stable, application-controlled sentence.
- **The original survives as `cause`.** The framework's default response and its accessor both exclude it, so it remains available to server-side diagnostics and invisible to the client.
- **The registration is at module scope in a file the bootstrap imports**, so it is in place before the first request rather than after the first failure.

`ErrorUtil` is what both halves throw through, so a business refusal and a database failure reach the client in one shape.

Three things about it are the convention rather than the implementation.

**The body is always a diagnosis array**, even for a one-sentence refusal. A client that renders errors writes one renderer instead of branching on whether the body happens to be a string, and a field-level failure lands on its field because `accessor` names it. `IDiagnosis` is declared in `packages/api/src/typings`, so the frontend's pre-submit checks and the server's rejections speak the same vocabulary.

**The status is chosen by the caller, from meaning.** These are named constructors rather than one function taking a number, so a call site reads as the decision it made.

**`cause` is carried, never rendered.** The framework's response excludes it, which is what lets the mapper above attach the original Prisma error for server-side diagnosis without leaking the schema.

It lives in `src/utils` rather than `src/providers` because it owns no entity and reads no table. That is the test for the whole folder: `PasswordUtil`, `JwtUtil`, `PrismaErrorUtil`, and the date helpers all pass it, and a namespace named `*Provider` that fails it is in the wrong folder no matter what it is called.

## Generation Is Configured, Not Improvised

Two generators produce code that the rest of the repository imports, and both read a configuration file rather than command-line flags.

**Prisma** is configured in two places, and the split is not optional. `main.prisma` declares the datasource provider and the two generators. **The connection lives in `prisma.config.ts` at the backend root**, because a schema file no longer accepts a `url`.

Its `schema` points at the folder rather than a file, which is what makes the split-by-domain layout work. The url is the SQLite file, so cloning the repository and running `prepare` is the whole setup. Writing `url` into `main.prisma` instead is rejected, and the message names the property rather than the mistake.

**Nestia** is configured in `nestia.config.ts` at the backend root.

Three of its settings matter beyond the paths.

- **`input` selects the authored controller directory.** The literal `["src/controllers"]` names the source tree corresponding to runtime's adjacent `controllers` directory, without depending on Nestia's temporary config-loader directory.
- **`security`** is what puts the bearer scheme into the published document, so a consumer knows a token is needed.
- **`simulate: true`** is what gives the SDK its simulation mode, which the frontend develops against.

## Commands

```bash
cd packages/backend
pnpm build:prisma   # generate the client and the ERD
pnpm prepare        # push the schema to the database

pnpm build:api      # compile authored DTOs through the backend-owned command
pnpm build:main     # compile controllers and backend source
pnpm build:sdk      # after every operation and DTO is settled
pnpm build:test     # compile tests against the generated SDK
pnpm test           # run the e2e suite
```

The order is a dependency chain, not a preference. Nothing that imports the database client compiles before `build:prisma`. The backend-owned `build:api` command proves the authored DTOs before SDK generation. `build:main` proves the controller contract against those DTOs. Run `build:sdk` only after every operation and DTO is settled; it generates the SDK and compiles the complete API package, then tests consume that fixed output.

Do not use the backend package's aggregate `pnpm build` while developing this phase, and do not run the workspace-root build. The aggregate command hides which authored layer failed, while the root command also compiles the unfinished frontend.

## One Writer At A Time

Generation, build, lint, and test commands share generated API files, Prisma output, compiler caches, and plugin executables. Run them serially in one workspace. Never start SDK generation beside another SDK generation, build, lint, or test, and never launch parallel agents that mutate the same generated tree.

A generator temporarily owns its output. Wait for it to finish before another command reads that output. Parallel execution here is not faster: one process can delete or replace a barrel while another compiler is reading it.

## The SDK Build, End To End

This is the loop everything else depends on, and getting it wrong produces failures that look like they came from somewhere else.

**1. The schema generates the client.** `build:prisma` reads `prisma/schema/`, writes the typed client into the backend's source tree, and regenerates `docs/ERD.md` from the same comments. Every provider, transformer, and collector imports from that output, so none of them compile before it runs.

**2. `prepare` pushes the schema to the database file.** SQLite means this creates or updates a local file with nothing to install and nothing to connect to. Run it after any schema change, or the running server queries columns that do not exist.

**3. The authored contract is compiled before generation.** Finish every DTO and controller signature, run backend `build:api`, and run `build:main`. Keep changing the authored contract until both packages agree; do not repeatedly generate an SDK from a contract that is still being designed.

**4. The settled controllers generate the SDK.** `build:sdk` reads the authored `src/controllers` directory from `nestia.config.ts`, emits `packages/api/src/functional/**` and `swagger.json`, and compiles the complete API package. Two consequences follow directly:

- **A controller outside the owned directory is absent from runtime and the SDK.** A controller inside it needs no second registration edit, and the generated population must match runtime discovery.
- **The JSDoc on each method becomes the SDK function's documentation and the OpenAPI description.** A documentation edit is a contract change, so it needs this step too.

**5. Everything downstream consumes the regenerated SDK.** Run `build:test` after generation. The e2e tests import their accessors from the SDK, and the frontend later imports the same accessors and types.

That is why an unregenerated change appears to work. The backend still compiles, the server still runs, and only a consumer notices, on the next clean build, in a package nobody was editing.

## When To Regenerate

| Change                                   | Run during authoring                                      |
| ---------------------------------------- | --------------------------------------------------------- |
| a model, a column, or a schema comment   | backend `build:prisma`, then `prepare`                    |
| a DTO in `packages/api/src/structures`   | backend `build:api`                                       |
| a controller signature, route, or method | backend `build:main`                                      |
| JSDoc on a controller method             | backend `build:main`                                      |
| a provider body only                     | backend `build:main`                                      |
| the complete DTO/operation contract      | backend `build:sdk`, then `build:test`                    |

When a DTO or operation changes after SDK generation, finish the complete contract correction first, rerun backend `build:api` and `build:main`, then regenerate the SDK once. Do not use a root build as a substitute for assigning the failure to its package.

## Consuming The SDK

The tests and the frontend consume the same package and the same way.

```ts
import api, { IShoppingSale, IPage } from "{{apiPackageName}}";

const connection: api.IConnection = { host: "http://127.0.0.1:37001" };
const page: IPage<IShoppingSale.ISummary> =
  await api.functional.shopping.customer.sale.index(connection, {
    limit: 20,
  });
```

The default export is `api`, and accessors live under `api.functional` along the route path. Types are named exports from the same package.

Authentication is not something a consumer wires up. A lifecycle accessor writes the issued token into the connection it was given, because its controller method declares `@setHeader token.access Authorization`. The caller passes the same connection object to later calls and is authenticated.

The API skill owns the full consumption contract, including simulation mode.

## The Order Of A First Run

Given only the requirement documents and an empty repository, this is the sequence that gets to a running server.

1. Read every document under `docs/analysis/`.
2. Write the schema under `packages/backend/prisma/schema/`, then `build:prisma` and `prepare`.
3. Finish the DTOs under `packages/api/src/structures/`, then run `pnpm build:api` from `packages/backend`.
4. Finish every controller stub and its contract JSDoc under `packages/backend/src/controllers/`, then run `build:main` and confirm discovery sees the expected population.
5. Once the DTO and operation contract is settled, run `build:sdk`, then write the tests under `packages/backend/test/features/` and run `build:test`.
6. Write the transformers under `packages/backend/src/transformers/` and the collectors under `packages/backend/src/collectors/`, one per DTO that needs each.
7. Realize: swap each stub body for its call into a provider under `packages/backend/src/providers/` and remove its implementation-pending sentence, then `build:main` and run the tests.
8. Start the server and confirm it answers.
9. Build the frontend against simulation, then against this server.

Each step reads everything the earlier steps produced. A step that cannot proceed usually means an earlier one is incomplete, and the fix belongs there.

**Steps 6 and 7 are in that order for a reason.** A provider that is written before its transformer exists inlines a selection and a mapping, and that inline copy is what the transformer then has to be reconciled with. Writing the read side and the write side first leaves the provider with only the business logic, which is what it is for.

**Step 5 before step 7 is deliberate too.** Tests written from the contract and the requirements describe what should happen; tests written after the provider describe what it happens to do, and the difference is invisible in a green suite.
