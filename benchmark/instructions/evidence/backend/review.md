# Evidence Backend Review

Read `.agents/skills/review/SKILL.md` before working.

Review the written reason on every backend `@evidence` and `@evidenceExclude` acknowledgement. Do not perform a general code review or review the frontend.

Review only whether each `@evidence` or `@evidenceExclude` reason precisely and truthfully explains why it applies.

Fix every vague, circular, copied, irrelevant, or false reason. After any correction, restart from the first backend reason. Complete when one pass over every backend reason requires no edit.

| Claim | Every reason must explain |
| --- | --- |
| `schema-models` | The requirement that makes the model necessary |
| `dto-types` | The requirement and Prisma model represented by the DTO |
| `dto-properties` | The Prisma column represented by the property |
| `api-operations` | The requirement and Prisma model exposed by the operation |
| `backend-tests` | The requirement, API operation, and DTO contract proved by the test |
