# Evidence Overall Review

Read `AGENTS.md` and the skill documents relevant to this objective before working.

Review every `@evidence` and `@evidenceExclude` acknowledgement in the application for accuracy. Do not perform a general code review.

For each `@evidence`, confirm that the target exists, the host actually owns the cited responsibility, and the reason precisely explains that relationship. For each `@evidenceExclude`, confirm that the target belongs to the claim and the reason names the actual owner or observable alternative and a concrete veto condition.

Fix every inaccurate, irrelevant, vague, or false acknowledgement. After any correction, restart from the first acknowledgement. Complete when one pass over every acknowledgement requires no edit.

| Claims | Every acknowledgement must match |
| --- | --- |
| `schema-models` | The requirement that makes the model necessary |
| `dto-types`, `dto-properties` | The requirement, model, or column represented by the DTO |
| `api-operations` | The requirement and model exposed by the operation |
| `backend-tests` | The requirement, operation, and DTO contract proved by the test |
| `frontend-screens` | The requirement delivered by the screen |
| `frontend-journeys` | The requirement and screens exercised by the journey |
