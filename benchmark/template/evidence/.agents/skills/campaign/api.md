# API Obligation

Read [SKILL.md](SKILL.md) first. This document covers the edges into and out of the public contract.

## What The Build Checks

**Into the contract.** Every configured requirement section and every selected model must be acknowledged by an operation. Two denominators, checked independently: a contract can satisfy every requirement while leaving half the schema unreachable, and the build reports each separately because they are different failures.

**Out of the contract.** Every operation must be acknowledged by a test that verifies it and by the provider that implements it.

## This Is Where Upstream Holes Surface

More diagnostics point at this layer than belong to it, because it is the layer that owes the most.

An operation that has nothing to cite is rarely an operation missing a tag. It is a requirement with no model, reported here because the obligation was declared here. Ask the question before writing anything: is there a table for this requirement?

The same holds in the other direction. A model nothing can expose sometimes means the model is wrong rather than the contract incomplete.

Fix upstream and let the build re-run. One repair to the schema commonly clears several diagnostics here, and clears them correctly.

## Citing At The Reported Layer Is The Silent Failure

Adding a citation here when the hole is in the schema produces a green build over a repository that does not satisfy the requirement.

Nothing later finds it. The test layer will cite the operation, the provider will cite the operation, and every one of those claims will be true about an operation that implements a requirement it cannot actually store. This is the one failure mode the mechanism cannot catch, and it is reached only by discharging a diagnostic at the wrong layer.

## After Regenerating The SDK

Run the build again. The generated accessors are what the tests and the screens cite through, so a changed route, a renamed operation, or a changed response shape moves what those citations resolve to.

Never narrow the configuration to quiet a diagnostic. An edge that is not configured produces no report, and removing an obligation looks identical to satisfying it.
