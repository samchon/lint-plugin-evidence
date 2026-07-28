# Ledger

Read [SKILL.md](SKILL.md) first. The plain arm has no machine-maintained coverage graph, so this project-owned record preserves the current denominator, mappings, invalidations, findings, validation, and repository identity.

## Location

Create `wiki/completeness/` before implementation and keep these current-state files:

```
wiki/completeness/
  requirements.md
  mappings.md
  findings.md
  state.md
```

These are benchmark output. The frozen method under `.agents/skills/**` is never edited during a run.

## Requirements

`requirements.md` contains exactly one row for every H2/H3 denominator unit:

| Requirement identity | Source lines | Actor or concept | Circumstance | Required behavior | Observable result | Named values |
| --- | --- | --- | --- | --- | --- | --- |

The identity is `<workspace-relative-path>#<canonical-anchor>`. Re-enumerate the source files and compare the sorted identity list with this table after a requirements change and before first done. Counts alone are insufficient because one missing and one invented row cancel each other.

## Mappings

`mappings.md` is current state, not a diary. Use one table per edge with explicit source and artifact identities, a falsifiable reason, applicability, last-verified digest, and status.

Every source unit may have multiple artifact rows. Every artifact population also receives a reverse-owner row. A deliberate non-applicability names the exact source unit or artifact, the architectural fact that makes it inapplicable, and the consequence a reviewer should inspect. “Not needed” is not a reason.

## Findings And Invalidations

Write a finding to `findings.md` before repairing it. Preserve its lens, source, artifact, discovery context, disposition, repair, and downstream mappings invalidated. Rejected finder hypotheses remain recorded as rejected rather than disappearing.

When a source changes, immediately mark every dependent mapping stale in `mappings.md`; do not carry a green verdict from the old meaning. After repair, recheck the entire affected downstream population and bind the new verdict to the new digest.

## Completion State

`state.md` records Phase One's final exhaustive pass:

| Boundary | Digest | Included paths | Excluded paths | Mapping coverage | Raw | Duplicate | Rejected | Confirmed | Repaired | Commands | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

The first-done row is written even when interrupted or invalid. Never infer missing data as zero. Use `not-recorded`, `not-run`, or the exact blocker. Record exact path inventories so the state identity can be recomputed.

## No Memory-Only State

A terminal report that says “all requirements are covered” without the exact current denominator, reverse populations, digest, and command results is unsupported. The ledger is an index for re-reading artifacts; it never replaces that reading.
