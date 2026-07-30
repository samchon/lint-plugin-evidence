# Operations

This layer answers to two upstream sources at once, and they find different defects.

Every requirement that describes something a user does needs an operation that lets them do it. Every table and column needs an operation that reads or writes it, or a recorded decision that none does. A contract can cover every requirement while leaving half the schema unreachable, and it can expose every table while satisfying no requirement.

**Nothing checks either direction for you.** A contract that compiles and regenerates the SDK cleanly is a well-formed contract, not the right one.

Read [the campaign skill](../campaign/SKILL.md) and [its API edge](../campaign/api.md) before starting. That edge has four walks, not two, and skipping the backward ones is how an invented endpoint acquires invented semantics that the logic and the tests then honor.

<!-- benchmark-template-splice: base-body -->
{{base}}

## After Any Contract Change

Regenerating the SDK is the first step, not the last. The change re-opens three campaigns.

- **The test campaign**, because what the tests must prove has moved. A new rejection needs a test that attempts it; a changed response shape changes every assertion against it.
- **The logic campaign**, because the provider implements this contract and its effects.
- **The frontend campaign**, because a screen consumes these operations and a changed contract can leave it reading a field that no longer exists.

Record the re-opening in the ledger as you make the change.

## When The Contract Cannot Express It

If a requirement needs an operation you cannot design because the schema has no state for it, the finding belongs to the database campaign. Fix it there.

Adding a column from here to make an operation designable is the workaround that hides the defect from every layer after it, and it commits the rest of the work to a schema decision nobody reviewed.
