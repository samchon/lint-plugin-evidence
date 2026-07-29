---
name: requirements
description: Defines the immutable documents under docs/analysis, the exact H2/H3 requirement identity used by the evidence arm, and how to read each selected section before citing it. Use before implementation and during every integrity pass.
---

# Requirements

The graph's Markdown denominator is exactly the H2 and H3 headings selected from `docs/analysis/**/*.md`. Identify each as `<workspace-relative-path>#<canonical-anchor>`. An explicit `{#anchor}` wins; otherwise use the renderer's canonical lowercase slug. H1, H4+, generated `docs/ERD.md`, and non-analysis Markdown are not denominator units.

The build reports a selected section no claim acknowledges. It does not report a cited section you misunderstood, a detail hidden in its tables or examples, or an unselected file.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Read For The Claim

For every H2/H3 section, extract actor or concept, circumstance, required behavior, observable result, named values, negative cases, and cross-references. Read through the next heading of equal or higher level.

Prefer leaf H3 targets. An H2 target is valid only when ownership evidence is true for every selected H3 descendant or one exclusion decision truthfully omits all of them, and the integrity review records that descendant audit. The graph's hierarchical coverage is a capability, not permission to compress unrelated obligations.

When a citation reason only repeats the heading, do not write it. Re-read until the reason names the exact responsibility implemented by the host.

## Exclusions Are Reviewed Decisions

Use `@evidenceExclude <target> <reason>` only when the current named claim intentionally has no responsibility for the target. Put it on an eligible exclusion carrier in a matching claim file, name the actual owner or observable alternative, and state a condition that would veto the decision. “Not applicable,” “internal,” “future work,” and “not implemented” are conclusions rather than reasons.

Exclusions are claim-local. The same requirement may need independent decisions from `schema-models`, `api-operations`, `dto-types`, `dto-properties`, `backend-tests`, `frontend-screens`, and `frontend-journeys`. A parent target covers all selected descendants, and overlapping `@evidence` and `@evidenceExclude` scopes within one claim-reference obligation are contradictory. Prefer an H3 exclusion; use an H2 only after checking every selected descendant.

Follow each owner's existing skill for exact syntax. Markdown uses `docs/analysis/file.md#anchor`, Prisma uses `prisma:Model` or `prisma:Model.member`, and TypeScript references use a braced `{@link ImportedSymbol}` resolved through the host file's imports. Providers are not selected claim hosts and carry no evidence tags.

## Immutable Input

Never edit `docs/analysis/**` to agree with code. A contradiction is a finding against the implementation or, if the corpus itself is invalid, a frozen-input protocol finding that may stop the cell.
