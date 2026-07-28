---
name: evidence
description: Defines the evidence graph this repository is checked against: what each obligation means, how a citation is written and where it belongs, what each diagnostic is telling you, and which failures the build cannot see. Use before any work, whenever a diagnostic appears, and again before believing a green build.
---

# Evidence

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
docs/analysis/  ->  browser tests
docs/analysis/  ->  frontend

database        ->  DTO type          (the table it represents)
database        ->  API operation     (the table it exposes)

column          ->  DTO property      (the value it carries)

DTO type        ->  tests             (the shape it exchanges)

API             ->  tests
screen          ->  browser tests     (the spec that walks it)
```

**The business-logic edges are deliberately absent.** A provider carries no citations, because the operation it implements already cites the requirement and the model, and a second acknowledgement of the same target from an unpublished layer would be a duplicate. So the build checks every edge above and says nothing about the providers at all; [the provider topic](../backend/providers.md) owns what that silence costs and where the real check for that layer lives.

Granularity is part of the configuration. A DTO **type** is a claim over requirements and models; a DTO **property** is a separate claim over columns alone, and it does not answer to a requirement. Configuring only the type level leaves every property unchecked, and the silence reads exactly like coverage.

The configured graph is what the build checks, and it is declared per package: `packages/api`, `packages/backend`, and `packages/frontend` each carry a `lint.config.ts` whose claims bind that package's own artifacts. Keep it current: when the frontend takes a concrete shape or a new artifact kind appears, the obligation belongs in the configuration. **An edge that is not configured is not checked**, and nothing will tell you it is missing.

## The Tag, Exactly

Two tags, one grammar: `@evidence <target> <reason>` and `@evidenceExclude <target> <reason>`. The reason is required, and the target is one whitespace-delimited token, so everything after the first space is the reason.

The tag lives in the block the host publishes: a JSDoc `/** */` on a TypeScript declaration the claim selects, a `///` comment on a Prisma model or member.

| Target form | Cites |
| --- | --- |
| `docs/analysis/<file>.md` | the document and every selected heading below it |
| `docs/analysis/<file>.md#<anchor>` | one heading section and its selected descendants |
| `prisma:<model>` | the model, covering its selected columns |
| `prisma:<model>.<column>` | one member of the model |
| `{@link <symbol>}` | an exported TypeScript type, function, or property, resolved through the citing file's own imports |

Targets are exact tokens. A Markdown anchor is the one the heading declares with a `{#anchor}` suffix or generates from its text; copy it out of the document rather than composing it from the title. A Prisma target always carries its `prisma:` prefix and never a file path. A `{@link}` target must resolve through an import in the citing file, which is what makes a rename break it loudly.

When a reason spans lines, the continuation aligns under the column where the target starts:

```ts
/**
 * @evidence docs/analysis/02-domain-model.md#sales The sale concept this
 *           document describes, as a caller receives it.
 */
```

`@evidenceExclude` records that this claim intentionally does not use the target. It follows the same hierarchy, must sit on a host the claim selects, and affects only that claim; overlapping an exclusion with a citation for the same unit is rejected, because the two state contradictory intent.

**Every reason is written for the reviewer who will read it against the code.** A citation's reason states which part of the target this artifact answers for; an exclusion's reason states the decision a reviewer could veto. The [review skill](../review/SKILL.md) reads exactly these sentences as the claims under test, so a reason that only restates the tag hands the review nothing to check.

## Two Rules Run Beside The Graph

The graph is the obligation checker. Two smaller rules run with it, and both fail the build the same way.

**Every selected export carries a JSDoc block.** That block is the only place an `@evidence` tag is ever read from, so a declaration without one can never cite anything. An empty block fails too: it states nothing and carries no tag.

**One public identity per file, named after the file.** `IShoppingSale.ts` declares `IShoppingSale` and its namespace, and nothing else public. That is what makes an index re-export predictable and a citation address stable, and it is the rule behind one file per root type. The configuration enables it for the DTO tree and the backend; the frontend deliberately omits it, because a domain folder keeps a page beside the sub-components only it uses.

Neither rule reads whether a citation is true. A block containing only a tag satisfies the first completely, which is why the paragraph below is a rule you keep rather than a check you pass.

## The Examples Here Show Tags, Not Whole Declarations

Every example in this arm's topic documents is trimmed to the citation it is making. A controller method still owes its full published JSDoc, a model still owes its documentation comment, a test still owes its numbered scenario, and a DTO property still owes its description. The base document for each layer owns those, and a citation is added beside them rather than in place of them.

**A declaration whose entire comment is an `@evidence` tag is the failure to watch for.** It satisfies the graph and publishes an operation, a type, or a property that reaches its consumers with a machine-readable claim and no human-readable meaning.

## Each Layer Owns Its Own Diagnostics

This document covers the graph as a whole. What a diagnostic at one layer means, and where its repair usually belongs, is owned by that layer: [the schema](../backend/database.md), [the DTOs](../backend/dtos.md), [the operations](../backend/controllers.md), [the tests](../backend/testing.md), and [the screens](../frontend/screens.md). [The provider topic](../backend/providers.md) is the one that carries no citations, and it says what that silence costs.

[ledger.md](ledger.md) holds what still has to be written down even though the build tracks the obligations.

When the build reports nothing, the [review skill](../review/SKILL.md) takes over. It owns the question this one cannot ask: whether each citation is true.

## Cite As Many Targets As The Work Draws On

A declaration carries as many `@evidence` tags as it needs, and this is what makes the graph usable for anything that is not one-to-one.

An aggregate cites every column it is computed from. A statistics type cites every requirement it serves and every model it reads. An operation that realizes three sections cites three sections.

**Breadth is the correct answer, not a reason to skip citing.** The instinct to write nothing because a value does not correspond to a single row is backwards: several sources is a reason to name several sources, and naming them is what lets a reviewer check the derivation against the code.

The constraint is disjointness, and it spans the whole obligation rather than one declaration. A citation covers its target and every selected descendant, and a target may be acknowledged once per obligation, so all three of these report a duplicate:

- the same target cited twice from one declaration;
- a parent and one of its descendants cited from one declaration;
- the same target cited from two different declarations in the same claim.

The third is the one to keep in mind while citing broadly. A source belongs to one acknowledger. Within a declaration, name the full set it draws on; across declarations, decide which one owns the shared source.

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
- An operation cannot cite the rule its provider must enforce. Does the schema hold the state the rule needs? If not, the finding belongs to the schema again.
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

It checks that a citation exists and resolves. It does not check that the reason is true, and a tag written to clear a diagnostic is indistinguishable from one written after doing the work.

So a green lint stage completes this skill and finishes nothing. Write each reason to survive a reader comparing it to the code, then hand the repository to the [review skill](../review/SKILL.md), which owns that examination in full.

## When You Believe You Are Done

Run the build and read it. A clean lint stage means every configured obligation is acknowledged, which is the whole of what this skill establishes.

Then run the review, and run the tests and read their output.

Report what you did and what you verified. If any part of the specification is unrealized, say which part and why, rather than reporting completion and leaving it to be discovered.
