---
name: review
description: Adds Evidence claim restoration to the shared phase review. Use after the first implementation pass and before every completion report.
---

# Review

## Evidence Review Admission

Development may temporarily defer only the later-phase claims permitted by the Evidence skill. Before any review round, restore every claim that the Evidence claim-state matrix marks active for the current phase, with its original population and `error` severity. Backend review requires the five backend-phase claims active; Frontend and Overall review require all seven claims active. A phase-active claim may never remain deferred as a review result.

During each round, treat every remaining `@todo` in the active phase's TypeScript source as an unfinished declaration. Before a phase report, run the phase-scoped `rg --hidden -n -F '@todo'` search prescribed by the owning Evidence layer instruction and require no matches.

<!-- benchmark-template-splice: base-body -->
{{base}}
