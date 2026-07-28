# Verification

The `frontend-journeys` claim selects exported functions under `tests/journeys/**` and independently references Markdown H2/H3 sections and page functions. Read [the frontend completeness check](../completeness/frontend.md) first.

```ts
/**
 * @evidence docs/analysis/03-functional-requirements.md#checkout Completes the
 *           customer checkout and observes the resulting order.
 * @evidence {@link CheckoutPage} Traverses payment entry and confirmation.
 */
export async function journey_customer_checkout(page: Page): Promise<void> {}
```

The page `{@link}` resolves through an import in the journey file. Presentation-only specs and fixtures are outside this claim; do not use them to acknowledge functional requirements.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Structural And Behavioral Meaning

The graph proves a journey function cites a requirement and page. It does not prove that the browser performs every required step, refusal, viewport, or live side effect. Review the walk itself and keep simulation and live-integration verdicts separate.
