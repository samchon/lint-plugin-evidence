# Providers

A provider answers to public operation effects, behavioral requirements, and schema invariants. Type compatibility proves none of those semantic relationships.

Map every operation effect, behavioral rule, and schema invariant into all applicable provider paths, then reverse-walk every branch, query, mutation, default, and exception to an owner.

Read for semantic failures that preserve types: absent versus empty, null versus undefined, inclusive bounds, time boundaries, forbidden state transitions, visibility and ownership, duplicate handling, transaction scope, ordering, pagination, deletion, and recovery. A provider must implement every applicable branch of a rule, not only its successful path.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After An Implementation Change

Invalidate the affected behavioral tests. If review reveals a wrong schema or public contract, repair that owner and re-open all downstream mappings rather than keeping a provider workaround.

After the last implementation change, repeat the semantic-defect review against the current source rather than carrying forward an earlier verdict.
