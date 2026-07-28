# ERP dual-denominator fixtures

These fixtures prove that ERP's 1,724 acceptance criteria and 986 context criteria remain separate.

| Fixture | Schema | Expected |
| --- | --- | --- |
| `valid-context-criterion.json` | `schema/context-criterion.schema.json` | pass |
| `invalid-context-with-acceptance-id.json` | `schema/context-criterion.schema.json` | fail |
| `grade-cases.json` case `valid-exact-populations` | `schema/grade.schema.json` plus catalog reconciliation | pass |
| every other `grade-cases.json` case | `schema/grade.schema.json` plus catalog reconciliation | fail with the named code |

CI validates each file against the production schema loader. It also copies the frozen ERP corpus to a temporary directory and proves the production corpus validator rejects a blank JSONL record; primitive `null`, `false`, `0`, and `""` records in each of the acceptance, context, and link inventories; and primitive schema or manifest roots. Fixtures never edit the frozen corpus in place.

The grade fixture runner builds the valid grade from every exact ID in the two frozen catalogs; a one-row representative cannot stand in for an ERP grade. It then derives each invalid case from a temporary copy. The production validator requires 1,724 unique acceptance IDs and 986 unique context IDs, exact equality with their catalogs, separate reconciled status summaries, and zero cross-population references. Accepting any invalid case blocks ERP launch.
