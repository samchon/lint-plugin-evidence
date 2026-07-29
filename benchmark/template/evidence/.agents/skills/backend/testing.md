# Testing

The `backend-tests` claim selects exported feature-test functions and independently references Markdown H2/H3 sections, generated SDK operations, and authored DTO root types.

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

TypeScript targets are `{@link}` references resolved through imports in the test file. A call proves reachability and a type check proves shape; the requirement citation is true only when an assertion would fail if the named behavior disappeared.

## Excluding A Requirement, Operation, Or DTO From Backend Tests

Put `@evidenceExclude` on a selected exported feature-test function when `backend-tests` intentionally does not verify a configured requirement, generated SDK operation, or DTO root type. Use the path target for Markdown and the braced inline-link target for TypeScript. The linked symbol must be imported into the test file; the braces are required.

```ts
import api, { type IShoppingSale } from "{{apiPackageName}}";

/**
 * @evidenceExclude docs/analysis/05-user-experience.md#responsive-grid
 *                  Frontend viewport journeys own this presentation behavior;
 *                  reject this exclusion if the server varies the response.
 * @evidenceExclude {@link api.functional.health.get}
 *                  The deployment probe owns liveness verification; reject
 *                  this exclusion if health gains product-visible behavior.
 * @evidenceExclude {@link IShoppingSale}
 *                  No backend feature exchanges this presentation projection;
 *                  reject this exclusion when an operation returns the type.
 */
export async function test_health_boundary(): Promise<void> {}
```

An exclusion is claim-local: it does not discharge frontend journeys or any other backend claim. An H2, namespace, or type target covers its selected descendants, so use the narrowest target and keep evidence and exclusion scopes disjoint within each claim-reference obligation. The reason must name the actual owner and a condition that would veto the omission; lack of a test is not itself a reason.

<!-- benchmark-template-splice: base-body -->
{{base}}
