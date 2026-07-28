# Verification

The browser suite is in the graph. Every configured requirement journey must be acknowledged by a spec that claims to walk it, and the lint stage fails until it is.

The exported journey function is the host, which is why the export pattern is not optional here: a tag is read from a JSDoc block on a declaration, and a flow living only inside a `test()` callback has no declaration to carry one.

```ts
/**
 * @evidence docs/analysis/03-functional-requirements.md#checkout Walks the
 *           checkout journey end to end as the customer performing it.
 * @evidence {@link CheckoutPage} Traverses this screen for payment entry and
 *           the order confirmation it renders.
 */
export async function journey_customer_checkout(page: Page): Promise<void> {}
```

Read [the evidence skill](../evidence/SKILL.md) before starting.

{{base}}

## What The Claim Selects, And What It Leaves Alone

A journey also cites each screen it traverses, as `{@link ThatPage}` resolved through its own type-only import; the page components are a reference population of the journey claim, so a screen no journey walks is a build failure rather than a review discovery.

The claim covers `tests/journeys/**`. The ui-review spec, the readme spec, the state gallery, and the fixtures carry no citations: they verify presentation, not requirements, and a tag there would acknowledge a section from an artifact that cannot prove it.

## A Walked Citation Is Still Only A Claim

The build proves a spec cites the journey. Whether the spec performs the journey the section describes, at the widths and through the refusals it names, is what the citation's reason asserts and what [the review skill](../review/SKILL.md) reads it against.

The reason states what the walk covers, phrased to be visibly false if a step is missing. A spec that opens the page and cites the whole journey is the frontend's version of the test that asserts a response type and cites a business rule.
