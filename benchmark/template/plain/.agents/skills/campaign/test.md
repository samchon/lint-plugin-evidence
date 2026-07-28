# Test Campaign

Read [SKILL.md](SKILL.md) first. This campaign discharges three edges: `docs/analysis/ -> tests`, `API -> tests`, and `DTO type -> tests`.

## Why Three Edges

Each denominator finds what the other two cannot, so walking one and calling it done leaves the other two unmeasured.

**The API edge** produces a suite with one test per endpoint. On its own that proves the endpoints exist.

**The requirements edge** is what makes the suite prove the product. Many requirements are not one endpoint: a rule that spans operations, a journey that crosses several, a constraint that must hold after an unrelated action. None of them appear when you walk the route tree, and all of them are requirements.

**The DTO edge** is the one people forget, because a type feels like something the compiler already handles. It does not handle whether anything ever exercised the shape. A variant no test ever builds or reads is a shape that has never been exercised end to end, and the two ways that happens are both defects: either an operation returns it and nothing tested that operation, or nothing returns it at all and it should not exist.

## Requirements To Tests

For every requirement in the inventory, name the test that would fail if the requirement stopped holding.

That framing is the whole campaign. Not "the test that covers it" but "the test that would fail", because a test that passes whether or not the behavior exists covers nothing.

- A rule that permits something needs a test that exercises it.
- A rule that forbids something needs a test that attempts it and asserts the refusal. This is the half that is routinely missing, because the application appears to work without it.
- A threshold needs tests on both sides of it.
- A visibility rule needs a call from the actor who may see and one from the actor who may not.
- A retention rule needs a test that mutates the source and reads the retained value afterwards.

Then walk backward. Every test names the requirement it proves. A test that only asserts a response validates against its type proves the framework works, and it should either grow a business assertion or be deleted.

## Contract To Tests

For every operation, name the tests that exercise it: the success path, each rejection its contract states, and each authorization boundary.

Then check what the test actually asserts. The contract states effects beyond the response, and those are the ones no one asserts: the membership that should now exist, the history row that should have been written, the state that should have transitioned. Read the effect back through a public operation and assert it.

## Shapes To Tests

The third denominator is the export list of `packages/api/src/structures`: every root DTO type, none missing.

For each, name the test that builds its creation or request variant and the test that reads its response shape back. A shape no test ever built or read has never been exercised end to end, and the two ways that happens are both findings: an operation returning it that nothing tested, or a type nothing returns at all, which belongs to the API campaign as an invented artifact.

## What A Finding Here Is Not

[The testing topic](../backend/testing.md) owns how a test is written: what it may assert, what it must never assert, and which shortcuts look like coverage. A round that turns up a test breaking one of those rules has found a defect in that test, not a gap in coverage, and the two go in different places in the ledger.

The distinction matters because they resolve differently. A coverage gap is closed by writing a test. A test that pins a status code, fabricates an identifier, or asserts nothing beyond the response type is closed by fixing the test that already exists, and counting it as coverage is how a campaign reports dry over a suite that proves nothing.

## Rounds

A round is a complete pass over all three denominators, each from its enumeration source rather than from memory: every requirement in the inventory by its identifier, every accessor in the `api.functional` export tree, and every root type in the `structures` export list.

Any finding resets the count. Dry after **two consecutive complete rounds** with nothing new.

Vary the traversal. Walk by requirement in one round; by operation in the next; by actor in a third, following each actor through every journey the documents give them end to end. The actor traversal finds the journey that works step by step and breaks when performed in sequence by one person.

A fourth pass measures rather than traverses: remove a behavior and see whether a test fails. [The review skill](../review/SKILL.md) owns it and says when to run it. Run it here on the rules the product cannot be wrong about, because this is the edge where a passing suite is most easily mistaken for a proven one.

## The Cascade

**Into here:** requirements findings and contract changes both re-open this campaign in full. A logic change re-opens it too, because what the tests must prove has moved.

**Out of here:** a test finding usually means a defect in the implementation, which sends you to the logic campaign. Sometimes it means the contract cannot express what the requirement needs, which sends you further up. Fix it at the layer that owns it rather than weakening the test.

Never weaken an assertion to make a suite green. The suite exists to fail.

## Exit

Dry when two consecutive complete rounds find nothing new, every requirement names a test that would fail without it, every accessor has its success path and every stated rejection covered, every root shape is built and read by some test, and every test names the requirement it proves.

A green suite proves the assertions you wrote hold. It says nothing about the requirement you never read.
