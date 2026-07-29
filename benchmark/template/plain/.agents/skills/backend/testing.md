# Testing

Every behavioral requirement, public operation, and exchanged DTO shape needs executable coverage, and every meaningful assertion needs an owner. A green suite proves only assertions that exist.

Walk forward by requirement, operation, DTO, and actor journey. For behavior, identify the exact assertion that would fail if the named rule disappeared. Then reverse-walk every meaningful assertion to its requirement, operation, shape, or invariant so fixtures and invented behavior cannot masquerade as coverage.

Cover success together with its adjacent negative case, actor authorization and ownership, absent and empty inputs, named thresholds on both sides, forbidden transitions, deletion and recovery, and observable state after each effect. Calling an endpoint proves reachability; a type check proves shape; neither proves business behavior.

<!-- benchmark-template-splice: base-body -->
{{base}}

When a test exposes an implementation, contract, or schema defect, repair the owning layer. Never weaken the assertion to make the suite green.
