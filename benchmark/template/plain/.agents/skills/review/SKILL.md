---
name: review
description: Defines how the truth of every claimed realization is established: why a complete ledger is not a correct one, how to read a claim against both the artifact making it and the source it names, why the source is under review too, and the rounds this runs in. Use after a campaign reports dry and again whenever any artifact or any source changes.
---

# Review

## Dry Is Where This Skill Starts

The [campaign skill](../campaign/SKILL.md) establishes that nothing is **missing**. Every requirement has an artifact, every table has an endpoint, every operation has a test, and the ledger says so.

None of that says any of it is **true**.

Picture the ledger line written after reading the section and building what it asks for. Now picture the line written because a similar-sounding endpoint already existed and the requirement looked covered. **They are the same line.** Both name a requirement and an artifact, both close a row, and nothing in the ledger distinguishes them. A second campaign pass will not separate them either, because that pass asks whether the row is filled, and it is.

So a dry campaign and a repository that satisfies its requirements are different states, and only one of them is established by the work so far. Producing the other is this skill.

## The Unit Of Review Is A Triple

Every review step reads three things, in this order, from the artifacts rather than from the ledger.

1. **The claim.** What the ledger says this artifact does about this requirement, table, or operation.
2. **The claiming artifact.** What the code actually does.
3. **The source it names.** What the requirement section says, what the model stores, what the contract promises.

A step is complete only when you have read all three. Reading the ledger and the artifact is the natural shortcut, it feels sufficient, and it catches roughly half the defects, because it silently assumes the third is correct.

The ledger is the index of what to review, never the evidence that the review passed. It records what you believed when you wrote it, which is the thing under test.

## Either Side Can Be The Defect

This is the part that decides whether the skill is worth running.

When a claim does not hold, **the artifact is not automatically what is wrong.** The source is under review too, and it fails in ways only a reader arriving from the claim is placed to notice.

**The claiming side is wrong** when the code does less than the claim says, does it in one path and not its sibling, or does something adjacent that reads similar. A provider recorded as enforcing the coupon-stacking rule, which refuses only the same coupon twice, is this.

**The source side is wrong** when it does not mean what the artifacts built on it assume. A column nullable where three DTOs treat it as always present. A contract omitting an effect four tests assert. A model storing a state under a name meaning the opposite of what the requirement calls it.

Here is that second case, and it is the one a two-sided review never finds.

```prisma
/// Closing time of sale.
///
/// If `null`, the sale is forever.
closed_at DateTime?
```

```ts
/** Whether this sale has ended. */
closed: boolean;
```

The ledger says the sale-lifecycle requirement is realized, the transformer derives `closed` from `closed_at`, and the two agree. A review that stops there passes.

Reading the third side finds that the requirement calls a **suspended** sale ended too, and `closed_at` is null on every suspended row. The DTO and the transformer are faithful to the schema; the schema is missing a state the requirement describes. Repairing the DTO here would encode the gap permanently.

**Both are wrong together** when a misreading propagated. The schema was built from a reading of the section, the contract from the schema, the tests from the contract, and by then nobody has reopened the document. This is precisely why the third read is not optional, and why it goes back to the source rather than to whatever intermediate artifact is nearest.

`docs/analysis/` is the one source you never edit. It is given input. When an artifact and a section disagree, the section is right, and the finding is against the artifact or against your reading of it.

Every other source is yours. The Prisma models, the operation contracts, the DTOs: a finding there is a finding, and repairing it there is the correct outcome.

## What A Ledger Entry Owes

An entry survives a reader comparing it to the code. That is the entire standard, and three failures account for most of what does not survive.

```
REQ-4.2 coupon stacking -> ShoppingOrderProvider   implemented
```

**Recording only that something happened.** True of every entry ever written, so it distinguishes nothing.

```
REQ-4.2 coupon stacking -> ShoppingOrderProvider.create   the coupon rule
```

**Naming the requirement again.** The row already names it. An entry says which **part** of it this artifact answers for.

```
REQ-4.2 coupon stacking -> ShoppingOrderProvider.create
  rejects a second coupon of a kind the order already carries, at checkout
  the other three rules in this section are not here: see REQ-4.2 rows below
```

That can be contradicted by reading the provider, which is what makes it worth writing. It also exposes its own limit, and that limit is the point: the section states four rules and this names one.

**Claiming the whole of a source the artifact partly covers** is the third failure and the most expensive, because it converts a missing implementation into a satisfied row. The vaguer entries above do exactly that: the section reads as realized, and three rules go unbuilt with nothing left to report them.

## A Recorded Non-Exposure Is A Claim Too

A ledger line saying a table is deliberately internal, or a requirement genuinely needs no storage, is a decision that carries the same burden as a realization and gets the same triple read.

The failure to look for is a line recording work that was never done rather than a decision that was made. "Not exposed" on a column a requirement says a user must see is a row closed, not a decision taken.

Re-read every such line each round. One that was correct when written stops being correct the moment the requirement behind it changes, and **nothing will ever flag it**, because a closed row produces no diagnostic in any campaign.

## Repairing A Source Re-Opens Every Claim On It

This is the cascade, and it is why the work runs in rounds rather than once.

A claim is an assertion about a source. Change what the source means and every claim on it is unverified again, including the ones you passed an hour ago. Rename a column, change a nullability, add an effect to a contract, split a model in two: each invalidates every entry written against the old meaning, and **no campaign will notice**, because the artifacts still exist and the rows are still filled.

So when a round repairs a source, re-review every claim naming it, in full. A verdict issued against the previous meaning is void.

The ordinary direction cascades the same way. A changed provider re-opens the claims on its tests; a changed contract re-opens the claims on its screens.

## The Rounds

1. **Enumerate the claims.** Every ledger entry and every recorded non-exposure in the repository.
2. **Review each as a triple**, reading all three sides from the artifacts.
3. **Record every finding before repairing anything**, so a repair cannot quietly erase the record of what was wrong.
4. **Repair at the side that is actually wrong**, which is sometimes the source.
5. **If the round produced even one finding, start over from the beginning.** Every claim, not the ones near the finding: a repair to a source has invalidated verdicts you cannot enumerate without re-reading them.
6. **Stop only after two consecutive complete rounds produce nothing.** One clean round means the round was tired.

Vary the traversal between rounds. Walk claim-to-source in one and source-to-claim in the next, asking of each requirement section and each table what every artifact built on it believes about it. The second direction is what finds one source meaning three things to three readers, and the first direction cannot find it at all.

## Prove One Directly, Once Per Round

Reading establishes that a claim is plausible. Removing the behavior establishes that something depended on it.

Take one claim that matters, delete the behavior it names, and confirm the build or the suite fails. Then restore it. If nothing failed, the claim was decorative, and every entry written in the same style is now suspect.

Nothing in this repository will ask you to do this.

## What This Skill Cannot Do Either

It cannot tell you that an artifact nobody thought to write is missing. That is the campaign's job, and the two are complements: the campaign establishes the inventory, this skill establishes its truth.

Type-correct is not correct, and recorded is not correct. A default that means the opposite of unset, an aggregate over the wrong side of a relation, an effect implemented in one path and not its sibling: each fills its ledger row, passes every build, and is found only by someone reading the code against the claim.
