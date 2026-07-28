# {{name}}

This repository is a benchmark application generated from the requirement documents under `docs/analysis/`. It contains an empty but runnable NestJS, Nestia, Prisma SQLite, React, Vite, and Playwright workspace. The application schema, routes, behavior, tests, and screens are intentionally left for the coding agent to implement from those documents.

The scaffold was adapted from `wrtnlabs/autobe-mcp` commit `bf7d0373de9cae932c111a5b9141020f3afc1019`. AutoBE-specific MCP servers, compiler ownership guards, resident state, lint rules, Hallmark skills, PostgreSQL assets, and throughput benchmarks are deliberately excluded.

## Commands

```bash
pnpm install
pnpm build
pnpm lint
pnpm test
pnpm format
```

Run `pnpm prepare:database` after changing the Prisma schema. Install Chromium once with `pnpm --filter {{frontendPackageName}} playwright:install` before running the browser suite.
