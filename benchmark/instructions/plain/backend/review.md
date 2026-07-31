# Plain Backend Review

Before reviewing, read `AGENTS.md` and every required document under `.agents/skills/review/` and `.agents/skills/campaign/` in full. Obey them throughout this objective.

Review the complete API and backend by reading the current files yourself. Do not review the frontend.

Full reading is literal: open and read every file in the complete review scope. Never replace it with searches, summaries, inventories, build results, or previous reviews.

1. Read every file under `docs/analysis/` in full, without omitting a single file, section, or requirement. For every requirement, compare how it is implemented in the database under `packages/backend/prisma/schema/`, the API controllers under `packages/backend/src/controllers/`, the DTOs under `packages/api/src/structures/`, and the tests under `packages/backend/test/features/`. Fix every missing, contradictory, or incorrect propagation.
2. Read every database schema file in full. Compare every model, field, relation, constraint, and invariant with the requirements, API contracts, backend behavior, and tests. Fix every mismatch and every schema element that lacks a requirement.
3. Read every API controller and DTO in full. Compare every operation, request, response, property, error contract, and authorization rule with the requirements, database design, backend behavior, and tests. Fix every omission and contradiction.
4. Read every backend source and test file in full. Verify that every API contract and requirement is implemented by the backend and proven by tests, including branches, state transitions, errors, side effects, and negative paths. Fix every unimplemented or untested behavior.
5. Trace every database element, API contract, backend behavior, and test backward to the requirement that justifies it. Remove or correct anything that has no requirement.

Every review round must cover the entire scope above as one indivisible full reading. Never partition the scope between rounds or compose partial reviews into a result. If you find even one problem or omission, fix it and restart the complete review at item 1. Repeat full-scope rounds without any limit until one entire round has no omitted file, requirement, artifact, or relation, finds no problem, and makes no edit.
