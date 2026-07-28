# Requirements Campaign

Read [SKILL.md](SKILL.md) first. This campaign is the root of the graph: every other campaign is only as complete as this one.

## What This Campaign Is

`docs/analysis/` is given to you. You did not write it and you do not change it. Your job is to read it to exhaustion and to hold a complete, written inventory of what it requires.

This is the one campaign with no upstream. Nothing will tell you that you missed a section, because nothing else knows the section exists. Every downstream campaign inherits whatever this one missed, and inherits it silently.

## The Population

Every heading in every file under `docs/analysis/`, in order, including the ones that look like preamble.

Read every document, not the ones that seem relevant to what you are building right now. A concern lands in exactly one document, so the rule an endpoint must enforce is in the business-rules document and the actor allowed to call it is in the actors document. Reading only the functional requirements produces an application with every endpoint and no rules, and it looks finished.

**Do not exclude a document because its name reads as navigation or preamble.** A file that looks like a table of contents still gets a complete pass, because the one statement nothing else repeats is exactly the kind of thing that lands there, and skipping it costs nothing to check and everything to miss.

## A Round

One round is a complete pass over every heading of every document.

For each heading, extract five things and write them into the ledger:

1. **The actor or concept** the statement is about.
2. **The circumstance** that makes it apply: an input, a state, a permission, a time.
3. **The required behavior**: a capability, a state change, a preservation rule, a calculation, a visibility rule, or a prohibition.
4. **The observable result**, including the refusal when the circumstance is not met.
5. **The named values**: the allowed set, the threshold, the unit, the relationship, the boundary.

A heading whose observable result you cannot state is a heading you have not finished reading. Go back to it; do not record it as understood.

## Walk The Capability Lattice

Most omissions are not a sentence nobody read. They are a cell nobody looked for.

For every concept and every journey the documents name, check the documents for all ten of these:

- entry and creation
- inspection and discovery
- change and correction
- state transitions
- completion or termination
- recovery
- actor authority
- ownership and visibility
- success effects
- conflicts and negative paths

When a cell is stated, it is a requirement. When a cell is stated as excluded, the exclusion is itself a requirement and adding the behavior anyway is a defect. When a cell is absent, record it as absent rather than as satisfied; a later round or a downstream campaign may find that another document covers it.

Negative paths deserve their own attention because the application appears to work without them. Nothing fails until the case arrives, and the case arrives in production.

## Cross-Document Consistency

A single document can be internally consistent and still contradict another. Check for it deliberately:

- an actor named in the functional requirements but absent from the actors document, or holding an authority the actors document does not grant;
- a rule in the business rules that no functional requirement can trigger;
- a domain concept with no lifecycle, or a lifecycle whose terminal state nothing reaches;
- a threshold stated twice with different values.

A genuine contradiction is a finding you report, not one you resolve by picking the easier reading. Do not edit the documents to make it disappear.

## Rounds And Dryness

A round that produces any finding resets the count. The campaign is dry after **two consecutive complete rounds** produce nothing new.

Vary the traversal between rounds. Walk document order in one round, walk concept by concept across documents in the next, walk actor by actor in a third. A pass that repeats the previous pass's path repeats its blind spots, and two identical passes are one pass counted twice.

Re-read from the documents each round. Reading your own inventory instead is not a round: it can only confirm what you already recorded, which is exactly the thing under test.

## The Cascade Out Of Here

Every finding here re-opens every downstream campaign, without exception.

One newly-read section can imply a table, which implies columns, which implies endpoints, which implies logic, which implies tests, which implies a screen. All of those campaigns were dry against a requirement inventory that has just changed, so none of them is dry now.

Record in the ledger which campaigns a finding re-opens, at the moment you record the finding. Deciding later means deciding from memory.

## Exit

This campaign is dry when two consecutive complete rounds find nothing, and the ledger holds a five-part entry for every heading in every document.

It is not dry because you have read everything once. It is not dry because the build passes. Nothing downstream can tell you this campaign is incomplete, which is precisely why it needs the strictest discipline of the six.
