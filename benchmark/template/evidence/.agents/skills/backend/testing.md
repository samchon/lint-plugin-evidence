# Testing

The `backend-tests` claim selects exported feature-test functions and independently references Markdown H2/H3 sections, generated SDK operation functions, and authored DTO root types. The following excerpt demonstrates tag placement only; the base Testing skill still requires a complete scenario and business assertion.

```ts
/**
 * Rejects two seller coupons at checkout.
 *
 * @evidence docs/analysis/04-business-rules.md#coupon-stacking Proves the
 *           same-kind rejection with a failing request assertion.
 * @evidence {@link api.functional.orders.checkout} Invokes the published
 *           checkout operation.
 * @evidence {@link IShoppingOrder} Exercises the returned order shape.
 */
export async function test_coupon_stacking(): Promise<void> {
  // ...
}
```

SDK operation and DTO targets are `{@link}` references resolved through imports in the test file. A call proves operation reachability and a type check proves shape; the requirement citation is true only when an assertion would fail if the named behavior disappeared.

## Excluding A Requirement, Operation, Or DTO From Backend Tests

Collect `backend-tests` exclusions on the exported const in `packages/backend/test/features/TEST_EVIDENCE_EXCLUDE.ts`. The const is a claim-local carrier rather than a test owner; keep truthful `@evidence` on selected feature-test functions. Use the path target for Markdown and the braced inline-link target for TypeScript. The linked symbol must be imported into the carrier file; the braces are required.

```ts
import type { HttpError } from "{{apiPackageName}}";

/**
 * @evidenceExclude docs/analysis/05-user-experience.md#responsive-grid
 *                  Frontend viewport journeys own this presentation behavior;
 *                  reject this exclusion if the server varies the response.
 * @evidenceExclude {@link HttpError.prototype.toJSON}
 *                  The inherited Nestia SDK dependency owns this transport
 *                  serializer; reject this exclusion if authored behavior or
 *                  a requirement begins specifying its serialization.
 */
export const TEST_EVIDENCE_EXCLUDE = true;
```

An authored DTO root that no backend feature constructs or reads is an invented or untested contract finding, not an exclusion reason.

[Evidence Lint](../evidence/SKILL.md) owns the common exclusion rules. This carrier settles only `backend-tests`; every other claim remains independent.

<!-- benchmark-template-splice: base-body -->
{{base}}
