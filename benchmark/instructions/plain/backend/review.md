# Plain Backend Review

Before reviewing, read `AGENTS.md` and every required document under `.agents/skills/review/` and `.agents/skills/campaign/` in full. Obey them throughout this objective.

Review the complete API and backend by reading the current files yourself. Do not review the frontend.

Full reading is literal: open and read every file in the complete review scope. Never replace it with searches, summaries, inventories, build results, or previous reviews.

Every review round must cover the entire table below as one indivisible full reading. Never partition the scope between rounds or compose partial reviews into a result. If you find even one problem or omission, fix it and restart the complete table. Repeat full-scope rounds without any limit until one entire round has no omitted file, requirement, artifact, or relation, finds no problem, and makes no edit.

| Read in full | Compare with | Correct |
| --- | --- | --- |
| Requirements | Database, API, and tests | Missing, contradictory, or incorrect propagation of any requirement |
| Database design | Requirements, API, backend behavior, and tests | Models, fields, relations, constraints, or invariants that disagree or lack a requirement |
| API controllers and DTOs | Requirements, database design, backend behavior, and tests | Missing or contradictory operations, requests, responses, properties, errors, or authorization rules |
| Backend source and tests | Requirements and API contracts | Unimplemented or untested branches, transitions, errors, side effects, or negative paths |
| Every implemented artifact | The requirement that justifies it | Anything that cannot be traced back to a requirement |
