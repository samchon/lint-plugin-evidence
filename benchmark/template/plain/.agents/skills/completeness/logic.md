# Logic Check

Read [SKILL.md](SKILL.md) first. This manual residual check covers the provider edges no evidence rule measures in either arm.

## Three Owners

For every controller operation, map its effects, rejections, authorization assumptions, and return semantics to the provider path that realizes them. For every behavioral requirement, enumerate every provider path where the rule applies. For every schema invariant, enumerate every read and write that must preserve it.

Then walk every provider branch, query, mutation, default, and exception back to an operation, requirement, or schema invariant. Code without an owner is speculative behavior even when it compiles.

## Read For Semantic Failures

Check absent versus empty values, null versus undefined, inclusive bounds, time boundaries, state transitions, visibility filters, ownership, transaction boundaries, duplicate handling, deletion, concurrency-sensitive updates, ordering, pagination, and error translation. These defects usually preserve types.

Providers own business implementation; controllers own the public operation and DTOs own public shapes. Do not patch a wrong contract or schema inside a provider.

## Consequences

A provider change invalidates its behavioral tests. If review reveals the schema or public contract is wrong, repair that owner and re-open every downstream mapping rather than retaining a local workaround.
