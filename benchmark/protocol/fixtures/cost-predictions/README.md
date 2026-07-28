# Cost-prediction parity fixtures

The production protocol validator schema-validates `cost-predictions.json`, verifies every source-chain byte pin, extracts the P50/P90 rows from the declared Markdown sections, and compares all 8 subject × arm rows without re-estimating them. It also verifies the active zero-observation assertion and monetary-unavailable assertion.

`cases.json` applies each mutation to the valid artifact. Every mutated artifact must fail through the same production validator without a provider or paid call.
