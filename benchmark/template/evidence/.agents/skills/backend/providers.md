# Providers

**This layer carries no `@evidence` tags, and that is deliberate.**

The graph tracks whether a requirement reached an artifact a consumer can see: a table that stores it, an operation that exposes it, a DTO that carries it, a test that proves it, a screen that delivers it. A provider is none of those. It implements an operation that already cites the requirement, so a citation here would acknowledge the same section a second time from a layer nobody outside this package reads.

So the build says nothing about this layer at all. Every other layer gets a diagnostic when it is short; this one gets silence whether the work is done or not.

Read [the evidence skill](../evidence/SKILL.md) before starting.

{{base}}

## What The Silence Costs You

The obligations the graph does check pass straight through this layer without touching it, and each one leaves a gap here that nothing reports.

**An operation cites a requirement; the provider behind it may implement none of it.** The citation is on the contract, and the contract is a promise about behavior that lives here. A green build means the promise was made, not kept.

**A model is cited by an operation that exposes it; the provider may never read the column that matters.** The obligation was discharged at the contract, one layer above the code that would have had to use it.

**A test cites an operation; the provider may satisfy the test and not the requirement.** That is the ordinary case rather than a perverse one, because a test proves what it asserts and the requirement usually says more.

## Where The Real Check Is

Two things, and neither is the build.

**The reason on the operation's citation.** It states what the contract promises, so reading it against this provider is the closest thing to a mechanical check that exists for this layer. [The review skill](../review/SKILL.md) owns that reading.

**The test that would fail if the behavior were removed.** For a behavioral requirement it is the only proof, and it is the reason a rule can be cited from three layers and demonstrated by none of them.

## After Any Implementation Change

Nothing in the graph moves, because nothing here is in it. What moves is whether the citations upstream are still true: the operation still claims this behavior, and the test still proves it.

Re-read both against the code you just changed. A change here that quietly narrows what an operation does leaves two true-looking citations describing a product that no longer works that way, and the build reports neither.
