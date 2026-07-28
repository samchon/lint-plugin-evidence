# Cost-prediction parity fixtures

The production protocol validator schema-validates `cost-predictions.json`, verifies every source-chain byte pin, extracts the P50/P90 rows from the declared Markdown sections, and compares all 8 subject × arm rows without re-estimating them. It also verifies the active zero-observation assertion and monetary-unavailable assertion.

`cases.json` applies each mutation to the valid artifact and corrupts one JSON artifact and one Markdown source with invalid UTF-8. `block-plan-parity.json` proves a plan cannot collapse `t_done` and `t_dry`, change their explicit units, change subject-arm identity, or drift from the selected row. Every invalid case fails through the same production validator without a provider or paid call.
