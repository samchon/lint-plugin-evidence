# Verification

Every actor journey in the H2/H3 denominator needs an exported function under `tests/journeys/**`, and every journey function needs exact requirement, screen, and operation owners.

Read [the frontend completeness check](../completeness/frontend.md) before browser work. Record actor, steps, assertions, viewports, simulation/live mode, and last-verified digest. Presentation-only specs and fixtures do not count as functional journeys.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Invalidation

A requirement interpretation, contract, screen, or journey change invalidates affected browser verdicts. A still-passing spec proves only the flow it currently encodes; reread the source to establish that it is still the required flow.

Keep simulation evidence separate from live integration evidence. Simulation proves typed shape and UI flow; live verification proves persistence, sessions, authorization, and side effects.
