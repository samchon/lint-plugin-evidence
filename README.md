# `@samchon/lint-plugin-evidence`

![Logo](https://ttsc.dev/og-evidence.png)

Moved to [`@ttsc/evidence`](https://github.com/samchon/ttsc). Install that instead.

```bash
npm install -D typescript ttsc @ttsc/lint
npm install -D @ttsc/evidence
```

## Benchmark

![Benchmark](https://raw.githubusercontent.com/samchon/lint-plugin-evidence/master/benchmark/aggregate/summary.svg)

Four subjects, each built twice by Codex `gpt-5.6-luna` — once with the evidence graph active, once without. Sources at [`samchon/evidence-benchmark-results`](https://github.com/samchon/evidence-benchmark-results).

## Concepts

A requirement written in a document must be claimed by the code that satisfies it. The claim names its target and says why it applies.

```tsx
/**
 * @evidence docs/discount.md#coupon-stacking States the per-issuer stacking limit this section defines.
 * @evidence POST:/orders/{orderId}/coupons Explains the rejection this endpoint returns for an over-stacked set.
 */
export function CouponStackingNotice() {
  return <p>One seller coupon and one platform coupon may be combined.</p>;
}
```

Without the citation the build stops:

```bash
$ npx ttsc
error TS16411: [evidence/graph] Missing acknowledgement for
  'docs/discount.md#coupon-stacking' (Markdown H2 'Coupon Stacking' at docs/discount.md:3)
  in Claim 1 reference 1 (markdown, symbols: h2, h3).
```

One declaration can cite several targets, and they are separate obligations. Markdown sections, TypeScript symbols, Prisma models and columns, and OpenAPI operations can all be cited.

Documents cite documents too. A decision in a meeting note becomes a requirement, the requirement becomes a feature spec, the spec becomes code — and every link in that chain is checked. Which artifacts must cite which is declared per project.

Deciding that a requirement does not apply to a layer is legitimate, and `@evidenceExclude` records it: who owns it instead, and what would make the exclusion wrong. "Not applicable" is a conclusion, not a reason. Exclusions live in one ledger file so that reading them does not mean reading the whole repository.

The graph runs both ways. Delete a requirement and whatever cited it breaks, so a spec cannot go stale unnoticed.

An agent can still write a reason that is not true. It cannot leave the requirement unclaimed.
