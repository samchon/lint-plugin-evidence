# API Campaign

Read [SKILL.md](SKILL.md) first. This campaign discharges the contract's edges: `docs/analysis/ -> API` and `database -> API` for the operations under `packages/backend/src/controllers/`, `docs/analysis/ -> DTO type` and `database -> DTO type` for the shapes under `packages/api/src/structures/`, and `column -> DTO property` beneath them.

Two upstream sources means two denominators and two backward walks. Do not collapse them: a contract can cover every requirement while leaving half the schema unreachable, and it can expose every table while satisfying no requirement.

## Requirements To Contract

For every requirement in the inventory, name the operation that lets a user reach the behavior.

- A requirement that describes something a user does needs an operation, and the operation's contract must state the effect, the transitions, and the rejections the requirement names.
- A requirement that describes something a user must be prevented from doing needs a rejection stated in the contract of the operation where the attempt happens.
- A requirement that describes something the system does automatically usually needs no operation for the doing and often needs one for the reading. Check whether the documents say anyone must be able to see it.

Then walk backward. For every operation, name the requirement. An operation with no requirement is either a requirement you have not read or an endpoint you invented, and an invented endpoint acquires invented semantics that logic and tests then honor.

## Schema To Contract

For every table and every column, name the operation that reads or writes it, or record why none does.

A column nothing exposes is a requirement half-built: the storage exists and no user can reach it. That is a legitimate finding even when the schema is correct, because it means either the operation is missing or the column is.

"Nothing exposes it, deliberately" is a valid answer for internal bookkeeping. Record it with its reason. An unrecorded absence is indistinguishable from an oversight on the next round, and you will re-derive it every time.

## Shapes To Sources

The DTO tree under `packages/api/src/structures/` is its own denominator, at two granularities, and [the DTO topic](../backend/dtos.md) owns how a mapping is recorded.

**Type level, both directions.** For every requirement concept a caller must receive, name the DTO type that carries it; for every root type in the `structures` export list, name the requirement that asked for it and the table it represents. A type with neither is an invented shape whose invented semantics the logic and the tests will honor.

**Property level, both directions.** Every property names the column under `packages/backend/prisma/schema/` it carries, or the derivation it is computed from; a property with neither is a phantom that compiles until the logic campaign finds nothing to fill it with. Then walk the schema forward, column by column from the schema itself rather than from memory: every column a requirement says a caller must see appears in some read variant. The forward direction is the one that finds the field the schema stores and the API never exposes.

## What Counts As Covered

The operation existing is not coverage. Check the contract itself:

- **The response can complete the screen.** If the requirement describes a listing that shows something, the response carries it. A response that forces a second call per row is a finding against this edge, not a performance note.
- **The authorization rule is stated.** Which actor, which grade, which ownership. A caller cannot infer it, and it is usually the requirement the operation exists to satisfy.
- **The cardinality matches the requirement.** "All", "every", "the list of" mean many; a single-item response for a many-item requirement is a defect that surfaces at the call site, not a style choice.
- **Every state the requirements let a user change is reachable through some operation.** A mutable state with no operation that changes it is unreachable, and excluding it from the update contract because a dedicated operation might be added later leaves it unreachable forever.
- **Every refusal has a contract.** A requirement that says something is not permitted needs the operation to say it refuses, or nothing downstream knows to implement it.

## Rounds

A round is a complete pass over every walk above: operations against requirements and schema in both directions, DTO types against requirements and models in both directions, and properties against columns in both directions.

Any finding resets the count. Dry after **two consecutive complete rounds** with nothing new.

Vary the traversal. Walk by requirement in one round; by route tree in the next; by actor in a third, checking that each actor can complete every journey the documents give them. The actor traversal is what finds the operation that exists for one role and was never given to another that needs it.

## The Cascade

**Into here:** a requirements finding re-opens this campaign in full. A schema finding re-opens it in full. Both, because both are upstream.

**Out of here:** any contract change re-opens the test campaign and the logic campaign. Adding an operation adds tests and logic. Changing a response shape changes both. Changing an authorization rule changes what the tests must prove and what the provider must guard.

A contract change also re-opens the frontend campaign, because a screen consumes operations and a changed contract can leave a screen reading a field that no longer exists.

## Exit

Dry when two consecutive complete rounds over all four walks find nothing new, every requirement names its operation, every operation names its requirement, every column names its exposure or its recorded reason for having none, every root type names its requirement and its table, and every DTO property names its source while every caller-visible column reaches a read variant.

The SDK regenerating cleanly proves none of this. It proves the contract is well formed, not that it is the right contract.
