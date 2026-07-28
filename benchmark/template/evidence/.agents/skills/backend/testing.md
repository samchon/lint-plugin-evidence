# Testing

The suite answers to three upstream sources, and the build checks that it acknowledges all of them.

Every configured requirement section, every operation, and every DTO type must be acknowledged by a test that claims to verify it. The lint stage fails until they are, so an endpoint nobody tested, a rule nothing exercises, and a shape nothing ever built or read are compile errors rather than gaps someone has to notice.

```ts
/**
 * Verify that two coupons of the same kind cannot be combined.
 *
 * @evidence docs/analysis/04-business-rules.md#coupon-stacking Attempts the
 *           forbidden combination and asserts the refusal.
 * @evidence {@link api.functional.shopping.customer.order.create} Exercises
 *           the operation where the combination is rejected.
 */
export async function test_api_order_coupon_stacking_is_refused(
  connection: api.IConnection,
): Promise<void> {
  // the setup, the attempt, and the refusal assertion
}
```

**The operation citation is a `{@link}` to the accessor**, resolved through this file's own `api` import, so it is an ordinary TypeScript symbol: a renamed operation breaks the citation instead of leaving a path string that quietly resolves to nothing.

Read [the evidence skill](../evidence/SKILL.md) before starting.

{{base}}

## A Citation Is Not Coverage

This is the layer where the gap between the build's report and the truth is widest, and it is worth stating plainly.

The build checks that a test cites the requirement. It cannot check that the test would fail if the requirement stopped holding. A test that calls the operation, asserts the response validates against its type, and cites the rule satisfies every obligation and proves nothing.

So the standard here is unchanged by the gate: **the test that would fail if the behavior were removed.** Write the assertion that has that property, then cite it.

Periodically prove it directly. Take a requirement that matters, remove the behavior, confirm the test fails, restore it. The build will never tell you to do this.

## One Citation Satisfies The Obligation

A rule applying across several operations is discharged by the first test that cites it, and the build goes quiet. The remaining operations still need their own tests, and nothing will report their absence.

Walk by actor as well as by operation, following each actor through every journey end to end. The build checks the endpoints; the journey is what finds the flow that works step by step and breaks in sequence.

## After Any Failure

A failing assertion sends you to the layer that owns the defect, usually the provider, sometimes the contract.

**Never weaken an assertion, and never retarget its citation, to reach green.** Both make the report quiet while the defect stays. The suite exists to fail, and the citation exists to say what the failure would have been about.
