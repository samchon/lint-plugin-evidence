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

## Configuration Ownership

The complete graph is declared in three files.

| File | Claims |
| --- | --- |
| `packages/backend/lint.config.ts` | `schema-models`, `api-operations`, `backend-tests` |
| `packages/api/lint.config.ts` | `dto-types`, `dto-properties` |
| `packages/frontend/lint.config.ts` | `frontend-screens`, `frontend-journeys` |

The template starts with all seven claims active and every evidence rule at its final severity. Do not disable a claim merely because it may become noisy later.

## Development-Time Claim Deferral

Use temporary claim deferral at your discretion when the current development stage makes an active claim produce a diagnostic flood that obscures the layer being built. Large corpora can multiply every missing requirement across several claims; processing that full frontier before its hosts exist wastes context without improving the implementation.

Temporarily defer only a whole claim entry by commenting that entry inside its existing `claims` array. Keep the complete claim block in `lint.config.ts` unchanged and visible. Do not delete it, move it elsewhere, change its `files`, `symbol`, or `reference` population, disable `evidence/graph`, lower a rule severity, or alter a requirement to reduce the denominator.

Claims may be activated, deferred again after an upstream rewrite, and reactivated as implementation dependencies change. Use the following milestones as guidance rather than a mandatory schedule:

1. Activate `schema-models` when the database model is substantially declared.
2. Activate `dto-types` and `dto-properties` when authored contract structures exist.
3. Activate `api-operations` when controller stubs expose the intended contract.
4. Activate `backend-tests` when generated operations, DTOs, and feature-test hosts exist.
5. Activate `frontend-screens` when the page surface is declared.
6. Activate `frontend-journeys` when page exports and browser journey hosts exist.

After activating a claim, inspect its complete diagnostic population and repair the owning artifacts and acknowledgements. Temporary deferral controls when the work is surfaced; it never removes the work.

Keep `evidence/documented`, `evidence/todo`, and `evidence/singular` active wherever the package config defines them. Those rules maintain declaration and implementation debt while graph claims are staged.

## Final State

Before any completion report:

1. Open all three `lint.config.ts` files and restore every temporarily commented claim.
2. Confirm the active claim names are exactly the seven names in the configuration table.
3. Confirm every configured evidence rule retains its original `error` severity and every claim retains its original population.
4. Run the complete package lint, build, and test gates with no staged configuration override.
5. Read and execute [Review](../review/SKILL.md) against the fully active graph.

A green subset is an implementation checkpoint, not completion. Any commented claim, narrowed population, disabled rule, remaining `@todo`, or unreviewed graph edge blocks the final report.
