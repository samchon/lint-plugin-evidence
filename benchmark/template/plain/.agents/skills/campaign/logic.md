# Logic Campaign Dimension

Read [SKILL.md](SKILL.md) first. This mandatory dimension of the indivisible campaign round discharges `docs/analysis/ -> business logic`, `database -> business logic`, and `API -> business logic`.

Three upstream sources mean three denominators. A provider can satisfy contract types while enforcing none of the required rules, or enforce every rule while reading a value the schema does not have.

## Contract To Implementation

For every operation, name the provider under `packages/backend/src/providers/` that implements it, then inspect the implementation against the contract's words rather than only its signature.

- Every stated effect is performed, including associated membership, history, lifecycle, notification, and default-state changes.
- Every stated refusal is implemented with the meaning the requirement gives it.
- Every response property is filled from a real source rather than a placeholder or arbitrary default.

Unimplemented stubs, placeholder branches, and operations without providers are findings regardless of whether the repository compiles.

Then walk backward. Every implementation branch traces to a requirement, contract clause, or schema constraint. A branch tracing to none is an invented rule.

## Requirements To Implementation

The contract is a summary. The requirement is the source.

Walk every requirement in the inventory and find where it is enforced. Many requirements span operations: calculations, visibility rules, shared constraints, retention behavior, and state-transition rules.

For every cross-cutting rule, enumerate every operation it applies to and inspect each one. Implementing the rule in one place does not satisfy its other application points.

## Schema To Implementation

For every value the implementation writes, confirm it writes the value, unit, and time the requirement names. For every value it reads, confirm the query selects it.

For every invariant the schema implies, find the logic that maintains it. A materialized value is written in the same transaction as its source. A soft-delete marker is filtered by every applicable read. A retained copy is captured at the required event rather than reconstructed later.

## Semantics, Not Types

Structural correctness does not establish behavioral meaning. A default can invert the meaning of unset; a predicate can reverse authorization; a filter can omit a lifecycle state; a calculation can use the right type and wrong unit.

[The provider topic](../backend/providers.md) owns the semantic questions to ask of each provider. Apply them to every provider during the round, not only suspicious code.

## Findings

Requirements, database, and API findings re-open this dimension in full. An implementation correction re-opens the test relationship. If a finding shows that the contract or schema is wrong, correct that owning layer and propagate the invalidation through every downstream relationship.

Do not patch a provider to compensate for a wrong contract or schema; that hides the owning defect from later layers.

Within the indivisible round owned by [SKILL.md](SKILL.md), this dimension is exhausted when every contract effect and refusal is implemented, every requirement is enforced everywhere it applies, every schema invariant has logic that maintains it, every response property has a real source, and every branch traces to something that requires it. A successful build proves none of these relationships.
