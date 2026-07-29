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

The complete graph is declared in three package-local files. Open the file that owns the affected population; there is no root graph configuration that replaces them.

| File | Claims |
| --- | --- |
| `packages/backend/lint.config.ts` | `schema-models`, `api-operations`, `backend-tests` |
| `packages/api/lint.config.ts` | `dto-types`, `dto-properties` |
| `packages/frontend/lint.config.ts` | `frontend-screens`, `frontend-journeys` |

The template starts with all seven claims active and every evidence rule at its final severity. Do not disable a claim merely because it may become noisy later.

## Temporary Claim Deferral

During active development, if excessive graph diagnostics bury the working context, use your judgment to comment out only the affected whole claim objects. Do not edit a deferred object or weaken the surrounding rules.

For example, this is a valid temporary deferral of `api-operations` in `packages/backend/lint.config.ts`:

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

Comment every line of the existing object. Remove only those line-comment markers to reactivate it. Apply the same whole-object operation to claims in the other two package configurations. Restore every deferred claim before the final review.

## Final State

Before any completion report:

1. Open all three `lint.config.ts` files and restore every temporarily commented claim.
2. Confirm the active claim names are exactly the seven names in the configuration table.
3. Confirm every configured evidence rule retains its original `error` severity and every claim retains its original population.
4. Run the complete package lint, build, and test gates with no staged configuration override.
5. Read and execute [Review](../review/SKILL.md) against the fully active graph.

A green subset is an implementation checkpoint, not completion. Any commented claim, narrowed population, disabled rule, remaining `@todo`, or unreviewed graph edge blocks the final report.
