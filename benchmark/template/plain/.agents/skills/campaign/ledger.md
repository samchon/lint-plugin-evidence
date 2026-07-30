# Ledger

Read [SKILL.md](SKILL.md) first. This mandatory campaign dimension owns where the current full-population round is recorded.

## Why It Exists

The campaign population is too large to hold in memory. The ledger records the exact current-state population, findings, corrections, and invalidations so the agent can restart honestly after a change.

**Keep it under `wiki/` at the repository root**, under version control. Frontend-specific notes may live in `packages/frontend/wiki/`. Name files for what they hold rather than the date or round that created them: requirement inventory, campaign state, and findings.

## What It Holds

**The requirement inventory.** Keep one entry per heading in `docs/analysis/`, with a stable identifier based on document and heading order. Record the actor or concept, applicable circumstance, required behavior, observable result, and named values. This current inventory is the denominator for every artifact relationship.

**The indivisible round state.** Record the repository state, active phase, complete population traversed, start and finish, findings, corrections, invalidated gates and relationships, and whether the traversal reached the last artifact without a change. Never create separate verdicts for sibling dimensions, agents, packages, or slices.

**Findings before correction.** Write every finding down before fixing it. Otherwise a later reader cannot distinguish a genuinely quiet surface from an unrecorded repair.

**Cascade notes.** When a correction invalidates downstream relationships or gates, record them at the moment of correction.

**Recorded absences.** Record tables with no public exposure, deliberately absent capabilities, and other required omissions with their reasons. An unrecorded absence is indistinguishable from an oversight.

## What It Is Not

The ledger is not a summary saying that review was completed. A useful entry names the exact population, repository state, findings, invalidations, and result.

It is not a substitute for reading current artifacts. Every new round starts at the first requirement and inspects the complete current population. Re-reading an inventory or carrying forward unchanged entries cannot establish completeness.

It is not a place to merge partial reviews. Candidate findings from parallel help may be recorded, but no file, agent, package, layer, or review lens contributes a separately completed portion of the round.

## Honesty

Record an interrupted, failed, or abandoned traversal as incomplete and state why. It is never a round and contributes nothing to the stopping condition.

Record any unrealized requirement and exact blocker. A truthful incomplete result is actionable; an unsupported completion report is not.

## Place In The Round

Use the ledger throughout the same indivisible traversal that applies every sibling dimension. If any finding leads to a change, mark the current traversal invalid, record the consequences, and restart the whole campaign at the first requirement.

The only successful result is one entire current-state round over the complete active-phase population that records zero actionable improvements. No second clean round is required.
