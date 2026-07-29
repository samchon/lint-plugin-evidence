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

Ownership and non-applicability have different homes. Keep every `@evidence` on the actual declaration selected by the claim: a model or field, DTO type or property, controller method, test function, screen, or journey. Never move ownership evidence into a central ledger.

TypeScript exclusions may be collected on the public const in the matching claim population:

- `packages/backend/src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts` for `api-operations`;
- `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts` for `dto-types` and `dto-properties`; and
- `packages/backend/test/features/TEST_EVIDENCE_EXCLUDE.ts` for `backend-tests`.

The const's property symbol need not match the claim's ownership selector. The file still must match that claim, the export must remain public, and every target remains claim-local and reference-local. The same carrier tag may participate in multiple matching claim-reference pairs: in particular, a Prisma model on `DTO_EVIDENCE_EXCLUDE` is both a `dto-types` model target and an ancestor of that model's selected `dto-properties` columns. Use an exact column target when only the property obligation is excluded.

Schema exclusions may be collected as unattached top-level `/// @evidenceExclude` lines in `packages/backend/prisma/schema/exclude.schema`. That lint-only file is an explicit input of `schema-models` and is not a Prisma generate, migration, or ERD input. Only exclusions belong there; `@evidence` remains directly above its model or field.

## Configuration Ownership

The complete graph is declared in three package-local files. Open the file that owns the affected population; there is no root graph configuration that replaces them.

| File | Claims |
| --- | --- |
| `packages/backend/lint.config.ts` | `schema-models`, `api-operations`, `backend-tests` |
| `packages/api/lint.config.ts` | `dto-types`, `dto-properties` |
| `packages/frontend/lint.config.ts` | `frontend-screens`, `frontend-journeys` |

The template starts with all seven claims active and every evidence rule at its final severity. Keep claims for the layer under active development enabled. Claims for a later layer that has not started may be deferred as described below; they are not evidence of unfinished work in the current layer.

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

For example, this is a valid temporary deferral of `api-operations` in `packages/backend/lint.config.ts`:

<!-- claim-deferral-example: packages/backend/lint.config.ts#api-operations -->
```ts
claims: [
  // {
  //   name: "api-operations",
  //   type: "typescript",
  //   files: ["src/controllers/**/*.ts"],
  //   symbol: "function",
  //   reference: [
  //     {
  //       type: "markdown",
  //       root: "../..",
  //       files: ["docs/analysis/**/*.md"],
  //       symbol: ["h2", "h3"],
  //     },
  //     {
  //       type: "prisma",
  //       files: ["prisma/schema/**/*.prisma"],
  //       symbol: ["model"],
  //     },
  //   ],
  // },
],
```

This is the same operation for `dto-properties` in `packages/api/lint.config.ts`:

<!-- claim-deferral-example: packages/api/lint.config.ts#dto-properties -->
```ts
claims: [
  // {
  //   name: "dto-properties",
  //   type: "typescript",
  //   files: ["src/structures/**/*.ts"],
  //   symbol: "property",
  //   reference: {
  //     type: "prisma",
  //     root: "../backend",
  //     files: ["prisma/schema/**/*.prisma"],
  //     symbol: ["column"],
  //   },
  // },
],
```

This is the same operation for `frontend-screens` in `packages/frontend/lint.config.ts`:

<!-- claim-deferral-example: packages/frontend/lint.config.ts#frontend-screens -->
```ts
claims: [
  // {
  //   name: "frontend-screens",
  //   type: "typescript",
  //   files: ["src/components/*/*-page.tsx", "!src/components/dev/**"],
  //   symbol: "function",
  //   reference: {
  //     type: "markdown",
  //     root: "../..",
  //     files: ["docs/analysis/**/*.md"],
  //     symbol: ["h2", "h3"],
  //   },
  // },
],
```

Comment every line of the existing object and remove only those line-comment markers to restore its original text. Never edit a claim's internals, severity, rule entry, `files`, `symbol`, or `reference` population; never disable `evidence/graph` or add an environment bypass. Deferral postpones feedback only for work that has not started. It never hides an active layer's diagnostics.

## Phase Gates

At the Backend Phase gate, restore and validate the five claims in `packages/backend/lint.config.ts` and `packages/api/lint.config.ts`.

1. From `packages/backend`, run `pnpm build:prisma` and `pnpm prepare`.
2. From `packages/api`, run `pnpm lint` and `pnpm build`.
3. Return to `packages/backend` and run `pnpm build:main`.
4. Confirm every operation and DTO is settled, then run `pnpm build:sdk`.
5. Run `pnpm build:test`, `pnpm lint`, and `pnpm test`.
6. Run the required live-server checks.

Do not use the backend package's aggregate `pnpm build` or the workspace-root build during this phase.

At the Frontend Phase gate, open all three `lint.config.ts` files and confirm that all seven original claim objects are active with their original populations and `error` severities. Validate the two frontend claims in `packages/frontend/lint.config.ts`. If frontend work changed API or backend sources, revalidate the affected configurations and re-pass the Backend Phase first.

At the Overall Phase gate:

1. Open all three `lint.config.ts` files and restore every temporarily commented claim.
2. Confirm the active claim names are exactly the seven names in the configuration table.
3. Confirm every configured evidence rule retains its original `error` severity and every claim retains its original population.
4. Verify restoration from the actual three configuration files, then run the complete workspace lint, build, and test gates with no staged configuration override. An agent's prose report is not restoration evidence.
5. Read and execute [Review](../review/SKILL.md) against the fully active graph.

A green phase subset is not whole-project completion. Any claim missing from its active phase, narrowed population, disabled rule, remaining phase-owned `@todo`, or unreviewed phase edge blocks that phase report.
