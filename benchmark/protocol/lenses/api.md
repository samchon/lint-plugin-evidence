# API lens

Inventory every required API operation and trace it from request validation through authorization, domain logic, transaction and persistence effects, response shape, documented errors, generated client access, frontend use, and tests. Then walk every authored operation, DTO root, and public field back to its requirement and data owner.

Check missing operations, missing or surplus fields, wrong optionality, incorrect status and error behavior, insecure ownership checks, non-atomic writes, stale SDK integration, and tests that bypass the real transport or persistence path.

Report only concrete omissions, partial implementations, contradictions, semantic defects, or test-oracle gaps with exact criterion and artifact citations.
