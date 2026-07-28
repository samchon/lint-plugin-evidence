# Test Obligation

Read [SKILL.md](SKILL.md) first. This document covers the edges into the suite.

## What The Build Checks

Every configured requirement section and every operation must be acknowledged by a test that claims to verify it. An endpoint nobody tested and a rule nothing exercises are lint failures naming exactly what is uncovered.

## The Widest Gap Between The Report And The Truth

The build checks that a test cites the requirement. It cannot check that the test would fail if the requirement stopped holding.

A test that calls the operation, asserts the response validates against its declared type, and carries the citation satisfies every obligation on this edge and proves nothing at all. Type validation proves the framework works.

So the gate removes one failure completely, that a requirement has no test, and leaves the failure that matters more, that the test does not test it.

**The standard is unchanged by the mechanism.** Write the assertion that would fail if the behavior were removed. Then cite it.

## Prove It Directly, Periodically

Take a requirement the product cannot be wrong about, remove the behavior implementing it, run the suite, confirm a test fails, restore it.

Nothing will ever prompt you to do this. It is the only direct measurement of whether the citations on this edge mean anything, and a suite that passed it before its last edit has not passed it.

## One Citation Satisfies A Rule That Spans Operations

A rule applying across several endpoints is discharged by the first test that cites it, and the report goes quiet while the other endpoints remain unexercised.

Walk by actor as well as by operation, following each actor through every journey the documents give them as one continuous session. The build checks endpoints; a journey is what finds the flow that works step by step and fails in sequence.

## Never Reach Green By Editing The Test

Two moves clear a diagnostic without doing the work, and both are worse than the red build they replace.

- **Weakening an assertion** so a real failure passes.
- **Retargeting a citation** to a rule the test does happen to cover.

The suite exists to fail, and the citation exists to say what the failure would have been about. A test that no longer does either is a green line in a report that means nothing.

## After Any Contract Change

Regenerate and run the build. A renamed operation leaves every test citation to it dangling, and a changed response shape can leave an assertion checking a field that no longer exists while its citation still resolves.
