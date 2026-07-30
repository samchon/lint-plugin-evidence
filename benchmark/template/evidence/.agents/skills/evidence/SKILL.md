---
name: evidence
description: Defines evidence-arm graph claims, configuration ownership, temporary claim deferral, acknowledgement tags, and mandatory final reactivation. Use before editing an evidence lint.config.ts, adding or reviewing @evidence or @evidenceExclude tags, or responding to evidence/graph diagnostics.
---

# Evidence Lint

## Graph Contract

An evidence graph claim selects authored declarations that must acknowledge every unit selected by each configured reference. Every claim-reference pair is a separate obligation: satisfying one claim never satisfies another, and one reference in an array never satisfies its neighbors.

`@evidence <target> <reason>` states that the selected host owns the target. `@evidenceExclude <target> <reason>` states that this claim intentionally does not own the target and names the actual owner or observable alternative. Both forms cover the target's selected descendants, remain claim-local, and require disjoint scopes.

Use the owning layer document for tag placement and examples:

- [database.md](../backend/database.md) for `schema-models`;
- [controllers.md](../backend/controllers.md) for `api-operations`;
- [dtos.md](../backend/dtos.md) for `dto-types` and `dto-properties`;
- [testing.md](../backend/testing.md) for `backend-tests`;
- [screens.md](../frontend/screens.md) for `frontend-screens`;
- [verification.md](../frontend/verification.md) for `frontend-journeys`; and
- [providers.md](../backend/providers.md) for the residual provider edge, where neither evidence tag belongs.

## Acknowledgement Placement

Ownership and non-applicability have different homes. Keep every `@evidence` on the actual declaration selected by the claim: a model, DTO type or property, controller method, test function, screen, or journey. Never move ownership evidence into a central ledger.

TypeScript exclusions may be collected on the public const in the matching claim population:

- `packages/backend/src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts` for `api-operations`;
- `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` for `dto-types` and `dto-properties`; and
- `packages/backend/test/features/TEST_EVIDENCE_EXCLUDE.ts` for `backend-tests`;
- `packages/frontend/src/components/SCREEN_EVIDENCE_EXCLUDE.ts` for `frontend-screens`; and
- `packages/frontend/tests/journeys/JOURNEY_EVIDENCE_EXCLUDE.ts` for `frontend-journeys`.

The const's property symbol need not match the claim's ownership selector. The file still must match that claim, the export must remain public, and every target remains claim-local and reference-local. The same carrier tag may participate in multiple matching claim-reference pairs: in particular, a Prisma model on `DTO_EVIDENCE_EXCLUDE` is both a `dto-types` model target and an ancestor of that model's selected `dto-properties` columns. Use an exact column target when only the property obligation is excluded.

Schema exclusions may be collected as unattached top-level `/// @evidenceExclude` lines in `packages/backend/prisma/schema/exclude.schema`. That lint-only file is an explicit input of `schema-models` and is not a Prisma generate, migration, or ERD input. Only exclusions belong there; `@evidence` remains directly above its selected model.

## Configuration Ownership

The complete graph is declared in two canonical package-local files. Open the file that owns the affected population; there is no root graph configuration that replaces them.

| File | Claims |
| --- | --- |
| `packages/backend/lint.config.ts` | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests` |
| `packages/frontend/lint.config.ts` | `frontend-screens`, `frontend-journeys` |

The benchmark activates only `evidence/graph`. Do not add `evidence/todo`: the Evidence arm uses `@todo` as its explicit stub ledger and verifies its removal with source-scoped searches, while an additional lint rule would change the measured gate workload.

`packages/backend/lint.config.ts` is the sole canonical owner of all five backend-phase claims and every temporary deferral. Its no-emit `tsconfig.lint.json` explicitly includes `packages/api/src/structures`, so the rooted `dto-types` and `dto-properties` populations remain inside `ttsc`'s supplied source roots rather than being discovered from imports or the filesystem.

`packages/backend/lint.config.main.ts` and `packages/backend/lint.config.test.ts` are immutable projections for emission Programs. The main projection contains `schema-models` and `api-operations`; the test projection adds `backend-tests`. Neither repeats the DTO claims, because adding API source roots to either emission Program would duplicate API output.

Only the main projection may disable its graph for Nestia's temporary config-loader Program. The canonical no-emit lint configuration and the test projection always run their graphs at `error` severity. Do not edit or defer either projection.

The template starts with all seven claims active and `evidence/graph` at `error` severity. Keep claims for the layer under active development enabled. Claims for a later layer that has not started may be deferred as described below; they are not evidence of unfinished work in the current layer.

## Temporary Claim Deferral

During active development, a later-layer claim that has not started may be deferred when its expected diagnostics would bury the current work. Diagnostic volume never permits deferring the claim for the layer under active development. Comment out only the affected whole claim object.

This matrix is the canonical claim-state contract:

| Gate | Must be active | May be deferred only if not started |
| --- | --- | --- |
| Schema authoring | `schema-models` | `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys` |
| DTO authoring | `schema-models`, `dto-types`, `dto-properties` | `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys` |
| Controller authoring | `schema-models`, `dto-types`, `dto-properties`, `api-operations` | `backend-tests`, `frontend-screens`, `frontend-journeys` |
| SDK generation | `schema-models`, `dto-types`, `dto-properties`, `api-operations` | `backend-tests`, `frontend-screens`, `frontend-journeys` |
| Backend test | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests` | `frontend-screens`, `frontend-journeys` |
| Backend report | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests` | `frontend-screens`, `frontend-journeys` |
| Frontend screen | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens` | `frontend-journeys` |
| Frontend journey/report | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys` | None |
| Overall final | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys` | None |

Before `build:sdk`, the schema, DTO, and API-operation claims must all be active and healthy. Backend, Frontend, and Overall reports require every claim shown as active for that matrix gate to be restored. If frontend work proves a named backend defect, restore and revalidate every affected backend claim, regenerate affected output, and re-pass the Backend Phase gate before resuming frontend work.

To defer a claim, line-comment every line of its existing whole object in place. Restore it only by removing those comment markers, so its original `files`, `symbol`, `reference`, severity, and carrier population return byte-for-byte. Never rewrite the object, disable `evidence/graph`, narrow a population, or add an environment bypass.

## Phase Gates

At the Backend Phase gate, restore and validate all five claims in `packages/backend/lint.config.ts`, confirm both immutable Program projections are unchanged, and follow the canonical backend gate in [Backend](../backend/SKILL.md). The schema, DTO, and operation claims must be active before SDK generation; all five must be active before the backend report.

At the Frontend Phase gate, restore all seven claims in the two canonical configurations with their original populations and `error` severities. Confirm both immutable backend projections are unchanged and validate the frontend claims. If frontend work changed an API or backend source, re-pass the affected backend gate first.

At the Overall Phase gate, restore all seven exact claim objects, confirm `evidence/graph` remains at `error`, confirm both immutable projections are unchanged, run the project-wide gates, and execute [Review](../review/SKILL.md) against the fully active graph. Configuration files, not an agent's prose report, prove restoration.

A green phase subset is not whole-project completion. Any claim missing from its active phase, narrowed population, disabled rule, remaining phase-owned `@todo`, or unreviewed phase edge blocks that phase report.
