# Backend Review

Before reviewing, read `AGENTS.md` and every related document under `.agents/skills/review/` and `.agents/skills/campaign/` in full. Obey them throughout this objective.

Review the complete API and backend by reading the current files yourself. Do not review the frontend.

Full reading is literal: open and read every file in the complete review scope. Never replace it with searches, summaries, inventories, build results, or previous reviews.

Every review round must cover the entire table below as one indivisible full reading. Never partition the scope between rounds or compose partial reviews into a result. If you find even one problem or omission, fix it and restart the complete table. Repeat full-scope rounds without any limit until one entire round has no omitted file, requirement, artifact, or relation, finds no problem, and makes no edit.

After one entire round finds no problem and makes no edit, run `pnpm build:test` from `packages/backend`. Fix every failure and restart the complete review.

| Read in full | Compare with |
| --- | --- |
| Requirements | Database, API, and tests |
| Database design | Requirements, API, backend behavior, and tests |
| API controllers and DTOs | Requirements, database design, backend behavior, and tests |
| Backend source and tests | Requirements and API contracts |
| Every implemented artifact | The requirement that justifies it |
