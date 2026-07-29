# {{name}}

This repository is a benchmark application generated from the complete frozen subject corpus under `docs/analysis/`. The materializer copies every regular file from the selected subject directory, including Markdown requirements and machine-readable JSON or JSONL inventories. It contains an empty but runnable NestJS, Nestia, Prisma SQLite, React, Vite, and Playwright workspace. The application schema, routes, behavior, tests, and screens are intentionally left for the coding agent to implement from that corpus.

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

The included GitHub Actions workflow performs a frozen install, build, lint, SQLite preparation, backend tests, and Chromium frontend tests on every push and pull request. It uses only local CI environment values and requires no repository secrets.
