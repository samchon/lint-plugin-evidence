---
name: requirements
description: Defines what the requirement documents under docs/analysis contain, how each document is organized, and how to read a requirement so that nothing in it is missed. Use before implementing anything and again when checking whether the specification is fully realized.
---

# Requirements

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
