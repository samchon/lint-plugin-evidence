# Testing

Every behavioral requirement, public operation, and exchanged DTO shape needs executable coverage, and every meaningful assertion needs an owner. A green suite proves only assertions that exist.

Read [the test completeness check](../completeness/test.md) before writing tests. Walk by requirement, operation, DTO, and actor journey. For behavior, identify the assertion that would fail if the named rule disappeared.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Mutation Ownership

Do not invent a plain-only mutation schedule. The shared Phase Two method performs exactly one mutation per global round in both arms and proves byte-for-byte restoration.

When a test exposes an implementation, contract, or schema defect, repair the owning layer. Never weaken the assertion to make the suite green.
