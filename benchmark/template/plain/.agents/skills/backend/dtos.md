# DTOs

At type granularity, every authored root DTO maps to requirement sections and relevant models. At property granularity, every property maps to exact source columns or a documented derivation, and every caller-visible column reaches an appropriate public variant.

Read [the API completeness check](../completeness/api.md) before writing DTOs. Record both forward and reverse populations; a compiled property with no source is still a phantom.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Derived Values

Document a derivation precisely enough to check it against the transformer, including every source column and filter. “Computed” is not a derivation.

After a DTO change, regenerate the SDK and invalidate transformer/provider, test, and frontend mappings that depend on the previous shape. Structures, diagnosers, and typings are authored; functional accessors and `swagger.json` are generated.
