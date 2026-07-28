---
name: requirements
description: Defines what the requirement documents under docs/analysis contain, how each document is organized, and how to read a requirement so that nothing in it is missed. Use before implementing anything and again when checking whether the specification is fully realized.
---

# Requirements

## They Are Given To You

`docs/analysis/` is input. Someone else wrote it, it arrives complete, and it is not yours to author.

That is worth stating because the instinct when a document seems thin is to fill the gap yourself. Do not. A behavior the documents do not describe is not yours to invent, and a contradiction is not yours to resolve by picking the easier reading.

Treat the directory as read-only. Never edit a document so that it agrees with code you already wrote, and never add a section because the implementation needed one.

## Where They Live

`docs/analysis/` holds the specification. The documents are organized by concern, and each one owns a different kind of statement:

| File | Owns |
| --- | --- |
| `00-toc.md` | navigation only. It is not a requirement document and implementing it means nothing. |
| `01-actors-and-auth.md` | who exists, how identity is established, what each role may reach, session and account lifecycle, ownership and privacy boundaries. |
| `02-domain-model.md` | the business concepts, what information each carries, and how they relate. |
| `03-functional-requirements.md` | the operations and the journeys users take through them. |
| `04-business-rules.md` | policies, constraints, calculations, and the refusals they imply. |
| `05-non-functional.md` | quality obligations stated as user-visible or organization-visible promises. |

A concern lands in exactly one document. That is why reading only `03-functional-requirements.md` produces an application that has every endpoint and enforces none of the rules: the refusal that endpoint owes is stated in `04-business-rules.md`, and the actor allowed to call it is stated in `01-actors-and-auth.md`.

Read every document before you finish. A subject's absence from one document is not evidence that it has no requirements.

## The Documents Are The Specification

They are read-only. When code and a document disagree, the document is right.

If a document is genuinely contradictory or impossible, say so explicitly and stop on that point. Do not resolve the contradiction by picking whichever reading is easier to build, and do not edit the document so the disagreement disappears.

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

Every constraint, threshold, uniqueness rule, and authority limit in `04-business-rules.md` and `01-actors-and-auth.md` needs an implementation that refuses, and a test that proves the refusal.

## Trace In Both Directions

Completeness is not established by walking the code and finding a requirement for each piece. That direction finds nothing missing, because code that does not exist has nothing to walk.

Walk from the documents to the artifacts as the primary direction: every section, in order, to the model, endpoint, provider, screen, and test that realize it. Then walk back from the artifacts to the documents to catch behavior nothing asked for.

The method skill owns how far to carry that traversal and how to know when it is finished.
