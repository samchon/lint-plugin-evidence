# API Check

Read [SKILL.md](SKILL.md) first. This check covers requirements and schema to authored DTOs and controller operations, then walks every authored DTO and operation back to both owners.

## Public Contract Ownership

`packages/api/src/structures/**`, `src/diagnosers/**`, and `src/typings/**` are authored contract sources. `packages/backend/src/controllers/**` owns public operation declarations. `packages/api/src/functional/**` and `swagger.json` are generated from those controllers and are consumers for verification, not authored denominator units.

Providers own implementation, not the public API. A provider method does not compensate for a missing controller operation, and a generated accessor does not own the contract it mirrors.

## Forward Walk

For every requirement identity, map each required public capability to the exact controller operation and each required request/response shape to a DTO type and property. Map every persisted model/column that callers must observe or submit to the exact public contract unit that carries it.

Check actor, method, path, authorization, parameters, variants, pagination, state transitions, success response, failures, and property semantics. “The endpoint exists” is not a complete mapping.

## Reverse Walk

Enumerate every authored controller operation, DTO type, and DTO property. Map each operation to requirements and the schema it exposes; map each root DTO to requirements and relevant models; map each DTO property to the exact source column or documented derivation. Internal-only storage receives a reasoned non-exposure entry.

Regenerate the SDK after a controller, DTO, or public JSDoc change and inspect the generated accessor/OpenAPI shape. A contract change invalidates provider, test, and frontend mappings.
