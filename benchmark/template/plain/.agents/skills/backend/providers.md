# Providers

The implementation answers to three upstream sources: the requirements, the schema, and the contract.

A provider can satisfy its contract's types while enforcing none of the requirement's rules. It can enforce every rule while reading a column the schema does not have. It can implement the effect its contract states and miss the cross-cutting rule that applies to eleven other operations as well.

**Nothing checks any of that for you.** The build proves the shapes line up.

Read [the campaign skill](../campaign/SKILL.md) and [its logic edge](../campaign/logic.md) before starting. The traversal that matters most there is by cross-cutting rule rather than by operation: a rule stated once in a document and applying in many places is the thing that gets implemented once and missed three times.

{{base}}

## After Any Implementation Change

The test campaign re-opens, because what the tests must prove has moved.

When a fix here reveals that the contract or the schema was wrong, fix it there and accept that everything below that layer re-opens with it. Patching the provider to compensate for a wrong contract hides the defect from every layer after it, and the cost of the correction grows with each layer built on top.

## The Defects No Pass Finds By Reading Types

Record these in the ledger when you check them, because they are invisible to every automatic check and to a reader skimming for correctness.

- A default that means the opposite of unset.
- An aggregate over the wrong side of a relation, returning a plausible number.
- An effect implemented in create and not in update.
- A visibility filter present on ten reads of a table and absent on the eleventh.

After every substantial piece of work, ask what null means for each field here, which direction each relation aggregates, and what the code does in the case the requirement calls out.
