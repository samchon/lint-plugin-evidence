# Multi-Module ERP Product Requirements

This analysis defines one organization-scoped ERP product across identity, accounting, procurement, inventory, sales, HR, payroll, budgeting, assets, manufacturing, quality, maintenance, service, approvals, audit, and reporting.

- [Corpus contract and grading denominator](00-corpus-contract.md)
- [Actors, authentication, memberships, and authority](01-actors-and-auth.md)
- [Business concepts, relationships, and lifecycles](02-domain-model.md)
- [Actor-visible operations, reports, and journeys](03-functional-requirements.md)
- [Validations, policies, exceptions, and refusals](04-business-rules.md)
- [Product-visible integrity, privacy, continuity, and delivery outcomes](05-non-functional.md)

The complete directory is one frozen benchmark input. `acceptance-criteria.jsonl` is the exhaustive atomic H3 product-quality denominator, `context-criteria.jsonl` separately inventories H2 integration context, `requirement-links.jsonl` is the H2 navigation graph, `acceptance-criteria.schema.json` fixes both row shapes, and `corpus-manifest.json` fixes counts and content hashes. Run `node docs/analysis/validate.mjs` after materialization and before implementation.
