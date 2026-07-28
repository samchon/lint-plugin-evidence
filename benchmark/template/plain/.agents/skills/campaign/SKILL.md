---
name: campaign
description: Defines how to work the requirement set to completion, the obligation graph every artifact owes, the campaign that discharges each edge, and how the cascade re-opens work upstream. Use before starting, whenever any artifact changes, and again whenever you believe the work is done.
---

# Campaign

## The Goal

Every requirement stated in `docs/analysis/` must be realized in this repository, and none may be missed.

This is the whole standard. Not most requirements, not the ones that were easy to see, and not the ones a reasonable reader would consider the important ones. A requirement that is omitted is a defect of the same severity as one that is implemented incorrectly, and it is harder to find, because nothing about the repository points at the place where it should have been.

Working code is necessary and not sufficient. A build that compiles, a suite that passes, and a server that starts are all compatible with a requirement nobody implemented.

## What This Costs, And Why You Pay It

The method below is expensive. It reads whole documents you have already read, re-walks artifacts you have already checked, and repeats passes that found nothing the last time. That is the intended shape, not waste to be optimized away.

**A missed requirement costs more than any amount of re-reading.** In practice it ships, and it is found by the person who needed it. Spending far more effort than feels necessary is the correct trade, and you should make it deliberately rather than reluctantly. Do not shorten a pass because the previous one was clean, do not sample a document because it looked familiar, and do not skip an artifact because you wrote it yourself.

If you find yourself reasoning about how to do less of this, you have found the failure mode this document exists to prevent.

## The Obligation Graph

Nothing in this repository can tell you that a requirement is missing. The compiler checks the code that exists; it cannot check the code that should exist. So completeness is yours to establish, and it is established one obligation at a time.

An obligation is a directed edge: the artifact on the right owes an account of every unit on the left.

```
docs/analysis/  ->  database
docs/analysis/  ->  DTO type
docs/analysis/  ->  API operation
docs/analysis/  ->  tests
docs/analysis/  ->  business logic
docs/analysis/  ->  frontend

database        ->  DTO type          (the table it represents)
database        ->  API operation     (the table it exposes)
database        ->  business logic

column          ->  DTO property      (the value it carries)

DTO type        ->  tests             (the shape it exchanges)

API             ->  tests
API             ->  business logic
```

Granularity is part of the edge. A DTO **type** owes a requirement and a table, because it exists for a named concept and represents a row. A DTO **property** owes a column and **not** a requirement, because the question a property answers is where its value comes from. Walking the type level alone leaves every property unaccounted for, and a property with no source is the phantom that reaches the provider with nothing to fill it.

Read each edge as a sentence with a denominator, taking the acknowledger from the edge rather than from habit. "Every requirement section is accounted for by the schema." "Every table is accounted for by an endpoint that exposes it, or by a recorded decision that none does." "Every column is accounted for by the DTO property that carries it." "Every operation is accounted for by a test."

**These edges are the known minimum, not the complete set.** More exist, and finding them is part of the work. Whenever you notice that one artifact silently depends on another, you have found an edge, and it needs a campaign like the rest.

The frontend is not a leaf. Once its folders take shape it grows its own internal graph, with the same reading as every edge above: a screen accounts for the requirements it delivers, for the components it renders, and for the operations it consumes. [Its edge](frontend.md) holds the current set. Treat it as a subgraph, not a single node.

**Keep this graph current.** It is a live description of the repository's dependency structure, not a diagram drawn once. When the frontend takes a concrete shape, when a new artifact kind appears, or when any convention document grows a rule that makes one artifact depend on another, add the edge here in the same change. A graph that lags behind the real structure leaves exactly that difference unchecked, and nothing else in this repository will notice.

## Every Edge Is A Campaign

An edge is not discharged by a glance. It is discharged by a campaign: repeated exhaustive passes over the full population on both sides, until consecutive passes find nothing new.

Each campaign has its own document.

- [requirements.md](requirements.md): reading `docs/analysis/` to exhaustion. Every other campaign depends on this one being real.
- [database.md](database.md): requirements to schema, both directions.
- [api.md](api.md): requirements and schema to the public contract.
- [logic.md](logic.md): requirements, schema, and contract to the implementation.
- [test.md](test.md): requirements, the generated contract, and the DTO shapes to the tests.
- [frontend.md](frontend.md): requirements and contract to the screens, plus the frontend's own subgraph.
- [ledger.md](ledger.md): where campaign state is written down, because none of this survives in your head.

The [review skill](../review/SKILL.md) runs **inside** these rounds rather than after them. It owns the questions a round does not naturally ask: whether the entry you are about to write is true, whether the source you read is itself correct, and whether anything proves it. Read it before the first round, not once they are dry.

## The Cascade

This is the part that decides whether the method works.

**A finding anywhere re-opens every campaign downstream of it.** The graph above is not a checklist you walk once; it is a dependency structure, and dependencies propagate.

Concretely: if a requirements pass finds one section you had not read, that section can imply a table, which implies columns, which implies endpoints, which implies logic, which implies tests, which implies a screen. Every one of those campaigns was previously "dry" and is now not. You re-run all of them, in full, from the top.

The same holds for a smaller change. Add a column and the database-to-API and database-to-logic campaigns re-open. Change an operation's contract and the API-to-tests and API-to-logic campaigns re-open. There is no such thing as a local fix in a graph like this, and treating one as local is how a repository ends up internally inconsistent while every individual change looked correct.

**Never carry a stale "dry" verdict across a change.** A campaign is dry only against the exact state it last ran on. The moment anything upstream moves, that verdict is void, and continuing to rely on it is the same error as trusting a test you never re-ran.

## Loop Until Dry: Unbounded Exhaustive Repetition

Each campaign runs in rounds, and **the number of rounds has no ceiling.**

1. **Read the entire population on both sides of the edge**, exhaustively, from the artifacts themselves rather than from memory or from your own notes about them.
2. Record every finding in the ledger before fixing anything, so a fix cannot quietly erase the record of what was wrong.
3. Fix the findings. A fix upstream re-opens the downstream campaigns; note which ones.
4. **If the round produced even one finding, the entire review starts over from the beginning.** Not the part around the finding. The whole population, read again in full.
5. The campaign stops only when a complete review establishes that **not a single omission remains**, confirmed by **two consecutive complete rounds** producing nothing new.

The cycle is: read everything, find an omission, fix it, then read everything again. Repeat without limit. One clean round means the round was tired; two mean the surface is genuinely quiet. There is no round count at which you are permitted to stop early, and no size of population that makes a partial re-review acceptable.

A round is complete only if it covered the entire population. Sampling is not a round. Checking "the parts that changed" is not a round, because the entire point is to find what you did not know had changed. Reading your own inventory instead of the artifacts is not a round either: it can only confirm what you already recorded, which is the thing under test.

Vary how you look between rounds. Walk the documents in order in one round and walk the artifacts back to the documents in the next. A pass that repeats the previous pass's traversal repeats its blind spots, so two identical passes are one pass counted twice.

**Do not stop because the last several rounds were clean, because the population is large, because the remaining risk feels small, or because the cost feels disproportionate.** Each of those is the reasoning that leaves the one omission in place, and the whole method exists to remove it.

## The Work Is Not Done When The Build Is Green

You have no gate. The build passing means the types line up. The tests passing means the assertions you wrote hold. Neither says anything about the requirement you never read.

You are finished when all of the following hold at once, and you can show the ledger entries that establish each:

- every requirement section maps to the artifacts that realize it, and you read those artifacts rather than assuming them;
- every artifact traces back to a requirement, and anything that does not has a recorded reason to exist;
- every campaign is dry against the current state, with no verdict inherited from before the last change;
- every entry passed the [review skill](../review/SKILL.md) in the round that wrote it, because a filled ledger row and a true one are different things;
- the build, the lint stage, and the tests pass, and you read their output.

Report what you did and what you verified. If any part of the specification is unrealized, say which part and why, rather than reporting completion and leaving it to be discovered.

## Verify Rather Than Assume

Check each claim against the artifact, not against your recollection of writing it. Open the file and read what it does before recording a requirement as realized, and run the build and the tests rather than predicting them.

The review skill owns this in full, including the one check nothing else performs: removing a behavior to confirm the test that names it fails.
