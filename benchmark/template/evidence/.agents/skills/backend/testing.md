# Testing

The `backend-tests` claim selects exported feature-test functions and independently references Markdown H2/H3 sections, generated SDK operations, and authored DTO root types. Read [the test completeness check](../completeness/test.md) first.

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

<!-- benchmark-template-splice: base-body -->
{{base}}
