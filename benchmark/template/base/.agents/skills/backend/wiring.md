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

Database setup is a separate explicit step. `pnpm schema` enters the guarded `MySetupWizard` path and force-resets the disposable SQLite database. `MyBackend.open()` does not alter the schema.

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

Its `schema` points at the folder rather than a file, which is what makes the split-by-domain layout work. The url is the disposable SQLite file, so running `schema` after authoring the schema is the whole database setup. Writing `url` into `main.prisma` instead is rejected, and the message names the property rather than the mistake.

**Nestia** is configured in `nestia.config.ts` at the backend root.

Three of its settings matter beyond the paths.

- **`input` selects the authored controller directory.** The literal `["src/controllers"]` names the source tree corresponding to runtime's adjacent `controllers` directory, without depending on Nestia's temporary config-loader directory.
- **`security`** is what puts the bearer scheme into the published document, so a consumer knows a token is needed.
- **`simulate: true`** is what gives the SDK its simulation mode, which the frontend develops against.

## Commands

```bash
cd packages/backend
pnpm check:watch    # keep type, lint, and contributor checks running
pnpm build:prisma   # generate the client and the ERD
pnpm schema         # reset the SQLite database to the schema

pnpm build:sdk      # after every operation and DTO is settled
pnpm test           # run the e2e suite
```

The watcher starts first and stays resident. Its single Program includes backend source, tests, and authored API DTOs, automatically reloads lint configuration, and reports type, lint, and contributor diagnostics after every change. Nothing that imports the database client becomes clean before `build:prisma`. Run `build:sdk` only after every operation and DTO is settled; it generates the SDK and compiles the complete API package, then tests consume that fixed output.

Do not use the backend package's aggregate `pnpm build` while developing this phase, and do not run the workspace-root build. The aggregate command hides which authored layer failed, while the root command also compiles the unfinished frontend.

## One Writer At A Time

Generation and test commands share generated API files and Prisma output. Run those writers serially in one workspace, and never launch parallel agents that mutate the same generated tree. The read-only `check:watch` process remains resident while they run; transient diagnostics during generated-file replacement do not describe the settled state, so wait for its next completed rebuild.

A generator temporarily owns its output. Wait for it to finish before another command reads that output. Parallel execution here is not faster: one process can delete or replace a barrel while another compiler is reading it.

## When To Regenerate

| Change                                   | Run during authoring                  |
| ---------------------------------------- | ------------------------------------- |
| a model, a column, or a schema comment   | backend `build:prisma`, then `schema` |
| a DTO in `packages/api/src/structures`   | wait for `check:watch`                |
| a controller signature, route, or method | wait for `check:watch`                |
| JSDoc on a controller method             | wait for `check:watch`                |
| a provider body only                     | wait for `check:watch`                |
| the complete DTO/operation contract      | backend `build:sdk`                   |

When a DTO or operation changes after SDK generation, finish the complete contract correction first, wait for a clean watcher rebuild, then regenerate the SDK once. Do not use a root build as a substitute for assigning the failure to its package.

## Consuming The SDK

Tests and the frontend consume the same generated package. The [API skill](../api/SKILL.md) owns imports, connection mutation, authentication headers, simulation, and authored-versus-generated exports.
