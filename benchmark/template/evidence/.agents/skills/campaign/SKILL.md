---
name: campaign
description: Defines how completeness is established here: the build reports every unmet obligation, what each diagnostic means, and how to discharge one at the layer that actually owns it. Use before starting any work, whenever any artifact changes, and again whenever you believe the work is done.
---

# Campaign

## The Goal

Every requirement stated in `docs/analysis/` must be realized in this repository, and none may be missed.

This is the whole standard. Not most requirements, not the ones that were easy to see, and not the ones a reasonable reader would consider the important ones. A requirement that is omitted is a defect of the same severity as one that is implemented incorrectly, and it is harder to find, because nothing about the repository points at the place where it should have been.

Working code is necessary and not sufficient. A build that compiles, a suite that passes, and a server that starts are all compatible with a requirement nobody implemented.

## The Mechanism

The build establishes completeness for you.

Every unit on the left of an obligation must be acknowledged by name from the artifact on the right. The lint stage fails until it is. So a missed requirement is a compile error rather than something you must notice, and your job is to make those errors say something true.

```
docs/analysis/  ->  database
docs/analysis/  ->  DTO type
docs/analysis/  ->  API operation
docs/analysis/  ->  tests
docs/analysis/  ->  business logic
docs/analysis/  ->  frontend

database        ->  DTO type          (the table it represents)
database        ->  API operation     (the table it exposes)
database        ->  business logic

column, relation ->  DTO property     (the value it carries)

API             ->  tests
API             ->  business logic
```

Granularity is part of the configuration. A DTO **type** is a claim over requirements and models; a DTO **property** is a separate claim over columns and relations, and it does not answer to a requirement. Configuring only the type level leaves every property unchecked, and the silence reads exactly like coverage.

The configured graph is what the build checks. Keep it current: when the frontend takes a concrete shape or a new artifact kind appears, the obligation belongs in the configuration. **An edge that is not configured is not checked**, and nothing will tell you it is missing.

## Cite As Many Targets As The Work Draws On

A declaration carries as many `@evidence` tags as it needs, and this is what makes the graph usable for anything that is not one-to-one.

An aggregate cites every column and relation it is computed from. A statistics type cites every requirement it serves and every model it reads. An operation that realizes three sections cites three sections.

**Breadth is the correct answer, not a reason to skip citing.** The instinct to write nothing because a value does not correspond to a single row is backwards: several sources is a reason to name several sources, and naming them is what lets a reviewer check the derivation against the code.

The one constraint is that two scopes must not overlap inside one obligation. A citation acknowledges its target and every selected descendant, so naming a model **and** one of its columns from the same declaration is reported as a duplicate. Cite siblings, or cite the parent, not both.

## What The Diagnostics Mean

Three kinds, and each names a different repair.

**A missing acknowledgement.** Something on the left has no citation from the right: a requirement section nothing implements, a table no endpoint exposes, an operation no test covers. The diagnostic names the exact target and the claim that owes it.

**A dangling citation.** A citation names a target that no longer resolves. Either the document changed, or the address was wrong from the start. Fix whichever is actually wrong; do not delete the citation to make the message stop.

**A host or duplication complaint.** The citation sits on a declaration the claim does not select, or two acknowledgement scopes overlap inside one obligation. Both mean the declaration is in the wrong place rather than that the work is missing.

## Discharge It At The Layer That Owns It

The diagnostic tells you which claim is short. It cannot tell you which artifact is wrong, and those are different questions.

**The repair often runs upstream of the error.** An operation that has nothing to cite is usually not an operation that forgot to write a tag. It is an operation whose requirement has no storage, so there is no model to point at. The build reports the API layer because that is where the obligation was declared, but the hole is in the schema.

Before adding any citation, ask what the diagnostic is actually telling you.

- The API cannot cite a requirement. Is there a table for it? If not, the finding belongs to the schema.
- A test cannot cite an operation's behavior. Does the contract actually state that behavior? If not, the finding belongs to the contract.
- A provider cannot cite a rule. Does the schema hold the state the rule needs? If not, the finding belongs to the schema again.
- A screen cannot cite a requirement. Does an operation expose it? If not, the finding belongs to the API.

Fix it there and let the build re-run. One upstream repair usually clears several downstream diagnostics at once, and it clears them correctly.

Adding a citation at the layer that reported the error, when the hole is upstream, produces a green build over a repository that still does not satisfy the requirement. That is the one failure this mechanism cannot catch, because a citation the build accepts is a claim the build believes.

## Never Reach Green By Weakening The Claim

Four moves make a diagnostic disappear without doing the work, and each converts a true report into a false one.

- **Citing from an artifact that does not do the work.** The tag records a claim about your own work, permanently, beside the code. Write it only where the work is.
- **Excluding instead of implementing.** An exclusion records a reviewed decision that this claim genuinely does not use a target. It is never correct for something you have not implemented yet.
- **Retargeting a citation** to something that happens to resolve.
- **Narrowing the configuration** so the obligation stops being checked.

Each hides a gap no later pass will find, because the report that would have found it now reads clean.

## What The Build Cannot Check

It checks that a citation exists and resolves. It does not check that the reason is true.

The remaining work is yours. The reason beside each citation must survive a reader comparing it to the code: state which part of the target this artifact is responsible for, not a restatement of the tag. A citation whose reason is filler passes the build and tells the next reader nothing.

Type-correct is not correct either. A default that means the opposite of unset, an aggregate over the wrong side of a relation, an effect implemented in one path and not its sibling: all of these carry valid citations and satisfy every check.

## When You Believe You Are Done

Run the build and read it. A clean lint stage means every configured obligation is acknowledged.

Then check the two things it cannot: that each citation names work the artifact genuinely does, and that each exclusion records a decision a reviewer would accept. Run the tests and read their output.

Report what you did and what you verified. If any part of the specification is unrealized, say which part and why, rather than reporting completion and leaving it to be discovered.
