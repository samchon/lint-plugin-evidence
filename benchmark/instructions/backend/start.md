# Backend Start

Use goal mode for this backend implementation stage. Resume the same unfinished stage goal after an interruption; otherwise create it now. Keep it bounded to making the complete API and backend ready for exhaustive review, and mark it complete only when every backend obligation and basic backend gate below is satisfied.

Build the complete API and backend required by every file under `docs/analysis/`.

Before editing, read `AGENTS.md` and every applicable Requirements, API, Backend, Evidence, and Review instruction in full. Treat every normative sentence, table row, state transition, authorization rule, error case, non-functional requirement, and atomic acceptance criterion as binding.

Complete this phase in dependency order:

1. read and inventory the entire requirement corpus;
2. design the database schema and generate Prisma;
3. author flat exported DTOs and controller contracts;
4. generate the SDK from controller stubs;
5. write requirement-derived backend tests;
6. implement transformers, collectors, providers, and controllers;
7. prepare the database, pass the API and backend gates, and exercise the running server.

Do not implement or redesign `packages/frontend` during this phase. Read frontend-facing requirements as API constraints, but leave frontend realization for its later phase. Generated SDK output under `packages/api` is part of the backend contract and is allowed.

Run backend-scoped commands from `packages/backend` or `packages/api`, never from the workspace root when the root command would compile the unfinished frontend. Work autonomously until the backend is ready for exhaustive review. Report the exact commands run and any unfinished backend obligation.
