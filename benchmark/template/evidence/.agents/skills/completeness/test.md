# Test Check

Read [SKILL.md](SKILL.md) first. The `backend-tests` claim has three independently complete target populations: Markdown H2/H3, generated SDK operations, and authored DTO root types.

## Evidence Placement

Put citations on the exported feature-test function selected by the claim. Markdown reasons identify the behavior and assertion; `{@link}` targets resolve through the test file's imports:

```ts
/**
 * Rejects a second seller coupon at checkout.
 *
 * @evidence docs/analysis/04-orders.md#coupon-stacking Proves the seller-coupon
 *           limit through the rejection assertion.
 * @evidence {@link api.functional.orders.checkout} Invokes the published
 *           checkout operation.
 * @evidence {@link IShoppingOrder} Exercises the returned order shape.
 */
export async function test_coupon_stacking(): Promise<void> {
  // ...
}
```

Do not cite a generated accessor by path text or place tags in generated source. An exclusion must name why this backend suite deliberately does not own the exact target and where the actual proof lives.

## Integrity

The graph proves a target is acknowledged, not that an assertion depends on it. Read each citation against the test body, implementation, and source. Require success, authorization, validation, absence, forbidden transitions, boundaries, and cross-actor journeys as the requirement demands.

Enumerate every exported feature-test function and every meaningful assertion, including selected functions with no tag, and map each back to the exact requirement, operation, DTO shape, or invariant it proves. A test without a reverse owner is invented behavior even when other tests collectively make the graph green.
