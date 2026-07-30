---
name: review
description: Defines the questions a completeness pass does not ask: whether each claimed realization is true, whether each authored upstream artifact agrees with the immutable requirement, and which claims prove anything at all. Use inside every campaign round rather than after them, and again whenever any artifact or any source changes.
---

# Review

## This Runs Inside The Campaign, Not After It

The [campaign skill](../campaign/SKILL.md) is already a reading discipline. Its rounds read the full population on both sides of an edge, from the artifacts rather than from your notes about them, because nothing here can report a gap for you. That is the right shape and this skill does not replace any of it.

**Do not read this as a later phase.** A campaign round that establishes presence quickly, intending to check truth afterwards, is a campaign round that did not happen: presence in this repository is established by reading, and a reader who is not asking whether the thing is true is not really reading it.

What this skill adds is the set of questions that a completeness pass does not naturally ask, because they are not about whether a row is filled.

Picture the ledger line written after reading the section and building what it asks for. Now picture the line written because a similar-sounding endpoint already existed and the requirement looked covered. **They are the same line.** Both name a requirement and an artifact, both close a row, and no pass that asks whether the row is filled will ever separate them.

`docs/analysis/` is immutable and authoritative. Review accepts every requirement as given and directs every disagreement to the authored project artifacts or to the reading that produced them.

## The Unit Of Review Is A Triple

Every review step reads three things, from the artifacts rather than from the ledger.

1. **The claim.** What the ledger says this artifact does about this requirement, table, or operation.
2. **The claiming artifact.** What the code actually does.
3. **The source it names.** What the requirement section says, what the model stores, what the contract promises.

A campaign round already reads the second and third: that is what walking an edge is. The claim is the side it does not read, because the ledger is where the round records its verdict rather than something the round examines.

So the ledger is the index of what to review and never proof that the review passed. It records what you believed when you wrote it, which is the thing under test.

## Either Side Can Be The Defect

This is the part that decides whether the skill is worth running.

When a claim does not hold, **the claiming artifact is not automatically what is wrong.** An authored project source upstream of it may be wrong too, and it fails in ways only a reader arriving from the claim is placed to notice. The immutable requirement is never that editable source.

**The claiming side is wrong** when the code does less than the claim says, does it in one path and not its sibling, or does something adjacent that reads similar. A provider recorded as enforcing the coupon-stacking rule, which refuses only the same coupon twice, is this.

**The authored project source side is wrong** when it does not mean what downstream artifacts assume. A column may be nullable where three DTOs treat it as always present, or a contract may omit an effect four tests assert.

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

`docs/analysis/` is never a correction target. When an artifact and a section disagree, accept the section and correct the project artifact or the reading that produced it.

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

## Decide The Entry First, Then Find The Row

The ledger is laid out requirement-first. **Do not think in that order.**

Say what the artifact is responsible for, in a sentence, before looking for a requirement to file it under. Then find the section that asks for it. An entry arrived at this way describes the work; an entry arrived at from a row justifies a row you had already decided to close.

The difference shows up under review as the third failure above. Someone who picked a plausible section and then wrote a line about it produces "the coupon rule", because that is genuinely all they know: the line was reverse-engineered from the row. Someone who knew the provider rejects a duplicate issuer at checkout writes that, and then either finds the section stating it or discovers there is none, which is itself the finding.

**A row that can be filled is not a row that should be.** Filing an artifact under whichever section it plausibly touches is the same move as weakening an assertion until a test passes.

## An Entry Is Responsibility, Not Proof

Every entry says the same thing: this artifact answers for this part of this source. It never says the source holds.

That decides which entry is worth trusting for which kind of requirement. A shape requirement is settled by reading the model or the DTO. **A behavioral rule is settled by nothing except a test that fails when the behavior is removed.** A model, a contract, and a provider may each be filed against the coupon-stacking section truthfully, and none of them demonstrates that stacking is refused.

So when reviewing a behavioral section, find the test filed against it and read what it asserts. If no test is, the section is traced through three layers and proven by none, and every one of those entries is honest.

## A Recorded Non-Exposure Is A Claim Too

A ledger line saying a table is deliberately internal, or a requirement genuinely needs no storage, is a decision that carries the same burden as a realization and gets the same triple read.

The failure to look for is a line recording work that was never done rather than a decision that was made. "Not exposed" on a column a requirement says a user must see is a row closed, not a decision taken.

Re-read every such line each round. One that was correct when written stops being correct the moment the requirement behind it changes, and **nothing will ever flag it**, because a closed row produces no diagnostic in any campaign.

## Repairing A Source Re-Opens Every Claim On It

This is the cascade, and it is why the work runs in rounds rather than once.

A claim is an assertion about a source. Change what the source means and every claim on it is unverified again, including the ones you passed an hour ago. Rename a column, change a nullability, add an effect to a contract, split a model in two: each invalidates every entry written against the old meaning, and **no campaign will notice**, because the artifacts still exist and the rows are still filled.

So when a round repairs a source, re-review every claim naming it, in full. A verdict issued against the previous meaning is void.

The ordinary direction cascades the same way. A changed provider re-opens the claims on its tests; a changed contract re-opens the claims on its screens.

## Where This Lands In A Round

The campaign's rounds are the rounds. This skill changes what each one does, in three places.

**While walking an edge**, read the claim as well as the two artifacts, and treat a mismatch as a live question about which of the three is wrong rather than as a note to fix the artifact.

**Before recording a verdict**, ask what the entry would owe a reader who did not write it, and whether anything in the repository actually proves it.

**Within the same round, walk both directions.** Walk claim-to-source and source-to-claim, asking of each requirement section and each table what every artifact built on it believes about it. Source-to-claim is what finds one source meaning three things to three readers, and claim-to-source cannot find it alone.

A finding here re-opens campaigns exactly like any other finding, including when the thing repaired was a source rather than an artifact. The campaign's rule that no verdict survives a change upstream of it applies without modification.

## One Indivisible Round

A review round is one continuous full traversal of the complete active scope. Never partition a round by file, layer, package, requirement subset, review lens, finding, time window, or agent, and never compose partial reports into a round.

Parallel assistance may surface candidate findings, but delegated slices do not count toward the round. The final reviewer must personally traverse every current requirement, every current artifact, and every relationship in the active scope.

A partial round never carries forward. Any change invalidates the current round, and the next round restarts at the first requirement without skipping unchanged requirements or artifacts.

Repeat complete rounds until one full round against the current state finds zero actionable improvements. One such dry round is sufficient; never require two consecutive dry rounds.

## Prove One Directly Before The Dry Round

Reading establishes that a claim is plausible. Removing the behavior establishes that something depended on it.

Before beginning the round that may qualify as dry, take one material behavioral claim, temporarily remove the behavior it names, and confirm the relevant test fails. Restore the behavior completely and confirm the workspace is back to its intended state before starting the full round at the first requirement. The mutation and restoration are diagnostic preparation, not part of the round; performing either during the traversal would invalidate it.

If nothing fails, the claim is decorative and every entry written in the same style is suspect.

## What This Skill Cannot Do

It cannot tell you that an artifact nobody thought to write is missing. That is what the campaign's traversal is for, and it is why this is a lens on those rounds rather than a substitute for them: walking the population finds what is absent, and these questions decide whether what is present is real.

It also cannot find a defect nobody reads for. Type-correct is not correct and recorded is not correct, and the shapes that survive both are catalogued in [the provider topic](../backend/providers.md). Each of them fills its ledger row and passes every build, so the only thing that finds one is a reader holding the code against the claim.
