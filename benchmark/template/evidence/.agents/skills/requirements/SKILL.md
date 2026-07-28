---
name: requirements
description: Defines the immutable documents under docs/analysis, the exact H2/H3 requirement identity used by the evidence arm, and how to read each selected section before citing it. Use before implementation and during every completeness or integrity pass.
---

# Requirements

The graph's Markdown denominator is exactly the H2 and H3 headings selected from `docs/analysis/**/*.md`. Identify each as `<workspace-relative-path>#<canonical-anchor>`. An explicit `{#anchor}` wins; otherwise use the renderer's canonical lowercase slug. H1, H4+, generated `docs/ERD.md`, and non-analysis Markdown are not denominator units.

The build reports a selected section no claim acknowledges. It does not report a cited section you misunderstood, a detail hidden in its tables or examples, or an unselected file. Read [the completeness requirements check](../completeness/requirements.md) before implementation.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Read For The Claim

For every H2/H3 section, extract actor or concept, circumstance, required behavior, observable result, named values, negative cases, and cross-references. Read through the next heading of equal or higher level.

Prefer leaf H3 targets. An H2 target is valid only when the host or exclusion genuinely owns every selected H3 descendant and the ledger records that descendant audit. The graph's hierarchical coverage is a capability, not permission to compress unrelated obligations.

When a citation reason only repeats the heading, do not write it. Re-read until the reason names the exact responsibility implemented by the host.

## Immutable Input

Never edit `docs/analysis/**` to agree with code. A contradiction is a finding against the implementation or, if the corpus itself is invalid, a frozen-input protocol finding that may stop the cell.
