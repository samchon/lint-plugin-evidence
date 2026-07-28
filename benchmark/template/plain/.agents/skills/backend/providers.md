# Providers

A provider answers to public operation effects, behavioral requirements, and schema invariants. Type compatibility proves none of those semantic relationships.

Read [the logic completeness check](../completeness/logic.md) before implementation. Map every operation/rule/invariant into all applicable provider paths, then walk every branch and database access back to an owner.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After An Implementation Change

Invalidate the affected behavioral tests. If review reveals a wrong schema or public contract, repair that owner and re-open all downstream mappings rather than keeping a provider workaround.

Record the semantic-defect catalogue review at the current digest; a memory-only pass cannot support completion.
