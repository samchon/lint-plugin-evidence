---
name: method
description: Defines how to work the requirement set to completion and how the build establishes that no requirement was missed. Use before starting and again whenever you believe the work is done.
---

# Method

## The Goal

Every requirement stated in `docs/` must be realized in this repository, and none may be missed.

This is the whole standard. Not most requirements, not the ones that were easy to see, and not the ones a reasonable reader would consider the important ones. A requirement that is omitted is a defect of the same severity as one that is implemented incorrectly, and it is harder to find, because nothing about the repository points at the place where it should have been.

Working code is necessary and not sufficient. A build that compiles, a suite that passes, and a server that starts are all compatible with a requirement nobody implemented.

## The Mechanism

The build checks completeness for you. Every requirement section under `docs/` is an obligation, and the lint stage fails until some artifact in this repository acknowledges it by name. So a missed requirement is a compile error rather than something you must notice, and the discipline below is about making that check say something true.

## Cite What You Implement

An artifact that realizes a requirement carries an `@evidence` tag naming the requirement and stating why it applies.

```ts
/**
 * @evidence docs/discount.md#coupon-stacking Enforces the combination limit
 * defined by this rule.
 */
export function applyCouponStacking() {}
```

The target is exact: a document path and a section anchor, a `prisma:Model` address, or an operation such as `POST:/sales`. The prose after it is for a reviewer, not for the compiler.

- **Cite the requirement the artifact actually realizes.** A citation is a claim you are making about your own work, and it sits permanently beside the code, where a reviewer can compare the two.
- **Cite from the artifact that does the work.** A tag on a wrapper that delegates elsewhere records the wrong location.
- **Write a reason that would survive review.** "Implements this section" restates the tag; state which part of the section this artifact is responsible for.

## Declare What You Deliberately Do Not Use

When a claim genuinely does not apply to a requirement, record that decision with `@evidenceExclude` and a reason.

```ts
/**
 * @evidenceExclude docs/discount.md#coupon-stacking This module renders
 * totals and never combines coupons.
 */
```

An exclusion is a reviewed decision, not a way to silence the build. Reach for it when the requirement belongs to a different artifact, never when you have not implemented it yet.

## Read The Diagnostics Rather Than Working Around Them

A failing evidence diagnostic names the requirement, the claim that owes it, and the repair. It is the specification telling you what is still missing.

- **Implement the requirement, then cite it.** The order matters: a citation added to make the build pass, on an artifact that does not do the work, converts a true report into a false one.
- **Never delete, retarget, or exclude a citation to reach green.** Each of those turns a real finding into a silent gap, and the gap is exactly what this check exists to prevent.
- **A dangling citation is also a failure.** If a target no longer resolves, the document changed or the address is wrong; fix whichever is actually wrong.

## Verify Rather Than Assume

Check each claim against the artifact, not against your recollection of writing it.

- Open the file and read what it does before citing a requirement as realized.
- Run the build and the tests, and read their output.
- Confirm that a test asserting a requirement fails when the behavior is removed. A test that passes either way proves nothing about the requirement it names.

## When You Are Finished

You are finished when the build passes with no evidence diagnostic, every citation names work the artifact genuinely does, every exclusion records a decision a reviewer would accept, and the tests pass.

Report what you did and what you verified. If any part of the specification is unrealized, say which part and why, rather than reporting completion and leaving it to be discovered.
