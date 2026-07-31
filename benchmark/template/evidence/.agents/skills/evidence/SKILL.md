---
name: evidence
description: Defines evidence-arm graph claims, automatic TypeScript claim activation, frozen configuration ownership, and acknowledgement tags. Read in full at the start of every Evidence objective and again before responding to an evidence/graph diagnostic or reviewing an acknowledgement.
---

# Evidence Lint

## Graph Contract

An evidence graph claim selects authored declarations that must acknowledge every unit selected by each configured reference. Every claim-reference pair is a separate obligation: satisfying one claim never satisfies another, and one reference in an array never satisfies its neighbors.

`@evidence <target> <reason>` states that the selected host owns the target. `@evidenceExclude <target> <reason>` states that this claim intentionally does not own the target and names the actual owner or observable alternative. Both forms cover the target's selected descendants, remain claim-local, and require disjoint scopes.

All claim objects stay configured from the first command onward. A TypeScript claim is inactive while its own `root`, `files`, and `symbol` population contains no selected exported host. The first selected exported host activates the whole claim and every configured reference automatically. A missing or unreadable own population is still an error; only a successfully loaded zero-host population is inactive.

Inactivity is not proof that no artifact is required. It prevents a future-layer claim from demanding acknowledgements before that layer has a host; the applicable base layer skill still determines whether the requirements demand a host.

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
- `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` for `dto-types` and `dto-properties`;
- `packages/backend/test/features/TEST_EVIDENCE_EXCLUDE.ts` for `backend-tests`;
- `packages/frontend/src/components/SCREEN_EVIDENCE_EXCLUDE.ts` for `frontend-screens`;
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

`packages/backend/lint.config.ts` is the sole canonical owner of all five backend-phase claims. Its no-emit `tsconfig.lint.json` explicitly includes `packages/api/src/structures`, so the rooted `dto-types` and `dto-properties` populations remain inside `ttsc`'s supplied source roots rather than being discovered from imports or the filesystem.

Backend main, lint, and tool Programs use that root configuration directly. The test Program enters through `packages/backend/test/lint.config.ts`, which only extends the root configuration. TypeScript claim activation derives the applicable projection from each Program's actual selected exported hosts, so no Program-specific file duplicates or edits the graph.

Nestia sets `NESTIA_SDK_TRANSFORM=1` while compiling its private config-loader and SDK runtime Programs. Those Programs do not preserve the package root that the graph populations require. The canonical configuration contains one exact, immutable bypass for that environment only. Ordinary `pnpm lint`, main builds outside Nestia's private Programs, and the test Program still run the graph at `error` severity.

The template ships all seven claim objects and `evidence/graph` at `error` severity as frozen configuration. TypeScript claim activation follows the selected exported host population; it is never managed through `lint.config.ts`.

## Phase Gates

At the Backend Phase gate, validate all five configured claims in `packages/backend/lint.config.ts`, confirm the sealed Nestia guard and the test config's root extension are unchanged, and follow the canonical backend gate in [Backend](../backend/SKILL.md). `build:sdk` proves generation, not graph health: the ordinary canonical `pnpm lint` immediately before and after it must pass with the guard inactive.

At the Frontend Phase gate, confirm all seven claim objects remain configured in the two canonical files with their original populations and `error` severities. Confirm the backend test config still extends the canonical root and validate the frontend claims. If frontend work changed an API or backend source, re-pass the affected backend gate first.

At the Overall Phase gate, confirm all seven exact claim objects remain configured, confirm `evidence/graph` remains at `error` outside the sealed Nestia environment, confirm the backend test config still extends the canonical root, run the project-wide gates, and execute [Review](../review/SKILL.md) against every populated claim. Configuration and the current host populations, not an agent's prose report, prove enforcement.

A green phase subset is not whole-project completion. Any missing claim object, altered population, disabled rule, remaining phase-owned `@todo`, required host absent from an inactive population, or unreviewed phase edge blocks that phase report.
