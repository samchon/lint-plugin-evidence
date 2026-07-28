# Requirements Check

Read [SKILL.md](SKILL.md) first. This check verifies that the graph's Markdown population is the intended H2/H3 denominator and that every accepted reason reflects a complete reading.

## Enumerate

Read `docs/analysis/**/*.md` in lexicographic path order. Independently extract H2/H3 identities as `<workspace-relative-path>#<canonical-anchor>` and compare that sorted set with the graph's reported targets. H1, H4+, fenced-code headings, and generated Markdown are not units.

Read every section through the next heading of equal or higher level. Record actor or concept, circumstance, behavior, observable result, named values, negative cases, and cross-references in the ledger. A graph diagnostic can find a missing acknowledgement; it cannot find a shallow reading.

## Review Scope

Prefer leaf H3 targets. An H2 citation or exclusion is accepted only after enumerating all selected H3 descendants and proving that the one host or decision owns every one. Record that descendant audit.

When a requirement appears storage-free, backend-free, or frontend-free, treat that as a claim to verify, not an automatic exclusion. Exclusions remain claim-local; another named claim still owes its own acknowledgement.

## Consequences

A denominator mismatch is a protocol finding because package lint configs are frozen. Do not edit selectors during the cell. A misread requirement invalidates every downstream citation and residual mapping built on the old interpretation.
