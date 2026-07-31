---
name: review
description: Defines the semantic comparison applied inside each complete Campaign review round. Read after the Campaign skill for a review objective.
---

# Review

Apply this comparison while performing the complete round defined by the Campaign skill. It is not a separate pass.

For every relationship, read three things:

1. the source requirement or upstream contract;
2. the artifact claiming to realize it; and
3. the downstream proof or consumer.

The requirement is immutable. Any authored application artifact may be wrong, including an upstream schema or DTO that several later layers consistently copied.

## Questions

For each requirement and artifact, verify:

- the artifact implements the exact actor, circumstance, behavior, value, effect, and refusal;
- the artifact implements the whole applicable requirement rather than an adjacent or partial behavior;
- every stored or returned value has the correct owner, unit, null meaning, and lifecycle;
- every operation exposes all promised effects and authorization boundaries;
- every provider enforces cross-cutting rules everywhere they apply;
- every test would fail if its named behavior disappeared;
- every screen lets the user complete the requirement and handles its stated states and refusals; and
- every browser journey performs the complete flow against the current application.

Do not accept a mapping because names look similar, a checklist row exists, or all layers agree with one another. Reopen the requirement and compare meaning.

An absence or deliberate non-exposure is also a claim. It is valid only when the requirements do not need the artifact and the named alternative or owner actually provides the behavior.

Any correction restarts the complete Campaign round.
