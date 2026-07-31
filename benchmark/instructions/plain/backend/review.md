# Plain Backend Review

Review the complete API and backend by reading the current files yourself. Do not review the frontend.

1. Read every file under `docs/analysis/` in full, without omitting a single file, section, or requirement.
2. Read every file under `packages/backend/prisma/schema/`, `packages/api/src/structures/`, `packages/api/src/functional/`, `packages/backend/src/`, and `packages/backend/test/` in full, without sampling or skipping generated contracts.
3. Trace every requirement forward through the database, DTOs, API operations, backend logic, generated SDK, and tests.
4. Trace every database model, DTO, API operation, logic branch, SDK contract, and test backward to the requirement that justifies it.
5. Check every relation, property, authorization rule, state transition, error path, side effect, and test assertion for omissions, contradictions, and incorrect behavior.

Searches, summaries, inventories, build results, and previous reviews never replace this full reading. If you find even one problem, fix it and restart at item 1. Repeat without any round limit. Complete only when one entire round finds no problem and makes no edit.
