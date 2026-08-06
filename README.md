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
 * @evidence docs/discount.md#coupon-stacking Renders the combination limit defined by this rule.
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

Which artifacts must claim which requirements is declared per project — components against a spec, tests against exports, documents against documents.

An agent can still write a reason that is not true. It cannot leave the requirement unclaimed.
