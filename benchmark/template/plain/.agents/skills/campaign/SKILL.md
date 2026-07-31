---
name: campaign
description: Defines the literal full-scope completeness review for backend, frontend, and overall review objectives. Read only for a review objective and repeat complete rounds until one current-state round finds no problem.
---

# Campaign

The compiler reports defects in artifacts that exist. It cannot report a required model, operation, test, screen, or journey nobody created. Completeness therefore requires a direct full reading of the active scope.

`docs/analysis/` is immutable and authoritative. Correct the application, never the requirements.

## Active Scope

| Review objective | Complete scope |
| --- | --- |
| Backend | every requirement, model, DTO, operation, backend source file, and backend test |
| Frontend | every requirement, API operation and DTO, frontend source file, browser test, and live behavior |
| Overall | every requirement and every authored application, test, and cross-layer relationship |

Generated SDK and Prisma output are inspected as regenerated results and consumer contracts, never edited as authored implementation.

## One Round

A qualifying round is one continuous traversal of the entire active scope:

1. Start at the first requirement.
2. Read every file in scope in full.
3. Compare every requirement forward to every artifact needed to realize it.
4. Compare every artifact backward to the requirement or necessary boundary that justifies it.
5. Compare adjacent layers in both directions.
6. Continue through the last artifact without omitting a file, requirement, branch, refusal, state, or relationship.

Do not partition a round by file, package, layer, requirement subset, review lens, time window, or agent. Do not combine partial reviews. Searches, inventories, diffs, build output, tests, or earlier reviews may help navigation but cannot replace direct reading.

## Relationships

| Source | Compare with |
| --- | --- |
| Requirements | database, DTOs, operations, logic, tests, screens, and journeys |
| Database | requirements, DTOs, operations, logic, and tests |
| DTOs and operations | requirements, database, providers, tests, and frontend consumers |
| Providers | requirements, schema invariants, operation contracts, and tests |
| Backend tests | requirements, operations, exchanged DTOs, effects, and refusals |
| Frontend | requirements, SDK contracts, states, interactions, and browser journeys |
| Browser tests | requirements, screens, actors, and live observable behavior |

Granularity matters. A DTO type maps to its concept and model; each property maps to a column or derivation. An operation maps to every effect and refusal it promises. A behavioral test must fail when the named behavior disappears.

## Restart Until Dry

Any finding invalidates the current round. Fix it at its owning layer, propagate its downstream consequences, wait for the resident compiler gate, and restart the complete active scope from the first requirement.

Repeat without a round limit. Stop only when one full current-state round reaches the end, omits nothing, finds no problem, and makes no edit.
