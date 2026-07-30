# API Campaign Dimension

Read [SKILL.md](SKILL.md) first. This mandatory dimension of the indivisible campaign round discharges `docs/analysis/ -> API` and `database -> API` for operations under `packages/backend/src/controllers/`, `docs/analysis/ -> DTO type` and `database -> DTO type` for shapes under `packages/api/src/structures/`, and `column -> DTO property` beneath them.

Two upstream sources mean two denominators and two backward walks. Do not collapse them: a contract can cover every requirement while leaving half the schema unreachable, and it can expose every table while satisfying no requirement.

## Requirements To Contract

For every requirement in the inventory, name the operation that lets a user reach the behavior.

- A requirement that describes something a user does needs an operation whose contract states the effect, transitions, and rejections.
- A requirement that prevents an action needs the refusal stated in the contract where the attempt occurs.
- A requirement that describes an automatic action often needs no operation for performing it, but may need one for observing it. Check whether anyone must be able to see it.

Then walk backward. For every operation, name the requirement. An operation with no requirement is either a missed requirement or an invented endpoint, and an invented endpoint acquires invented semantics that logic and tests then honor.

## Schema To Contract

For every table and column, name the operation that reads or writes it, or record why none does.

A value nothing exposes may mean the operation is missing or the value is unnecessary. Internal bookkeeping may deliberately have no public exposure, but record that decision and its reason so it is distinguishable from an oversight.

## Shapes To Sources

The DTO tree under `packages/api/src/structures/` is its own denominator at two granularities, and [the DTO topic](../backend/dtos.md) owns how a mapping is recorded.

**Type level, both directions.** For every requirement concept a caller must receive, name the DTO type that carries it. For every root type in the `structures` export list, name the requirement that asked for it and the table it represents. A type with neither is an invented shape.

**Property level, both directions.** Every property names the column it carries or the derivation that computes it. Then walk the schema forward, column by column: every column a requirement says a caller must see appears in a read variant. The forward direction finds stored values the API never exposes.

## What Counts As Covered

An operation's existence is not coverage. Check its contract:

- **The response can complete the screen.** If a listing must show a value, the response carries it without an avoidable call per row.
- **The authorization rule is stated.** Actor, grade, ownership, and other boundaries are explicit.
- **The cardinality matches the requirement.** A many-item requirement is not satisfied by a single-item response.
- **Every mutable state is reachable.** Every state users may change has an operation that changes it.
- **Every refusal has a contract.** A prohibited attempt has an explicit refusal downstream code can implement.

## Place In The Round

Within every campaign round, traverse every operation against requirements and schema in both directions, every DTO type against requirements and tables in both directions, and every property against columns in both directions.

This dimension is not a separate round or separately mergeable verdict. A finding anywhere invalidates the whole campaign round: correct it, propagate its consequences, and restart the complete traversal at the first requirement. Completion requires one entire current-state round covering this dimension and every sibling dimension with zero actionable improvements.

## Cascade

Requirements and schema findings re-open this dimension in full. Any contract change re-opens the logic, test, and frontend relationships because each consumes that contract.

Adding an operation adds logic and tests. Changing a response shape changes logic, tests, and frontend callers. Changing authorization changes both the guard and the tests that prove it.

## Dimension Exit

This dimension is exhausted within the full round when every requirement names its operation, every operation names its requirement, every column names its exposure or recorded reason for none, every root type names its requirement and table, and every DTO property names its source while every caller-visible column reaches a read variant.

SDK generation proves that the contract is well formed, not that it is the right contract.
