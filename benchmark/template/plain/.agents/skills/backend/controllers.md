# Operations

Every required public capability needs an authored controller operation, and every operation needs requirement and schema owners. Generated accessors mirror this contract; they do not establish that it is complete.

Map every required public capability to an exact authored operation. Record actor, method, path, authorization, parameters, response, state effects, failures, and exposed models, then reverse-walk every authored operation to those owners.

Verify success and refusal surfaces separately. An operation that exists but omits an actor restriction, required failure, boundary, or state transition is incomplete.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After A Contract Change

Regenerate the SDK and OpenAPI document. Invalidate provider, test, and frontend mappings that depended on the previous contract, and recheck them at the new digest.

If an operation cannot express a requirement because the schema lacks state, repair the database owner. Do not hide the defect in a controller or generated accessor.
