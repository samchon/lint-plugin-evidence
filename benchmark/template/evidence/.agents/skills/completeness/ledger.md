# Ledger

Read [SKILL.md](SKILL.md) first. The evidence graph is the reproducible structural coverage report. This project-owned ledger records what the graph cannot: denominator verification, claim integrity, exclusions, residual provider/frontend edges, invalidations, findings, commands, and state identity.

## Location

Create `wiki/completeness/` with:

```
wiki/completeness/
  denominator.md
  integrity.md
  residual.md
  findings.md
  state.md
```

Do not duplicate every green graph edge by hand. Record the graph config digest, target counts by claim/reference, zero-diagnostic command, and the manual judgments the graph does not encode.

## Denominator And Integrity

`denominator.md` records the sorted `<workspace-relative-path>#<canonical-anchor>` H2/H3 identity set, target counts for every named claim/reference, selected host counts, and mismatches between intended and materialized populations.

`integrity.md` indexes each `@evidence` and `@evidenceExclude` by claim name, host identity, target scope, reason, last-reviewed digest, and verdict. Review the triple from source artifacts, never from this index alone. Broad H2/model/type scopes receive an explicit descendant audit.

An exclusion row includes the alternative owner, consequence, and veto condition. If it only says “not applicable,” it has not been reviewed.

## Residual Edges

`residual.md` records:

- requirements, operations, and schema invariants to provider implementation, plus every provider branch back to an owner;
- product-facing SDK operations to screens/journeys or requirement-backed deliberate omissions, plus every screen back to requirements and consumed operations.

Use the same source/artifact/reason/status/digest shape as a manual mapping ledger. These edges are not mechanically covered and must never inherit a green graph verdict.

## Findings And State Identity

Record a finding before repair, including rejected hypotheses and every downstream review invalidated. `state.md` records the deterministic authored-state digest, its exact included and excluded path inventories, command results, and the Phase One first-done boundary.

A report interrupted by a limit remains interrupted. Missing counts are `not-recorded`, never zero. A changed source invalidates every integrity or residual verdict bound to its previous state.
