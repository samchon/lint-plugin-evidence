---
name: requirements
description: Defines the immutable documents under docs/analysis, the exact H2/H3 requirement identity used by the plain arm, and how to build and verify its manual denominator. Use before implementation and during every integrity pass.
---

# Requirements

No plugin reports a selected section missing from the plain arm. Build the denominator explicitly from exactly the H2 and H3 headings in `docs/analysis/**/*.md`, identified as `<workspace-relative-path>#<canonical-anchor>`. An explicit `{#anchor}` wins; otherwise use the renderer's canonical lowercase slug. H1, H4+, generated `docs/ERD.md`, and non-analysis Markdown are not units.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Build The Inventory While Reading

For every H2/H3 section, record actor or concept, circumstance, required behavior, observable result, named values, negative cases, cross-references, and source lines. Read through the next heading of equal or higher level.

Treat an H2 and each H3 child as distinct obligations. Compare the sorted heading identities rather than only their count, and map each identity forward to every applicable model, column, DTO, operation, provider path, test assertion, screen, and browser journey. A broad H2 mapping is valid only when the implementation genuinely realizes every selected child and names them individually.

Read every selected section for states, actor authority, ownership, refusals, and named boundaries. Traverse the documents again by actor and named concept so that a rule split across sections cannot disappear between them.

## Immutable Input

Never edit `docs/analysis/**` to agree with code. A contradiction is a finding against the implementation or, if the corpus itself is invalid, a frozen-input protocol finding that may stop the cell.
