# Providers

The implementation answers to three upstream sources: the requirements, the schema, and the contract.

A provider can satisfy its contract's types while enforcing none of the requirement's rules. It can enforce every rule while reading a column the schema does not have. It can implement the effect its contract states and miss the cross-cutting rule that applies to eleven other operations as well.

**Nothing checks any of that for you.** The build proves the shapes line up.

Read [the campaign skill](../campaign/SKILL.md) and [its logic edge](../campaign/logic.md) before starting. The traversal that matters most there is by cross-cutting rule rather than by operation: a rule stated once in a document and applying in many places is the thing that gets implemented once and missed three times.

{{base}}

## After Any Implementation Change

The test campaign re-opens, because what the tests must prove has moved.

When a fix here reveals that the contract or the schema was wrong, fix it there and accept that everything below that layer re-opens with it. Patching the provider to compensate for a wrong contract hides the defect from every layer after it, and the cost of the correction grows with each layer built on top.

## Record The Defects Catalogue When You Check It

The catalogue in "The Defects That Survive Every Checker" is invisible to every automatic check and to a reader skimming for correctness, so checking it leaves no trace unless you write one. An entry saying you walked it is the difference between a gap that was examined and one nobody looked at.

This is also the layer where a ledger entry is easiest to write and hardest to keep true, because a provider realizes a behavior rather than a shape, and behavior drifts without changing anything a checker inspects. The [review skill](../review/SKILL.md) reads each of these entries against the code that is there now.
