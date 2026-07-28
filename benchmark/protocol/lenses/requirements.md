# Requirements lens

Traverse every frozen acceptance criterion in source order and group it by its owning `REQ-*`, H2 ancestry, tables, matrices, enumerations, numeric and temporal limits, state lists, errors, negative cases, and boundaries.

For each criterion, locate every database, API, backend, frontend, integration, and test surface it requires. Check exact inclusive and exclusive boundaries, zero and empty cases, duplicate submissions, invalid transitions, ownership changes, pagination edges, and interactions between rules.

Do not treat a heading, comment, citation, route name, type declaration, or test title as implementation. Trace the behavior to executable code, persisted state, rendered output, and a non-vacuous assertion where the criterion calls for them.

Report only concrete omissions, partial implementations, contradictions, semantic defects, or test-oracle gaps with exact criterion and artifact citations.
