# Requirements Obligation

Read [SKILL.md](SKILL.md) first. This document covers the edges out of `docs/analysis/`.

## What The Build Checks

Every configured section of every document must be acknowledged by an artifact on each side that owes it: a model, an operation, a provider, a test, and a screen. The lint stage names the exact section and the exact claim that is short.

`docs/analysis/` is given input. You never edit it to make a diagnostic stop.

## Reading The Diagnostic

**A section no model cites** means the requirement has no storage. Add the table, or record an exclusion with a reason if the section genuinely describes behavior with no persistent state.

**A section no operation cites** usually means the same thing one layer up. Check whether a model exists before adding a tag: an operation cannot cite what has nowhere to read from.

**A section no test cites** means the behavior is unproven. Write the test that would fail if it stopped holding, then cite.

**A section no screen cites** means it was built and never delivered. Check that an operation exposes it first.

## The One Failure This Edge Cannot Report

A citation that resolves is accepted. The build has no way to know that the artifact does something adjacent to the section rather than what the section requires.

So the honest gate on this edge is the reason beside each citation. Write which part of the section this artifact is responsible for, phrased so it would be visibly false if the artifact did not do it.

## Configuration

A document or heading level the graph does not select is not part of the denominator, and its absence produces no diagnostic.

When a document is added under `docs/analysis/`, confirm it is selected before trusting a green build.
