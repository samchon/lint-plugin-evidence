# Providers

Providers carry no evidence tags. No configured claim selects them, so graph green says nothing about whether a contract promise, behavioral requirement, or schema invariant is implemented here.

Read [the logic completeness check](../completeness/logic.md) before provider work. Maintain the manual residual mappings from operation effects, requirement rules, and schema invariants into every provider path, then walk each branch and database access back to an owner.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After An Implementation Change

Invalidate the affected operation-integrity and behavioral-test verdicts even though no graph edge changed. If the provider exposes a wrong schema or contract decision, repair that owner and accept the full downstream invalidation rather than adding a local workaround.
