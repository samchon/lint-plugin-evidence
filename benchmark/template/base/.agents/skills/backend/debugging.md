# Debugging

Read [SKILL.md](SKILL.md) first. This document owns what to do when something fails.

The whole discipline is one rule: **assign the failure to its owner before editing anything.** A symptom patch at the wrong layer hides the defect from every layer after it, and it commits the rest of the work to the mistake.

## Collect Before Diagnosing

The exact failing command, its exact output, the stack trace, the request and response if there was one, and the current diff.

Do not debug from memory or from a paraphrase of the error. The line that broke is frequently not the line that is wrong, and the only way to tell is to have the real message in front of you.

## Classify First

| Symptom | Owner |
| --- | --- |
| the schema does not compile, or the client does not generate | the schema |
| a type error where a DTO meets a provider | the contract or the mapping, not the provider body |
| a route returns 404 that should exist | module registration |
| an accessor is missing from the SDK | the same, plus regeneration |
| a runtime failure inside business logic | the provider |
| a test fails on state it did not create | test setup, or the shared database |
| a test fails on a status code | the assertion, which should not pin one |
| the frontend cannot import something | the API package's index exports |
| nothing builds after a dependency change | the toolchain |

## The Diagnoses Worth Knowing

**A cluster of assignment errors inside a hand-built return object** almost always means an existing transformer was ignored. Look for the transformer before fixing the object.

**A missing property on a query result** means it was not selected, not that the client is wrong.

**A field that "does not exist" on a create or select input** is usually a table name written where a relation property name belongs.

**A payload type that collapsed to `never`** comes from a null inside a selection, and the errors it produces appear far from the line that caused them.

**A confusing 401 on the second call** means a connection was created and never authenticated.

**A test that passes alone and fails in the suite** is asserting against global state in a database that is not reset between tests.

## Fix At The Owner

Do not patch a generated file. If the generated output is wrong, the thing that generates it is wrong.

Do not silence a diagnostic. A cast, an ignore comment, `any`, or a widened signature converts a compile error into a runtime defect that surfaces somewhere unrelated.

Do not rewrite a test to avoid a legitimate business behavior. If the test is right and the code is wrong, the code is wrong.

**Do not add a special case for one fixture, one subject, or one project name.** A branch that exists to make one input work is the defect this repository is measured on, and it will be found.

Keep the fix scoped. Repairing one provider is not the moment for a broad refactor of its neighbours.

## When The Owner Is Upstream

A provider that cannot be implemented truthfully from what the contract and the schema give it has found a defect upstream, not a reason to return a plausible value.

Go back to the layer that owns it and fix it there, then let the change flow down. That direction is the cheap one and it is cheapest at the moment you notice.

## Verify The Fix

The originally failing command passes, plus the narrowest check that would catch a regression of the same cause.

When the fix crossed layers, re-run the downstream command that first exposed the problem, not only the one at the layer you edited.

## Done Means

The root cause is at its owner, the original failure no longer reproduces, and no feedback was hidden by a cast, an ignored diagnostic, a weakened test, or an edit to a generated file.
