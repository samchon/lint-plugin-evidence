# Operations

Every required public capability needs an authored controller operation, and every operation needs requirement and schema owners. Generated accessors mirror this contract; they do not establish that it is complete.

Read [the API completeness check](../completeness/api.md) before declaring stubs. Record actor, method, path, authorization, parameters, response, failures, and exposed models in the manual ledger, then walk every authored operation back to those owners.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Contract Change

Regenerate the SDK and OpenAPI document. Invalidate provider, test, and frontend mappings that depended on the previous contract, and recheck them at the new digest.

If an operation cannot express a requirement because the schema lacks state, repair the database owner. Do not hide the defect in a controller or generated accessor.
