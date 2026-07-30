# Testing

The suite answers to three upstream sources, and only one of them is visible from the route tree.

Every operation needs its success path and each rejection its contract states. That much you can find by walking the SDK. Every DTO shape needs a test that has built or read it, which the route walk shows only indirectly. And many requirements are not one endpoint at all: a rule spanning operations, a journey crossing several, a constraint that must hold after an unrelated action. None of those appear when you walk the routes, and all of them are requirements.

**Nothing tells you which requirement has no test.** A green suite proves the assertions you wrote hold. It says nothing about the requirement you never read.

Read [the campaign skill](../campaign/SKILL.md) and [its test edge](../campaign/test.md) before starting. The framing that matters there is not "the test that covers this requirement" but **the test that would fail if the requirement stopped holding**, because a test that passes either way covers nothing.

<!-- benchmark-template-splice: base-body -->
{{base}}

## The Traversal That Finds What The Others Miss

Walking by operation finds missing endpoint coverage. Walking by requirement finds missing rules. Walking by actor, following each one through every journey the documents give them as one continuous session, finds the flow whose every step works and whose sequence does not.

Run all three as distinct walks inside one indivisible campaign round. None substitutes for another.

## Prove The Suite Proves Something

Periodically, take a requirement that matters, remove the behavior implementing it, and confirm a test fails. Then restore it.

This is the only direct measurement of whether the suite is doing its job, and it is worth its cost on the rules the product cannot be wrong about. Record the result in the ledger, because a suite that passed this check last month and has been edited since has not passed it.

## After Any Test Finding

A failing assertion usually means a defect in the implementation, which sends you to the campaign's logic dimension. Sometimes it means the contract cannot express what the requirement needs, which sends you further up.

Fix it at the layer that owns it. **Never weaken an assertion to make the suite green.** The suite exists to fail.
