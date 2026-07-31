# Evidence Backend Review

Read `.agents/skills/review/SKILL.md` before working.

Review the written reason on every backend `@evidence` and `@evidenceExclude` acknowledgement. Do not perform a general code review or review the frontend.

Do not recheck target resolution, host eligibility, or coverage; compilation owns those structural checks. For each `@evidence`, decide whether the reason specifically and truthfully explains why the host implements, represents, or proves the cited target. For each `@evidenceExclude`, decide whether the reason specifically and truthfully explains the non-applicability, actual owner or observable alternative, and concrete veto condition.

Fix every vague, circular, copied, irrelevant, or false reason. After any correction, restart from the first backend reason. Complete when one pass over every backend reason requires no edit.

| Claim | Every reason must explain |
| --- | --- |
| `schema-models` | The requirement that makes the model necessary |
| `dto-types` | The requirement and Prisma model represented by the DTO |
| `dto-properties` | The Prisma column represented by the property |
| `api-operations` | The requirement and Prisma model exposed by the operation |
| `backend-tests` | The requirement, API operation, and DTO contract proved by the test |
