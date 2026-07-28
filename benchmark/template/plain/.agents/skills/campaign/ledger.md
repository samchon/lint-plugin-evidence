# Ledger

Read [SKILL.md](SKILL.md) first. This document owns where campaign state is written down.

## Why It Exists

None of this survives in your head. A campaign runs an unbounded number of rounds over a population too large to hold, and each round must know what the previous rounds established and what they invalidated.

There is no issue tracker here and no external system to file against. The ledger is a file in the repository, and it is the only thing that makes an unbounded loop terminate honestly rather than terminate when you get tired.

**It lives in `wiki/` at the repository root**, under version control, so a later reader can see how completeness was established. The frontend keeps its own notes the same way, in `packages/frontend/wiki/`, and neither is built or shipped.

Name the files for what they hold rather than for the round that wrote them: the requirement inventory, the per-campaign state, and the findings. A ledger scattered across files named by date cannot answer "what is the current state of the API campaign", which is the only question it exists to answer.

## What It Holds

**The requirement inventory.** One entry per heading in `docs/analysis/`, with the five extracted parts. This is the denominator every other campaign counts against, so it is the one artifact that must be complete before anything else can claim to be.

**Per-campaign state.** For each edge: the round number, the date, what the round covered, what it found, and whether it was clean. A campaign's dryness claim is a claim about a specific state of the repository, so record what that state was.

**Findings, before they are fixed.** Write the finding down first. A finding recorded only after it is fixed leaves no evidence that it existed, and a later round cannot tell whether a clean result means the surface is quiet or means someone silently repaired something and forgot.

**Cascade notes.** When a fix re-opens downstream campaigns, record which ones at the moment of the fix. Deciding later means deciding from memory, and memory is what the ledger replaces.

**Recorded absences.** A table nothing exposes, a lattice cell the documents do not cover, a capability deliberately left out. Each with the reason. An unrecorded absence is indistinguishable from an oversight on the next round, so you will re-derive it every single round until you write it down.

## What It Is Not

It is not a summary of what you did. A ledger entry that says a campaign was completed, without the population it covered and what it found, proves nothing and costs the same to write.

It is not a substitute for reading the artifacts. Every round reads the artifacts themselves; the ledger records the result. A round conducted by re-reading the ledger can only confirm what the ledger already says, which is exactly the thing under test.

## Honesty

Record a failed or abandoned round as a round. Record a campaign you stopped early, and why. Record a requirement you could not satisfy and what blocked it.

A ledger that shows only successes is a ledger nobody can use, because the reader cannot tell whether the gaps were checked and found clean or never checked at all. Those are opposite facts and they look identical in a ledger that omits its failures.

If you reach the end of the work with an unrealized requirement, the ledger says so and your final report says so. A truthful blocked outranks a hopeful done, and it is the only report the next reader can act on.
