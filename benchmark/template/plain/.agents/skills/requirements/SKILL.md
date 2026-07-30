---
name: requirements
description: Defines the immutable documents under docs/analysis, the exact H2/H3 requirement identity used by the plain arm, and how to build and verify its manual denominator. Use before implementation and during every integrity pass.
---

# Requirements

Nothing automatically reports a selected section missing from the plain arm. Build the denominator explicitly from exactly the H2 and H3 headings in `docs/analysis/**/*.md`, identified as `<workspace-relative-path>#<anchor>`. An explicit `{#anchor}` wins and must begin with an ASCII letter or digit; later characters may also include `.`, `_`, `:`, and `-`. Otherwise lowercase the heading, keep letters, numbers, and `_`, collapse whitespace and `-` to one `-`, and remove other punctuation. Give headings that would collide distinct explicit anchors. H1, H4+, generated `docs/ERD.md`, and non-analysis Markdown are not units.

Read [the campaign skill](../campaign/SKILL.md) and [its requirements edge](../campaign/requirements.md) before you start. That edge is the root of the graph and the only one with nothing upstream to catch its mistakes.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Build The Inventory While Reading

For every H2/H3 section, record actor or concept, circumstance, required behavior, observable result, named values, negative cases, cross-references, and source lines. Read through the next heading of equal or higher level, while distinguishing the heading's direct prose from selected child sections.

Treat an H2 and each H3 child as distinct obligations. Compare the sorted heading identities rather than only their count, and map each identity forward to every applicable model, column, DTO, operation, provider path, test assertion, screen, and browser journey. A broad H2 mapping is valid only when the implementation genuinely realizes every selected child and names them individually.

Read every selected section for states, actor authority, ownership, refusals, and named boundaries. Traverse the documents again by actor and named concept so that a rule split across sections cannot disappear between them.

## Immutable Input

Never edit, challenge, validate, or repair `docs/analysis/**`. Accept the selected sections as the specification and review only whether the application realizes them.
