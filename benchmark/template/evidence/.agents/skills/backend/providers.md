# Providers

Providers carry neither `@evidence` nor `@evidenceExclude`. No configured claim selects `src/providers/**`, so a provider is not a declaration host and a tag there cannot satisfy `schema-models`, `api-operations`, `dto-types`, `dto-properties`, or `backend-tests`.

The common Review skill owns complete provider correctness and applies the same full-population workload in both arms. The graph adds no provider claim. When an exclusion names a provider as the actual owner, keep the tag on an eligible exclusion carrier in a matching claim file; never move the tag into the provider.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After An Implementation Change

Rerun the affected behavioral tests after a provider change. If the change proves that an operation tag, exclusion, schema decision, or DTO contract is false, repair that owning artifact and revalidate its affected claim; do not add evidence tags to the provider.
