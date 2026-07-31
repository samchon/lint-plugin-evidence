# Evidence Backend Review

Before reviewing, read `AGENTS.md` and every document under `.agents/skills/evidence/` and `.agents/skills/review/` in full. Obey them throughout this objective.

Review only the configured backend Evidence claims and their acknowledgements in the current files. Do not perform a general code review or review the frontend.

Full traversal is literal: inspect every configured claim, its current population, every selected host, and every `@evidence` and `@evidenceExclude` acknowledgement. Never replace that traversal with lint output, searches, inventories, summaries, or a previous review.

Every review round must cover the entire table below as one indivisible claim traversal. Never partition claims or hosts between rounds. If you find even one defect or make any correction, restart the complete table. Repeat without any limit until one entire current-state round finds no defect and makes no edit.

| Review in full | Verify against |
| --- | --- |
| Canonical backend claims and their populations | The frozen claim configuration and current selected hosts |
| Every selected host | Its applicable requirement and configured references |
| Every `@evidence` acknowledgement | Its selected host, exact target, written reason, and full acknowledged scope |
| Every `@evidenceExclude` acknowledgement | Its eligible carrier, exact target, actual owner or observable alternative, veto condition, and full excluded scope |
| Every inactive TypeScript claim | The requirements, proving that no required host is missing |
