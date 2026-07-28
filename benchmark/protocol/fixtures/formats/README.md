# Format fixtures

Production schema validation must enable the JSON Schema `date-time` format. The launch gate also runs `cases.json` through the same validator and requires every `valid` value to pass and every `invalid` value to fail. Schema compilation with formats disabled is only a structural check and cannot satisfy this gate.
