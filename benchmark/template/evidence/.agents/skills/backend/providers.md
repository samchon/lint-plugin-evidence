# Providers

The implementation answers to three upstream sources, and the build checks that it acknowledges all of them.

Every configured requirement section, every selected model, and every operation must be acknowledged by the provider that claims to implement it. The lint stage fails until they are.

```ts
/**
 * @evidence docs/analysis/04-business-rules.md#coupon-stacking Enforces the
 * combination limit before a discount is applied.
 * @evidence prisma:shopping_coupons Reads the coupon and its criteria.
 */
export const apply = async (props: {}) => {};
```

Read [the campaign skill](../campaign/SKILL.md) before starting.

{{base}}

## The Citation Is A Claim About Behavior, Not About Presence

This layer is where a citation is easiest to write and hardest to justify.

A tag saying a provider enforces a rule is a claim that the code enforces it. The build cannot check that; a reviewer comparing the two can, and will. So write the reason as which part of the rule this function is responsible for, and make it a sentence that would be visibly false if the code did not do it.

**Cite from the function that does the work.** A tag on a wrapper that delegates records the wrong location, and the next reader looking for the enforcement finds a pass-through.

**A cross-cutting rule needs a citation everywhere it applies.** One citation satisfies the obligation, so the build goes quiet after the first. That is exactly why the remaining ten places are the ones that get missed here: the report stops before the work does.

## When The Diagnostic Points Here But The Hole Is Upstream

A provider that cannot cite a rule is often a provider whose schema has no state for that rule. Check before writing the tag: does the schema hold what the rule needs? If not, the finding belongs to the database campaign.

Fix it there and let the build re-run.

## The Build Cannot See These

A green lint stage means every obligation is acknowledged. It says nothing about whether the acknowledgement is true.

- A default that means the opposite of unset.
- An aggregate over the wrong side of a relation.
- An effect implemented in create and not in update.
- A visibility filter present on ten reads and absent on the eleventh.

Every one of those can carry a valid citation and pass every check. After any substantial piece of work, ask what null means for each field here, which direction each relation aggregates, and what the code does in the case the requirement calls out.

This is the layer where a reason is easiest to write and hardest to keep true, because a provider's citation claims a behavior rather than a shape, and behavior drifts without changing anything a checker inspects. The [review skill](../review/SKILL.md) reads each of these reasons against the code that is there now.
