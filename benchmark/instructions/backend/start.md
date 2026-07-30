# Backend Start

Treat this backend implementation stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Keep it bounded to making the complete API and backend ready for the active arm's review, and declare it complete only when every backend obligation and basic backend gate below is satisfied.

Build the complete API and backend required by every file under `docs/analysis/`.

The skills-contract turn remains binding. Before editing, re-read `AGENTS.md` and every applicable Requirements, API, Backend, Evidence, and Review instruction in full. Treat every normative sentence, table row, state transition, authorization rule, error case, non-functional requirement, and atomic acceptance criterion as binding.

Complete this phase in dependency order:

1. read and inventory the entire requirement corpus;
2. design the database schema, then run `pnpm build:prisma` and `pnpm prepare` from `packages/backend`;
3. finish the flat exported DTOs, then run `pnpm build` from `packages/api`;
4. finish every controller operation and contract, then run `pnpm build:main` from `packages/backend`;
5. only after every operation and DTO is settled, run `pnpm build:sdk`;
6. write requirement-derived backend tests;
7. implement transformers and collectors, realize the providers and controllers, and remove every completed backend `@todo`;
8. from `packages/backend`, rerun `pnpm build:main`, then run `pnpm build:test`, `pnpm lint`, `pnpm test`, and the live-server checks.

In the Evidence arm, keep the claim for the layer under active development enabled. Prefer commenting out only the whole claim objects for later layers that have not started when their diagnostics would bury the current work. Restore each claim when its layer starts and restore all five backend-phase claims before the phase report.

Do not implement or redesign `packages/frontend` during this phase. Read frontend-facing requirements as API constraints, but leave frontend realization for its later phase. Generated SDK output under `packages/api` is part of the backend contract and is allowed.

Run these commands serially. Do not use the backend package's aggregate `pnpm build`, and never build from the workspace root while that command would compile the unfinished frontend. Work autonomously until the backend is ready for the active arm's review. Report the exact commands run and any unfinished backend obligation.
