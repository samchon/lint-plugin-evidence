---
name: campaign
description: Defines how to realize the complete requirement set through one indivisible campaign round over every applicable artifact and relationship. Read in full at the start of every Plain objective, after any artifact changes, and before reporting a phase complete.
---

# Campaign

## The Goal

Every requirement stated in `docs/analysis/` must be realized in this repository, and none may be missed or supplemented with invented behavior.

The requirement documents are immutable inputs. Accept them as the specification; do not edit, challenge, reinterpret, validate, or repair them. Review only the application's realization of those requirements.

Working code is necessary and not sufficient. A build that compiles, a suite that passes, and a server that starts are all compatible with a requirement nobody implemented.

An exhaustive round rereads familiar material and restarts after a finding. Do not shorten it, sample it, or carry an earlier verdict forward; a missed requirement is the failure this method exists to prevent.

Every Plain objective begins with a fresh complete read of this skill. A read, ledger, inventory, or verdict from an earlier objective is context only and never discharges the current objective.

## The Obligation Graph

Nothing in the repository can report a required artifact that does not exist. Completeness is established one obligation at a time: the artifact on the right owes an account of every applicable unit on the left.

```
docs/analysis/  ->  database
docs/analysis/  ->  DTO type
docs/analysis/  ->  API operation
docs/analysis/  ->  tests
docs/analysis/  ->  browser tests
docs/analysis/  ->  business logic
docs/analysis/  ->  frontend

database        ->  DTO type          (the table it represents)
database        ->  API operation     (the table it exposes)
database        ->  business logic

column          ->  DTO property      (the value it carries)

DTO type        ->  tests             (the shape it exchanges)

API             ->  tests
API             ->  business logic
API             ->  frontend          (the operations its screens consume)

requirement     ->  screen
component       ->  screen
SDK operation   ->  screen
journey         ->  browser spec
screen          ->  browser spec
```

Granularity is part of the edge. A DTO type owes a requirement and a table because it represents a named concept. A DTO property owes a column or derivation because it carries a value. Inspecting only the type level leaves properties unaccounted for.

These edges are the known minimum. Whenever one artifact silently depends on another, add that relationship to the current population recorded in the campaign ledger and review it with the rest. Keep that recorded population current when a new artifact kind or dependency appears. The benchmark's agent instructions are frozen inputs; never edit this skill during the campaign.

## Mandatory Review Dimensions

Every campaign round applies every sibling document below as a mandatory review dimension inside the same continuous traversal:

- [requirements.md](requirements.md): read `docs/analysis/` to exhaustion and maintain the complete requirement inventory.
- [database.md](database.md): traverse requirements and schema in both directions.
- [api.md](api.md): traverse requirements, schema, operations, DTO types, and DTO properties in both directions.
- [logic.md](logic.md): traverse requirements, contracts, schema invariants, and implementation semantics.
- [test.md](test.md): traverse requirements, operations, DTO shapes, and tests in both directions.
- [frontend.md](frontend.md): traverse requirements, contracts, screens, UI states, journeys, and browser specifications.
- [ledger.md](ledger.md): record the population, findings, invalidations, and current-state result.

These documents are dimensions of one round, not independent campaigns, passes, agents, or verdicts. None may be run separately and later combined with another partial result. Read the [Review skill](../review/SKILL.md) before the round and apply it throughout this same traversal.

## One Indivisible Round

A round is one continuous exhaustive traversal of the complete active-phase population through every mandatory review dimension. Backend scope covers the complete API and backend population. Frontend scope covers the complete frontend population and every backend contract it consumes. Overall scope covers the complete repository.

Never divide a round by file, requirement subset, package, layer, artifact kind, review lens, finding, time window, or agent. Never combine partial reviews and call the result a round. Parallel assistance may surface candidate findings, but it cannot replace any portion of the traversal. The agent declaring the result must personally inspect the entire population in one round.

Begin at the first requirement and end only after every applicable rule, value, state, permission, negative path, schema item, DTO, operation, business branch, test path, screen, interaction, SDK call, browser journey, and relationship has been inspected in both directions. Do not sample, inspect only changed files, rely on an earlier inventory, or skip unchanged items. An interruption or unfinished traversal is not a round.

A source digest, artifact count, route inventory, placeholder search, green gate, or ledger entry may identify the state and help navigate it. None proves that the population was traversed, and none may replace, shorten, or certify any part of the round.

## The Cascade

Any finding invalidates the current round. Correct every confirmed finding at its owning layer, regenerate affected derived artifacts, rerun every invalidated gate, and begin a new complete round at the first requirement.

An upstream change re-opens every downstream relationship. A requirement finding can imply a table, columns, operations, logic, tests, and a screen. A schema change can alter DTOs, operations, logic, and tests. A contract change can alter logic, tests, and frontend consumers.

Never carry a clean conclusion across a change. A conclusion applies only to the exact repository state traversed from beginning to end.

## Restart Until Dry

The number of rounds has no ceiling:

1. Read the entire current population from the artifacts themselves, applying every mandatory review dimension as part of the same traversal.
2. Record every finding before fixing it.
3. Correct every confirmed finding and propagate its consequences through the graph.
4. Discard the interrupted round and restart at the first requirement.
5. Stop only when one entire current-state round reaches the last artifact with zero actionable omissions, defects, inventions, stale artifacts, false mappings, partial behaviors, or unverified relationships.

One complete zero-improvement round is the stopping condition. No second clean round is required. A partial review, separately reviewed slices, or a union of parallel results never satisfies it.

The campaign is complete only when the same unchanged repository state also satisfies all of the following:

- every requirement maps to every artifact needed to realize it;
- every artifact traces to a requirement or a recorded necessary implementation boundary;
- every mandatory review dimension was applied inside the same indivisible full-population round;
- every required build, lint, generation, test, and browser gate is current and green;
- the complete round found zero actionable improvements.

Report what you inspected, corrected, and verified. If any requirement remains unrealized or any gate remains unavailable, report that exact boundary rather than reporting completion.

The [Review skill](../review/SKILL.md) owns claim verification within the round. Check current artifacts and prescribed gates rather than recollection or ledger entries.
