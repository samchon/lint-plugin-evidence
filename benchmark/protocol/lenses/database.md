# Database lens

Walk every requirement that stores, derives, constrains, orders, deletes, restores, or aggregates data into the authored schema, migrations, and persistence code. Then walk every authored model, column, relation, index, constraint, lifecycle field, and transaction back to an owning requirement or a defensible architectural necessity.

Check nullability, uniqueness, cascade behavior, identity, ownership, tenant isolation, timestamps, ordering, counters, denormalized values, cleanup, transaction boundaries, concurrent updates, and rollback behavior. A DTO or validation check does not replace a required storage invariant.

Report only concrete omissions, partial implementations, contradictions, semantic defects, or test-oracle gaps with exact criterion and artifact citations.
