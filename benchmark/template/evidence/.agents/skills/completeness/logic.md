# Logic Check

Read [SKILL.md](SKILL.md) first. No configured evidence claim covers `packages/backend/src/providers/**`; this residual edge is intentionally measured manually in both arms.

## Manual Residual Walk

For every public operation, map effects, rejections, authorization assumptions, and returned semantics to the provider path that realizes them. For every behavioral requirement, enumerate every provider path where it applies. For every schema invariant, enumerate every read and write that must preserve it.

Then walk every provider branch, query, mutation, default, and exception back to an operation, requirement, or schema invariant. Record these mappings in `wiki/completeness/residual.md` at the current digest.

## Integrity

Check absent versus empty, null versus undefined, inclusive bounds, time boundaries, state transitions, visibility, ownership, transactions, duplicate handling, deletion, ordering, pagination, and error translation. These failures usually leave graph structure and types green.

Providers own implementation. Controllers own the public operation and DTOs own public shapes. If logic review reveals a wrong schema or contract, repair that owner and invalidate all downstream citations and tests rather than hiding it in a provider.
