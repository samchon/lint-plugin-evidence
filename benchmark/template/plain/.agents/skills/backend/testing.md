# Testing

Every behavioral requirement, public operation, and exchanged DTO shape needs executable coverage, and every meaningful assertion needs an owner. A green suite proves only assertions that exist.

Read [the test completeness check](../completeness/test.md) before writing tests. Walk by requirement, operation, DTO, and actor journey. For behavior, identify the assertion that would fail if the named rule disappeared.

<!-- benchmark-template-splice: base-body -->
{{base}}

When a test exposes an implementation, contract, or schema defect, repair the owning layer. Never weaken the assertion to make the suite green.
