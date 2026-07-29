# Providers

Providers carry neither `@evidence` nor `@evidenceExclude`. No configured claim selects `src/providers/**`, so a provider is not a declaration host and a tag there cannot satisfy `schema-models`, `api-operations`, `dto-types`, `dto-properties`, or `backend-tests`.

Maintain the manual residual mappings from operation effects, requirement rules, and schema invariants into every provider path, then walk each branch and database access back to an owner. When a whole configured claim intentionally omits a target implemented by a provider, put the exclusion on a selected host of that claim and name the provider as the actual owner; never move the tag into the provider.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After An Implementation Change

Invalidate the affected operation-integrity and behavioral-test verdicts even though no graph edge changed. If the provider exposes a wrong schema or contract decision, repair that owner and accept the full downstream invalidation rather than adding a local workaround.
