# Generation outcome admission fixtures

The provider-facing `generation-outcome-provider.schema.json` uses only the frozen Structured Outputs keyword allowlist in `provider-output-registry.json`. The production admission check walks every schema node and transitive local `$ref` closure and rejects any other keyword before `turn/start`.

The provider schema deliberately accepts shapes whose cross-field semantics require local adjudication. The production local validator applies `generation-outcome-local.schema.json` and must pass every expected-valid case and reject every expected-invalid case. A provider request rejection, unsupported keyword, or local semantic mismatch fails the run before `t_done`.
