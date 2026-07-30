# Requirements Campaign Dimension

Read [SKILL.md](SKILL.md) first. This mandatory dimension is the root of the indivisible campaign round: every artifact relationship is only as complete as the requirement inventory.

## What This Dimension Is

`docs/analysis/` is given to you. You did not write it and you do not change, challenge, validate, reconcile, or repair it. Read it to exhaustion and maintain a complete written inventory of what it states.

Nothing upstream can report a section you missed. Every downstream relationship silently inherits omissions from this inventory.

## The Population

The population is every heading and statement in every file under `docs/analysis/`, in order, including navigation and preamble.

Read every document, not only those that seem relevant to the current implementation area. Concerns are distributed across actor, domain, function, rule, and non-functional sections, and each statement is accepted as written.

Do not exclude a document because its name looks like navigation or introduction. A statement no other document repeats may appear there.

## Extract Every Statement

For every heading, assign a stable identifier and capture the following in the ledger:

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

Capture statements from every document under their stable identifiers without scoring, correcting, or choosing among them. The benchmark input is authoritative; this dimension measures whether the application realizes it, not whether the specification should have been different.

If several statements concern the same actor, concept, lifecycle, or threshold, preserve each source statement in the inventory. Do not edit the documents or silently replace one statement with another.

## Place In The Round

Within every campaign round, read every current requirement document, heading, and statement from the source files as part of the same continuous full-population traversal.

This dimension is not a separate round or separately mergeable verdict. Any finding in the application's realization invalidates the whole campaign round: correct it at its owning layer, propagate its consequences, and restart the complete traversal at the first requirement. Completion requires one entire current-state round covering this dimension and every sibling dimension with zero actionable improvements.

Reading an earlier inventory instead of the current documents is not a traversal of this population.

## Cascade

Any newly captured or previously omitted requirement statement re-opens every downstream relationship. A statement can imply storage, DTOs, operations, logic, tests, screens, and browser journeys.

Record every invalidated downstream relationship when the finding is recorded.

## Dimension Exit

This dimension is exhausted within the full round when the ledger holds the five-part entry for every heading and statement in every current document, with no omission and no invented requirement.

The build and tests cannot report an absent inventory entry.
