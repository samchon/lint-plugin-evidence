# Evidence Backend Review

Read `AGENTS.md` and the skill documents relevant to this objective before working.

Review every backend `@evidence` and `@evidenceExclude` acknowledgement for accuracy. Do not perform a general code review or review the frontend.

For each `@evidence`, confirm that the target exists, the host actually owns the cited responsibility, and the reason precisely explains that relationship. For each `@evidenceExclude`, confirm that the target belongs to the claim and the reason names the actual owner or observable alternative and a concrete veto condition.

Fix every inaccurate, irrelevant, vague, or false acknowledgement. After any correction, restart from the first backend acknowledgement. Complete when one pass over every backend acknowledgement requires no edit.

| Claim | Every acknowledgement must match |
| --- | --- |
| `schema-models` | The requirement that makes the model necessary |
| `dto-types` | The requirement and Prisma model represented by the DTO |
| `dto-properties` | The Prisma column represented by the property |
| `api-operations` | The requirement and Prisma model exposed by the operation |
| `backend-tests` | The requirement, API operation, and DTO contract proved by the test |
