# Tests lens

Map every acceptance criterion, API operation, DTO shape, database invariant, provider branch, authorization decision, state transition, negative path, and boundary to executed tests. Then walk every authored test and assertion back to the production behavior it can fail.

A test is non-vacuous only when it reaches the relevant production path and a plausible removal or reversal of the required behavior makes its assertion fail. Check disconnected reimplementations, mocks that bypass the contract, assertions on setup rather than outcome, skipped cases, swallowed failures, order dependence, missing persistence and transport depth, and browser tests that never prove the visible result.

Report only concrete omissions, partial implementations, contradictions, semantic defects, or test-oracle gaps with exact criterion and artifact citations.
