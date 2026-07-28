# Requirements Check

Read [SKILL.md](SKILL.md) first. This check establishes the H2/H3 denominator every later mapping counts against.

## Enumerate

Read every Markdown file under `docs/analysis/**` in lexicographic path order. Extract exactly H2 and H3 headings, ignoring H1, H4+, fenced code, and generated documents. Identify each section as `<workspace-relative-path>#<canonical-anchor>` and record its source lines and five semantic parts in [ledger.md](ledger.md).

Compare the sorted identity list produced from the documents with the sorted ledger list. Counts are reported beside the identity-set difference, never instead of it.

## Read

Read each section through the next heading of equal or higher level. Include its tables, examples, negative cases, cross-references, and child prose. For every H2, determine what belongs to the parent itself and what belongs to each H3; do not let one child's implementation discharge the parent or its siblings.

Traverse the corpus again by actor and by named concept. This catches rules split across documents and actor-specific variants hidden under similar headings.

## Hand Off

Every selected identity receives an applicability decision for database, API/DTO, logic, tests, and frontend. “No artifact in this layer” is acceptable only with a reason that can be contradicted by the source.

A requirements finding invalidates every downstream mapping. Record it before repair, update the denominator if necessary without editing the specification, and recheck all affected layers.
