---
name: requirements
description: Defines what the requirement documents under docs/analysis contain, how each document is organized, and how to read a requirement so that nothing in it is missed. Use before implementing anything and again when checking whether the specification is fully realized.
---

# Requirements

## They Are Given To You

`docs/analysis/` is input. Someone else wrote it, it arrives complete, and it is not yours to author.

Do not add behavior the documents do not describe. Read the complete set together and implement every statement without discarding one in favor of an easier interpretation.

Treat the directory as read-only. Never edit a document so that it agrees with code you already wrote, and never add a section because the implementation needed one.

## Read What Is Actually There

`docs/analysis/` holds the specification. Open the directory and read what it contains. The number of documents, their names, and their ordering belong to the project, so do not assume a layout and do not skip a file because its name looks like navigation or preamble.

What is durable is that **the documents are organized by primary concern, while one behavior may be constrained from several concerns.** An account action can be introduced in the actor document, shaped in the domain document, exposed in the operations document, constrained in the policy document, and given a security test obligation in the quality document. Reconcile every mention; no one occurrence cancels or replaces another. Expect to find, under whatever names this project uses:

- who exists, how identity is established, what each role may reach, and the session, account, ownership, and privacy boundaries;
- the business concepts, what information each carries, and how they relate;
- the operations and the journeys users take through them;
- the policies, constraints, calculations, and the refusals they imply;
- the quality obligations stated as promises a user or an organization can observe.

**This is why reading only the operations document produces an application with every endpoint and none of the rules.** The refusal an endpoint owes is written where the policies live, and the actor permitted to call it is written where the roles live. Neither appears beside the operation.

Read every document before you finish. A subject's absence from one document is not evidence that it has no requirements, and a document that looks like a table of contents may still carry a statement nothing else repeats.

## The Documents Are The Specification

They are read-only. When code and a document disagree, the document is right. Treat the complete requirement set as authoritative and implement it as written.

## How A Requirement Is Written

Each requirement section is written to be understandable on its own. A well-formed one gives you five things, and each one changes what you must build:

- **The actor or concept** the statement is about.
- **The circumstance** that makes it apply: an input, a state, a permission, a time.
- **The required behavior**: a capability, a state change, a preservation rule, a calculation, a visibility rule, or a prohibition.
- **The observable result**, including the refusal or the exception when the circumstance is not met.
- **The named values**: the allowed set, the threshold, the unit, the relationship, the boundary. These are what make the requirement testable rather than aspirational.

When you read a section, name all five before implementing it. A section whose observable result you cannot state is a section you have not finished reading.

Worked through on one section:

```markdown
### Coupon Stacking

A customer may combine at most one seller-issued coupon with at most one
platform-issued coupon on a single order. A second coupon of the same
issuer is refused. A coupon whose validity window has closed is refused
even when no other coupon is present.
```

| Part | What this section gives |
| --- | --- |
| actor or concept | the customer, applying coupons to an order |
| circumstance | an order with at least one coupon already applied |
| required behavior | permit one per issuer; refuse a second of the same issuer; refuse an expired one |
| observable result | the order is refused, and the reason distinguishes duplicate issuer from expired |
| named values | two issuer kinds, a maximum of one each, and the validity window |

Every one of those becomes something downstream. The issuer kinds become a column, the maximum becomes a check, the validity window becomes a comparison, and the two distinct refusals become two tests. A section read without extracting them produces an implementation that stacks correctly and never checks the window.

## Read Along The Whole Lattice

For every concept and every journey, a requirement set can speak about ten different things. Most omissions are a cell nobody thought to look for, not a sentence nobody read.

- entry and creation
- inspection and discovery
- change and correction
- state transitions
- completion or termination
- recovery
- actor authority
- ownership and visibility
- success effects
- conflicts and negative paths

Walk the lattice per concept. When the documents state a cell, implement it. When they state a cell as excluded, respect the exclusion rather than helpfully adding the behavior anyway; an unrequested capability on a permissioned entity is a defect, not a bonus.

## The Negative Paths Are Requirements

A rule that says something is not permitted is as binding as one that says something is. It is also the part most often left unbuilt, because the application appears to work without it: nothing fails until the case arrives.

Every constraint, threshold, uniqueness rule, and authority limit stated anywhere in `docs/analysis/` needs an implementation that refuses, and a test that proves the refusal. They cluster in the policy and the identity documents, and they are not confined to them.

## Every Section Is Realized, And None May Be Missed

That is the standard, and it is not a summary of the sections above but the thing they exist to serve.

Not most requirements. Not the ones that were easy to see, and not the ones a reasonable reader would call the important ones. **An omitted requirement is a defect of the same severity as one implemented incorrectly, and it is harder to find**, because nothing in the repository points at the place where it should have been. A build that compiles, a suite that passes, and a server that starts are all fully compatible with a requirement nobody read.

So finishing a section means finishing it: the five parts extracted, every cell of the lattice the documents state, every refusal, every named value. A section read once and implemented halfway is worse than one not started, because it looks done from every direction.

## Trace In Both Directions

A code-first walk cannot establish requirement coverage. It finds nothing missing, because code that does not exist has nothing to walk.

Walk from the documents to the artifacts as the primary direction: every section, in order, to the model, endpoint, provider, screen, and test that realize it. Then walk back from the artifacts to the documents to catch behavior nothing asked for.

The active arm's review skill owns how far to carry that traversal, how to verify each mapping, and when the review may stop.
