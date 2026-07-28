---
name: review
description: Defines how the truth of every citation is established: what the build proves and what it cannot, how to read a citation against both the artifact making it and the target it names, why the referenced side is under review too, and the rounds this runs in. Use after the lint stage is green and again whenever any artifact or any reference changes.
---

# Review

## Green Is Where This Skill Starts

The lint stage proves that a citation **exists** and **resolves**. It proves nothing about whether the citation is true.

Picture the tag written to clear a diagnostic. It names a real requirement section, it sits on a declaration the claim selects, it is spelled correctly, and the build goes quiet. Now picture the tag written after actually doing the work. **They are the same tag.** Nothing in the file, the diagnostic, or the build output separates them, and no later pass will either, because the report that would have found the gap now reads clean.

That is why this skill exists. The graph hands you a complete inventory of claims and a verdict on none of them. Producing the verdict is yours, and it is not work you do if time permits: an unreviewed green build is a repository whose every claim is unexamined and whose report says the opposite.

The [campaign skill](../campaign/SKILL.md) establishes that nothing is **missing**. This skill establishes that what is there is **true**. Neither substitutes for the other, and the work is finished only when both hold.

## The Unit Of Review Is A Triple

Every review step reads three things, in this order, from the artifacts rather than from memory.

1. **The reason.** What the tag claims this artifact does about this target.
2. **The citing artifact.** What the code actually does.
3. **The referenced target.** What the requirement section says, what the model stores, what the operation contract promises.

A step is complete only when you have read all three. Reading the first two is the natural shortcut, it feels sufficient, and it catches roughly half the defects, because it silently assumes the third is correct.

## Either Side Can Be The Defect

This is the part that decides whether the skill is worth running.

When a reason does not hold, **the citing artifact is not automatically what is wrong.** The reference is under review too, and it fails in ways only a reader arriving from the citation is placed to notice.

**The citing side is wrong** when the code does less than the reason says, does it in one path and not its sibling, or does something adjacent that reads similar. A provider whose reason says it refuses stacked coupons and which refuses only the same coupon twice is this.

**The referenced side is wrong** when the target does not mean what its citations assume. A column nullable where three DTOs treat it as always present. A contract omitting an effect four tests assert. A model storing a state under a name meaning the opposite of what the requirement calls it.

Here is that second case, and it is the one a two-sided review never finds.

```prisma
/// Closing time of sale.
///
/// If `null`, the sale is forever.
closed_at DateTime?
```

```ts
/**
 * Whether this sale has ended.
 *
 * @evidence prisma:shopping_sales.closed_at Ended once the closing time has
 * passed.
 */
closed: boolean;
```

The reason is accurate about the column and the transformer agrees with it. Two sides, consistent, and a review that stops there passes.

Reading the third side finds that the requirement calls a **suspended** sale ended too, and `closed_at` is null on every suspended row. The citing side is faithful; the schema is missing a state the requirement describes. Repairing the DTO here, by widening the reason or retargeting the tag, would encode the gap permanently and leave nothing able to find it.

**Both are wrong together** when a misreading propagated. The first artifact cited a section, the next copied its interpretation rather than the section, and by the fifth nobody has opened the document. This is precisely why the third read is not optional.

`docs/analysis/` is the one reference you never edit. It is given input. When an artifact and a section disagree, the section is right, and the finding is against the artifact or against your reading of it.

Every other reference is yours. The Prisma models, the operation contracts, the DTOs: a finding there is a finding, and repairing it there is the correct outcome.

## What A Reason Owes

A reason survives a reader comparing it to the code. That is the entire standard, and three failures account for most of what does not survive.

```ts
/**
 * @evidence docs/analysis/04-business-rules.md#coupon-stacking Implements this
 * requirement.
 */
```

**Restating the tag.** True of every citation ever written, so it distinguishes nothing. Its siblings are "stores this data" and "tests this operation".

```ts
/**
 * @evidence docs/analysis/04-business-rules.md#coupon-stacking The coupon
 * stacking rule.
 */
```

**Naming the target again.** The tag already names it. A reason says which **part** of it this artifact answers for, which is the one thing the tag cannot express.

```ts
/**
 * @evidence docs/analysis/04-business-rules.md#coupon-stacking Rejects a second
 * coupon of a kind the order already carries, at checkout.
 */
```

That can be contradicted by reading the provider, which is what makes it worth writing. It also exposes its own limit: the section states four rules and this names one, so a reviewer immediately asks where the other three live.

**Claiming the whole of a target the artifact partly covers** is the third failure and the most expensive, because it converts a missing implementation into a satisfied obligation. The vaguer reasons above do exactly that: the section reads as discharged, and three rules go unbuilt with nothing left to report them.

## Decide The Reason First, Then Find The Target

The tag writes the target first. **Do not think in that order.**

Say what this artifact is responsible for, in a sentence, before opening the documents to look for something to cite. Then find the target that says it. A reason arrived at this way is a description of the work; a reason arrived at from a target is a justification for a citation you had already decided to write.

The difference shows up under review as the third failure above. Someone who picked a plausible section and then wrote a sentence about it produces "the coupon stacking rule", because that is genuinely all they know: the sentence was reverse-engineered from the tag. Someone who knew the provider rejects a duplicate issuer at checkout writes that, and then either finds the section stating it or discovers there is none, which is itself the finding.

**A target that merely resolves is not a target that fits.** Retargeting until the build goes quiet is the same move as weakening an assertion until a test passes.

## A Citation Is Responsibility, Not Proof

Every citation says the same thing: this artifact answers for this part of this target. It never says the target holds.

That distinction decides which citation is worth trusting for which kind of requirement. A shape requirement is settled by reading the model or the DTO, and a citation there is close to proof. **A behavioral rule is settled by nothing except a test that fails when the behavior is removed.** A model, a contract, and a provider may each cite the coupon-stacking section truthfully and none of them demonstrates that stacking is refused.

So when reviewing a behavioral section, find the test citing it and read what it asserts. If no test cites it, the section is traced through three layers and proven by none, and every one of those citations is honest.

## An Exclusion Is A Claim Too

`@evidenceExclude` records a reviewed decision that this claim genuinely does not use a target. It carries the same burden as a citation and gets the same triple read.

The failure to look for is an exclusion recording work that was never done rather than a decision that was made. "Not exposed" on a column a requirement says a user must see is a diagnostic silenced, not a decision taken.

Re-read every exclusion each round. One that was correct when written stops being correct the moment the requirement behind it changes, and unlike a citation, **nothing about it will ever dangle**.

## Repairing A Reference Re-Opens Every Citation Of It

This is the cascade, and it is why the work runs in rounds rather than once.

A citation is a claim about a target. Change what the target means and every claim about it is unverified again, including the ones you passed an hour ago. Rename a column, change a nullability, add an effect to a contract, split a model in two: each invalidates every reason written against the old meaning, and **not one of them will dangle**, because the address still resolves.

So when a round repairs a reference, re-review every citation pointing at it, in full. A verdict issued against the previous meaning is void.

The ordinary direction cascades the same way. A changed provider re-opens the reasons on its tests; a changed contract re-opens the reasons on its screens.

## The Rounds

1. **Enumerate the claims.** Walk the configured graph and list every citation and every exclusion in the repository, from the tags themselves rather than from your notes about them.
2. **Review each as a triple**, reading all three sides.
3. **Record every finding before repairing anything**, so a repair cannot quietly erase the record of what was wrong.
4. **Repair at the side that is actually wrong**, which is sometimes the reference.
5. **If the round produced even one finding, start over from the beginning.** Every claim, not the ones near the finding: a repair to a reference has invalidated verdicts you cannot enumerate without re-reading them.
6. **Stop only after two consecutive complete rounds produce nothing.** One clean round means the round was tired.

Vary the traversal between rounds. Walk claim-to-reference in one and reference-to-claim in the next, asking of each target what every artifact citing it believes about it. The second direction is what finds one reference meaning three things to three readers, and the first direction cannot find it at all.

## Prove One Directly, Once Per Round

Reading establishes that a reason is plausible. Removing the behavior establishes that something depended on it.

Take one citation that matters, delete the behavior it claims, and confirm the build or the suite fails. Then restore it. If nothing failed, the claim was decorative, and every reason written in the same style is now suspect.

The build will never ask you to do this.

## What This Skill Cannot Do Either

It cannot tell you that an artifact nobody thought to write is missing. That is the campaign's job, and the two are complements: the campaign establishes the inventory, this skill establishes its truth.

Type-correct is not correct, and cited is not correct. A default that means the opposite of unset, an aggregate over the wrong side of a relation, an effect implemented in one path and not its sibling: each carries a valid citation, satisfies every check, and is found only by someone reading the code against the claim.
