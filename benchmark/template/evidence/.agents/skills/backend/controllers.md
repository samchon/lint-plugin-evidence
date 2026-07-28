# Operations

This layer answers to two upstream sources at once, and the build checks both.

Every configured requirement section must be acknowledged by an operation that claims to realize it, and every selected model must be acknowledged by an operation that claims to expose it. The lint stage fails until both hold, so a requirement nobody built an endpoint for and a table nothing reaches are compile errors rather than things you must notice.

```ts
/**
 * List the seller's own sales.
 *
 * @evidence docs/analysis/03-functional-requirements.md#browse-sales Serves the
 *           catalog browsing journey, including the visibility rule for each actor.
 * @evidence prisma:shopping_sales Exposes the sale identity and its lifecycle
 *           state to the actors permitted to see it.
 */
@core.TypedRoute.Patch()
public async index(
  @SellerAuth() seller: SellerPayload,
  @core.TypedBody() input: IShoppingSale.IRequest,
): Promise<IPage<IShoppingSale.ISummary>> {
  return ShoppingSaleProvider.index({ actor: seller, input });
}
```

The block is shortened to the two tags. The published documentation this method owes is unchanged and lives beside them.

Write the citations when the stub is born. They cite the contract, which is complete before realize, so nothing about a citation waits for a provider; the `@todo` beside them is the one tag realize removes. The build reports every tag still standing, so realize's finish line is a diagnostic rather than a discipline.

A declaration may carry several citations, and each is judged independently. Cite the requirement this operation serves and the model it exposes, and say which part of each it is responsible for.

Read [the evidence skill](../evidence/SKILL.md) before starting, especially the section on discharging a diagnostic at the layer that owns it.

{{base}}

## When The Diagnostic Points Here But The Hole Is Upstream

This is the layer where that happens most, so read the message carefully before adding anything.

**An operation that has nothing to cite is usually not an operation missing a tag.** It is a requirement with no storage, so there is no model to point at. The build names this layer because the obligation was declared here; the repair belongs to the schema.

Ask the question before writing a citation. Is there a table for this requirement? If not, go add it, and let the build re-run. One upstream repair commonly clears several diagnostics here at once, and it clears them correctly.

Writing a citation at this layer when the hole is upstream produces a green build over a repository that still does not satisfy the requirement. Nothing later finds that, because a citation the build accepts is a claim the build believes.

## After Any Contract Change

Regenerate the SDK and run the build. A changed response shape can leave a test's citation dangling and a screen's citation resolving to something that no longer means what it did.

Never narrow the graph configuration to make a diagnostic stop. An edge that is not configured is not checked, and removing an obligation is the one repair that leaves no trace of what it hid.
