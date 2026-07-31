# Frontend Review

Before reviewing, read `AGENTS.md` and every required document under `.agents/skills/review/` and `.agents/skills/campaign/` in full. Obey them throughout this objective.

Review the complete frontend and its live behavior by reading the current files yourself.

Full reading is literal: open and read every file in the complete review scope. Never replace it with searches, summaries, inventories, build results, or previous reviews.

Every review round must cover the entire table below as one indivisible full reading. Never partition the scope between rounds or compose partial reviews into a result. If you find even one problem or omission, fix it and restart the complete table. Repeat full-scope rounds without any limit until one entire round has no omitted file, requirement, artifact, journey, or relation, finds no problem, and makes no edit.

Ensure backend `pnpm dev` and frontend `pnpm dev` are running. Fix every diagnostic either process reports and restart the complete review; complete only after the current live application reloads without error.

| Read in full | Compare with |
| --- | --- |
| Requirements | Screens, user journeys, and tests |
| API operations and DTOs | Frontend behavior, data flow, errors, and tests |
| Frontend source | Requirements, API contracts, user journeys, and live behavior |
| Browser tests | Requirements and implemented user journeys |
| Every implemented artifact | The requirement or API contract that justifies it |
