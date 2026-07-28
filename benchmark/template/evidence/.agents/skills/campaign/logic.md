# Logic Obligation

Read [SKILL.md](SKILL.md) first. This document covers the edges into the implementation.

## What The Build Checks

Every configured requirement section, every selected model, and every operation must be acknowledged by the provider that implements it. Three denominators, checked independently.

## One Citation Closes The Obligation, Not The Work

This is the layer where the gate is least aligned with what remains to be done.

A cross-cutting rule is discharged by the first provider that cites it. The build goes quiet, and the ten other places where the rule applies still need the same enforcement. Nothing reports their absence, because the obligation was already satisfied.

So the build removes the "nobody implemented this rule at all" failure completely, and leaves the "implemented it in one place out of eleven" failure untouched. Walk the rule to every operation it applies to, yourself.

## What A Citation Claims Here

At this layer a citation asserts behavior, not presence. A tag saying a provider enforces a rule claims the code enforces it, and the build cannot check that.

Write the reason as the specific part of the rule this function performs, phrased so it would be visibly false if the function did not perform it. "Implements this section" is a restatement; "rejects the second coupon of the same kind before any discount is applied" is a claim a reviewer can check in one read.

Cite the function that does the work. A tag on a wrapper that delegates records the wrong location, and it survives review because the citation resolves.

## Where The Repair Usually Is

A provider that cannot cite a rule is often a provider whose schema has no state for it. Check the schema before writing the tag.

A provider that cannot cite an operation means the contract does not state the behavior the requirement needs. That is an API finding.

## What The Build Cannot See

Every one of these can carry a valid, resolving citation and pass:

- a default that means the opposite of unset;
- an aggregate over the wrong side of a relation;
- an effect implemented in create and not in update;
- a visibility filter present on ten reads and absent on the eleventh.

Type-correct is not correct, and cited is not correct either. After any substantial piece of work, ask what null means for each field, which direction each relation aggregates, and what the code does in the case the requirement calls out.
