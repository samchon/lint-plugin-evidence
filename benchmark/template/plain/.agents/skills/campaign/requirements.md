# Requirements Campaign Dimension

Read [SKILL.md](SKILL.md) first. This mandatory dimension is the root of the indivisible campaign round: every artifact relationship is only as complete as the requirement inventory.

## What This Dimension Is

`docs/analysis/` is given to you. You did not write it and you do not change, challenge, validate, resolve, choose among, or rewrite apparent tensions in it. Read it to exhaustion, preserve every source statement, and maintain a complete written inventory of what it states.

Nothing upstream can report a section you missed. Every downstream relationship silently inherits omissions from this inventory.

## The Population

The population is exactly the H2 and H3 sections defined by the [Requirements skill](../requirements/SKILL.md). That skill alone owns anchor derivation, collisions, and excluded heading levels.

Read every document, not only those that seem relevant to the current implementation area. Concerns are distributed across actor, domain, function, rule, and non-functional sections, and each statement is accepted as written.

Do not exclude a document because its name looks like navigation or introduction. A statement no other document repeats may appear there.

## Extract Every Statement

For every selected H2/H3 identity, capture the following in the ledger:

1. **The actor or concept** the statement concerns.
2. **The circumstance** that makes it apply: input, state, permission, or time.
3. **The required behavior**: capability, state change, preservation, calculation, visibility, or prohibition.
4. **The observable result**, including any stated refusal.
5. **The named values**: allowed set, threshold, unit, relationship, or boundary.

If you cannot state the observable result, re-read the source statement. Record what the documents say without adding an interpretation they do not state.

## Walk The Capability Lattice

For every concept and journey the documents name, inventory all stated aspects:

- entry and creation;
- inspection and discovery;
- change and correction;
- state transitions;
- completion or termination;
- recovery;
- actor authority;
- ownership and visibility;
- success effects;
- conflicts and negative paths.

When an aspect is stated, inventory it. When it is explicitly excluded, inventory the exclusion as a requirement. When it is absent, do not invent it.

Negative paths require explicit capture because an application can appear to work without implementing them.

## Accept Cross-Document Statements As Given

Capture every normative statement in each selected section under its canonical identity without scoring, correcting, or choosing among them. The benchmark input is authoritative; this dimension measures whether the application realizes it, not whether the specification should have been different.

If several statements concern the same actor, concept, lifecycle, or threshold, preserve each source statement in the inventory. Do not edit the documents or silently replace one statement with another.

## Findings

Any newly captured or previously omitted requirement statement re-opens every downstream relationship. A statement can imply storage, DTOs, operations, logic, tests, screens, and browser journeys.

Record every invalidated downstream relationship when the finding is recorded.

Within the indivisible round owned by [SKILL.md](SKILL.md), reread every selected section from the source rather than an earlier inventory. This dimension is exhausted when the ledger contains every identity and statement with no omission or invention; builds and tests cannot establish that.
