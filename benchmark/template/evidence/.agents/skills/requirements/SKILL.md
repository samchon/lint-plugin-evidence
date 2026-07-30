---
name: requirements
description: Defines the immutable documents under docs/analysis, the exact H2/H3 requirement identity used by the evidence arm, and how to read each selected section before citing it. Use before implementation and during every integrity pass.
---

# Requirements

The graph's Markdown denominator is exactly the H2 and H3 headings selected from `docs/analysis/**/*.md`. Identify each as `<workspace-relative-path>#<anchor>`. An explicit `{#anchor}` wins and must begin with an ASCII letter or digit; later characters may also include `.`, `_`, `:`, and `-`. Otherwise lowercase the heading, keep letters, numbers, and `_`, collapse whitespace and `-` to one `-`, and remove other punctuation. Existing explicit anchors distinguish headings that would otherwise collide; never add, edit, or normalize one. H1, H4+, generated `docs/ERD.md`, and non-analysis Markdown are not denominator units.

The build reports a selected section no claim acknowledges. It does not report a cited section you misunderstood, a detail hidden in its tables or examples, or an unselected file.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Read For The Claim

For every H2/H3 section, extract actor or concept, circumstance, required behavior, observable result, named values, negative cases, and cross-references. Read through the next heading of equal or higher level.

Prefer leaf H3 targets. An H2 target is valid only when ownership evidence is true for every selected H3 descendant or one exclusion decision truthfully omits all of them, and the integrity review records that descendant audit. The graph's hierarchical coverage is a capability, not permission to compress unrelated obligations.

When a citation reason only repeats the heading, do not write it. Re-read until the reason names the exact responsibility implemented by the host.

## Exclusions Are Reviewed Decisions

Use `@evidenceExclude` only for a reviewed claim-local omission. [Evidence Lint](../evidence/SKILL.md) owns carrier eligibility, syntax, descendant scope, disjointness, and reason requirements; each layer topic supplies its valid host and example. Providers are not selected claim hosts and carry no evidence tags.
