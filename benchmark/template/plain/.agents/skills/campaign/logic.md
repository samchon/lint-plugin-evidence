# Logic Campaign

Read [SKILL.md](SKILL.md) first. This campaign discharges three edges, because the implementation answers to all of them: `docs/analysis/ -> business logic`, `database -> business logic`, and `API -> business logic`.

Three upstream sources means three denominators. A provider can satisfy its contract's types while enforcing none of the requirement's rules, and it can enforce every rule while reading a column the schema does not have.

## Contract To Implementation

An operation still carrying its `@todo` tag is unrealized regardless of what compiles, and the tags are greppable under `packages/backend/src/controllers/` and `packages/api/src/structures/`, so this walk starts with a countable denominator: the number of remaining `@todo` tags across both, and realize's exit is zero.

For every operation, name the provider under `packages/backend/src/providers/` that implements it, then check the implementation against the contract's own words rather than its signature.

- Every effect the contract states is performed. A contract that says the operation also creates a membership, writes a history row, sets a default state, or sends a notification is not satisfied by an implementation that returns the right shape.
- Every rejection the contract states is thrown, with the meaning the requirement gives it.
- Every response property is filled from a real source. A property the contract declares and the implementation leaves at a default is a silent lie in every response.

Then walk backward. Every branch in the implementation traces to something: a requirement, a contract clause, or a schema constraint. A branch that traces to nothing is a rule someone invented, and it will outlive the person who remembers why.

## Requirements To Implementation

The contract is a summary. The requirement is the thing.

Walk every requirement in the inventory and find where it is enforced. Many requirements do not correspond to an operation at all: a constraint that must hold across several operations, a calculation whose formula appears once, a visibility rule that applies to every read of an entity.

Those are the ones that get implemented in one place and missed in three. Walk the rule, not the endpoint: for every cross-cutting rule, enumerate every operation it applies to and check each one.

## Schema To Implementation

For every column the implementation writes, confirm it writes the value the requirement names, in the unit and at the time the requirement names.

For every column the implementation reads, confirm the read is selected by the query rather than assumed present.

Then the harder direction: for every invariant the schema implies, find the code that maintains it. A materialized value must be written in the same transaction as its source. A soft-delete marker must be filtered by every read of that table, and "every" means you enumerate them. A retained copy must be captured at the moment the requirement says it is honored, not later.

## Semantics, Not Types

Everything above walks structure: which operation, which rule, which column. This walk asks whether the code means what the requirement means, and it is where most surviving defects are, because a type-correct value can invert the behavior.

A default that means the opposite of unset is the shortest example, and [the provider topic](../backend/providers.md) catalogues the rest with the four questions to ask of each. Walk that list against every provider in the round rather than only where something looks suspicious, because the whole point is that none of them look suspicious.

## Rounds

A round is a complete pass over every operation, every cross-cutting rule, and every schema invariant.

Any finding resets the count. Dry after **two consecutive complete rounds** with nothing new.

Vary the traversal. Walk by operation in one round; by cross-cutting rule in the next, checking every place it applies; by table in a third, checking every read and write of it. The by-table traversal is what finds the one query that forgot the visibility filter.

## The Cascade

**Into here:** findings from the requirements, database, and API campaigns all re-open this one in full.

**Out of here:** an implementation change re-opens the test campaign, because what the tests must prove has changed. When a fix here reveals that the contract or the schema was wrong, fix it there and accept that you have re-opened everything below that layer. Patching the provider to compensate for a wrong contract hides the defect from every layer after it, and the cost of the correction grows with each layer that builds on it.

## Exit

Dry when two consecutive complete rounds find nothing new, every contract effect and rejection is implemented, every requirement is enforced everywhere it applies, every schema invariant has code that maintains it, and every branch traces to something that asked for it.

The build passing proves the shapes line up. It proves nothing here.
