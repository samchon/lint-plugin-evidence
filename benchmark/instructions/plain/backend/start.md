# Plain Backend Start

Build the complete API and backend; do not implement the frontend.

Before action, re-read exactly: `AGENTS.md`, `.agents/skills/project/SKILL.md`, `.agents/skills/requirements/SKILL.md`, `.agents/skills/api/SKILL.md`, `.agents/skills/backend/SKILL.md`, `.agents/skills/backend/wiring.md`, `.agents/skills/backend/database.md`, `.agents/skills/backend/dtos.md`, `.agents/skills/backend/providers.md`, `.agents/skills/backend/controllers.md`, `.agents/skills/backend/testing.md`, `.agents/skills/campaign/SKILL.md`, and `.agents/skills/review/SKILL.md`.

Read every requirement; build schema then `build:prisma` and `prepare:database`; build DTOs then `build:api`; implement backend and controllers then `build:main`; generate SDK only after operations and DTOs settle; write tests; run `build:test`, `lint`, `test`, and live checks serially. Do not use backend aggregate or root build.

No implementation traversal, ledger, digest, or gate result counts toward the next independent review. Report exact commands and obligations.
