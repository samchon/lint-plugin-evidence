---
name: completeness
description: Defines the plain arm's Phase One manual completeness method, its obligation inventory, state ledger, and first-done boundary. Use before any implementation, after a change invalidates an upstream mapping, and before the first terminal completion report.
---

# Completeness

## The Standard

Every H2 and H3 requirement section under `docs/analysis/` must be realized, and every authored artifact must have a requirement or a recorded architectural reason to exist. A green compiler checks the code that exists; it cannot report the code nobody thought to write.

The plain arm therefore maintains an explicit manual obligation ledger. This is the arm's Phase One mechanism, not a substitute evidence plugin.

## Requirement Identity

The denominator is exactly the H2 and H3 headings in lexicographic document-path order. H1 titles, H4+ explanation, fenced-code headings, generated `docs/ERD.md`, and non-analysis Markdown are not denominator units.

The stable identity of a section is `<workspace-relative-path>#<canonical-anchor>`, for example `docs/analysis/02-domain-model.md#coupon-stacking`. Use an explicit `{#anchor}` when present; otherwise use the Markdown renderer's canonical lowercase slug. Heading numbers and reading-order IDs may be display labels, never identity.

An H2 and its H3 child are distinct units. Do not mark the H2 complete merely because one child is realized, and do not manufacture a separate obligation from prose that belongs to its nearest selected heading. Record the heading's actor or concept, circumstance, required behavior, observable result, named values, and source line range while reading.

## Phase One Obligation Graph

Populate and verify these mappings in both directions:

```
requirements -> database -> API -> logic -> tests
requirements ---------------------------> tests
requirements -> DTO types and properties -> tests
requirements -> frontend -> browser journeys
API operations and SDK accessors -------> frontend
```

The detailed walks live in [requirements.md](requirements.md), [database.md](database.md), [api.md](api.md), [logic.md](logic.md), [test.md](test.md), and [frontend.md](frontend.md). [ledger.md](ledger.md) owns the record and its state digest.

For each left-side unit, name every right-side artifact that realizes it or record a reasoned non-applicability. Then walk each right-side population back to an owner. “A product like this usually needs it” is not an owner.

## Phase One Loop

1. Read every requirements document and create the exact H2/H3 denominator.
2. Populate every mapping while implementing, recording a finding before fixing it.
3. When a source changes, invalidate every downstream mapping and validation verdict that depended on its previous meaning.
4. Review each mapping as a triple: ledger claim, claiming artifact, and named source. For behavior, require a test whose relevant assertion would fail if the behavior disappeared.
5. Regenerate owned outputs, then run build, lint, tests, frontend journeys, zero-`@todo` search, and every layer-local gate the project requires.
6. Compute the current-state digest and complete one exhaustive final Phase One pass over every denominator and reverse population.

Phase One may report terminal completion only when that full pass has no unresolved finding, every invalidation has been rechecked at the current digest, and all required commands passed with their output read. This is the first-done boundary the runner measures.

At the first terminal completion report, stop and wait for the benchmark runner's separate post-completion user turn. That external turn supplies the arm-neutral campaign; do not infer or pre-run it.

## Frozen Inputs

Never edit `.agents/skills/**`, `AGENTS.md`, package lint configs, or `docs/analysis/**` to make the current run easier. New project-specific facts go into the project-owned completeness ledger. A defect in a frozen method is a protocol finding, not permission to repair the method inside the cell.

## What Completion Does Not Mean

A filled ledger row is not proof, a passing test suite says nothing about an assertion never written, and a recorded omission can still contradict the requirements. Completion is a claim about one exact repository digest and the complete populations recorded for it.
