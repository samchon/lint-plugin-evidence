---
name: project
description: Defines the workspace layout, package boundaries, build order, and canonical commands for this monorepo. Use when orienting in the repository, working inside any package, or choosing a build, lint, or test command.
---

# Project Outline

## What This Repository Is

A requirement set under `docs/` realized as a running application. The documents state what must be true; the packages make it true. Nothing here is a demo or a sketch, and a stub that satisfies a type without satisfying the requirement is not progress.

## Layout

- `docs/` — the requirement documents. Read-only specification. Do not edit them to match the implementation.
- `packages/backend` — the NestJS server, the Prisma schema, the providers, and the end-to-end tests.
- `packages/api` — the SDK generated from the backend's controllers by Nestia. Generated output; do not hand-edit.
- `packages/frontend` — the Vite and React single-page application, which consumes `packages/api`.
- `config/` — the shared `tsconfig.json` and lint configuration that every package extends.

## The Toolchain Is `ttsc`, Not `tsc`

Builds, type checks, and lint run through `ttsc`, and tests run through `ttsx`. Lint is part of the compile: diagnostics arrive in the same stream as type errors and the exit code sums both.

Never substitute stock `tsc`, `ts-node`, or a separate ESLint invocation. A green stock `tsc` proves nothing about this project because it skips every lint rule the build enforces.

## Build Order

The order is not a preference; each step consumes the previous step's output.

1. `pnpm --filter {{backendPackageName}} build:prisma` — generates the Prisma client from `prisma/schema`. Nothing that imports the client compiles before this runs.
2. `pnpm --filter {{apiPackageName}} build` — regenerates the SDK and `swagger.json` from the backend's controllers. Run this after any controller or DTO change, or the SDK the tests and the frontend import is stale.
3. `pnpm --filter {{backendPackageName}} build:main` — compiles the server.
4. `pnpm --filter {{frontendPackageName}} build` — builds the SPA.

`pnpm build` at the workspace root runs the whole chain in that order.

## Commands

```bash
pnpm install
pnpm build
pnpm lint
pnpm test
```

Run them from the workspace root. Run the narrowest command that proves your change first, then a broader one when shared behavior changed.

## Generated Artifacts

`packages/api/src/functional`, `packages/api/swagger.json`, and the Prisma client output are generated. Editing them by hand produces a change that the next generation silently deletes, and the deletion looks like someone else's bug.

Change the source that generates them: a controller signature, a DTO, or the schema. Then regenerate.
