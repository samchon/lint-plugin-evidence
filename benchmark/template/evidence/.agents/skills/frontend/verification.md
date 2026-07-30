# Verification

The `frontend-journeys` claim selects exported functions under `tests/journeys/**` and independently references Markdown H2/H3 sections and page functions. The following declaration excerpt demonstrates tag placement only; the base Verification skill still owns the complete browser interaction.

```ts
/**
 * @evidence docs/analysis/03-functional-requirements.md#checkout Completes the
 *           customer checkout and observes the resulting order.
 * @evidence {@link CheckoutPage} Traverses payment entry and confirmation.
 */
export async function journey_customer_checkout(page: Page): Promise<void> {}
```

The page `{@link}` resolves through an import in the journey file. Presentation-only specs and fixtures are outside this claim; do not use them to acknowledge functional requirements.

## Excluding A Requirement Or Page From Journeys

Put `@evidenceExclude` on `packages/frontend/tests/journeys/JOURNEY_EVIDENCE_EXCLUDE.ts` when `frontend-journeys` intentionally does not verify a configured requirement or traverse a selected page. Use a path target for Markdown and a braced `{@link PageName}` target for a page imported into the carrier file.

```ts
import type { AdminRedirectPage } from "../../src/components/admin/admin-redirect-page";

/**
 * @evidenceExclude docs/analysis/04-business-rules.md#ledger-reconciliation
 *                  Backend reconciliation tests own this server-only invariant;
 *                  reject this exclusion if a browser can trigger or observe it.
 * @evidenceExclude {@link AdminRedirectPage}
 *                  The authentication bootstrap owns this redirect-only page;
 *                  reject this exclusion if the page gains an interaction.
 */
export const JOURNEY_EVIDENCE_EXCLUDE = true;
```

[Evidence Lint](../evidence/SKILL.md) owns the common exclusion rules. This carrier settles only `frontend-journeys`; every other claim remains independent. [Review](../review/SKILL.md) owns the phase-scoped `@todo` search.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Structural And Behavioral Meaning

The graph proves a journey function cites a requirement and page. It does not prove that the browser performs every required step, refusal, viewport, or live side effect. Review the walk itself and keep simulation and live-integration verdicts separate.
