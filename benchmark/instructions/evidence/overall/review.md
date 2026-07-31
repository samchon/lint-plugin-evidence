# Evidence Overall Review

Read `AGENTS.md` and the skill documents relevant to this objective before working.

Review the written reason on every `@evidence` and `@evidenceExclude` acknowledgement in the application. Do not perform a general code review.

Do not recheck target resolution, host eligibility, or coverage; compilation owns those structural checks. For each `@evidence`, decide whether the reason specifically and truthfully explains why the host implements, represents, or proves the cited target. For each `@evidenceExclude`, decide whether the reason specifically and truthfully explains the non-applicability, actual owner or observable alternative, and concrete veto condition.

Fix every vague, circular, copied, irrelevant, or false reason. After any correction, restart from the first reason. Complete when one pass over every reason requires no edit.

| Claims | Every reason must explain |
| --- | --- |
| `schema-models` | The requirement that makes the model necessary |
| `dto-types`, `dto-properties` | The requirement, model, or column represented by the DTO |
| `api-operations` | The requirement and model exposed by the operation |
| `backend-tests` | The requirement, operation, and DTO contract proved by the test |
| `frontend-screens` | The requirement delivered by the screen |
| `frontend-journeys` | The requirement and screens exercised by the journey |
