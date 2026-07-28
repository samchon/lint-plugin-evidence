---
name: method
description: Defines how to work the requirement set to completion and how to establish that no requirement was missed. Use before starting and again whenever you believe the work is done.
---

# Method

## The Goal

Every requirement stated in `docs/` must be realized in this repository, and none may be missed.

This is the whole standard. Not most requirements, not the ones that were easy to see, and not the ones a reasonable reader would consider the important ones. A requirement that is omitted is a defect of the same severity as one that is implemented incorrectly, and it is harder to find, because nothing about the repository points at the place where it should have been.

Working code is necessary and not sufficient. A build that compiles, a suite that passes, and a server that starts are all compatible with a requirement nobody implemented.

## The Mechanism

Nothing in this repository can tell you that a requirement is missing. The compiler checks the code that exists; it cannot check the code that should exist. So completeness is yours to establish, by traversal and by audit, and the discipline below is what stands in for a check the toolchain does not perform.

## Traverse Exhaustively

Read every document under `docs/` in full before you finish, not only the ones that seemed relevant to the task at hand. Then traverse the specification along every axis it offers, because a requirement missed on one axis is often visible on another.

- **By document section.** Walk every heading of every document in order. For each one, name the artifact that realizes it. A section you cannot map to an artifact is either unimplemented or implemented somewhere you have not checked, and the difference matters.
- **By data model.** Walk every table and every column. Name the requirement it serves and the endpoint that reads or writes it. A column nothing writes is a requirement half-built.
- **By endpoint.** Walk every operation the API exposes. Name the requirement it satisfies and the test that proves it. Then walk the requirements that name a behavior and find the operation for each; the two directions catch different omissions.
- **By cross-cutting rule.** Authorization, validation, state transitions, and constraints that span entities are stated once in a document and must hold in many places. Walk each rule against every place it applies.

Record the mapping as you go. A traversal you performed but did not write down cannot be checked, and you will not remember on the second pass which sections you resolved on the first.

## Audit Until It Runs Dry

One pass finds the omissions you were already looking for. Finding the rest takes repetition with fresh attention.

After you believe the work is complete, run a full audit pass over the whole specification, from the documents rather than from your memory of them. Fix everything it finds. Then run another pass from the beginning.

Stop only when two consecutive complete passes find nothing new. One clean pass means the last pass was tired; two mean the surface is genuinely quiet.

An audit pass that finds nothing is not wasted, and an audit pass you shortened because the previous one was clean is not a pass.

## Verify Rather Than Assume

Check each claim against the artifact, not against your recollection of writing it.

- Open the file and read what it does before recording a requirement as realized.
- Run the build and the tests, and read their output.
- Confirm that a test asserting a requirement fails when the behavior is removed. A test that passes either way proves nothing about the requirement it names.

## When You Are Finished

You are finished when every heading in every document maps to an artifact you have read, every artifact traces to a requirement, the build and the tests pass, and two consecutive complete audit passes have found nothing new.

Report what you did and what you verified. If any part of the specification is unrealized, say which part and why, rather than reporting completion and leaving it to be discovered.
