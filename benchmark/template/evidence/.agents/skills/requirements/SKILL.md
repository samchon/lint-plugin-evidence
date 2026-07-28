---
name: requirements
description: Defines what the documents under docs/analysis contain, how they are organized, how to read a requirement so nothing in it is missed, and how the build establishes that each one was realized. Use before implementing anything and again when checking whether the specification is realized.
---

# Requirements

These documents are the denominator of every obligation the build checks.

Each configured section of each document must be acknowledged by an artifact that claims to realize it. A section nothing cites is a lint failure naming that exact section, so you will not silently skip one.

That makes the reading easier, not optional. The build tells you which sections are unaccounted for; it cannot tell you that you misread one you did cite.

Read [the campaign skill](../campaign/SKILL.md) before you start.

{{base}}

## Read For The Citation You Will Have To Write

A citation names a section and states why the artifact applies to it. Writing that reason is where a shallow reading becomes visible, because a reason phrased from a skim reads as a restatement of the heading.

So extract the five parts as you read: the actor, the circumstance, the required behavior, the observable result, and the named values. Those are what a real reason is made of, and a section whose observable result you cannot state is one you have not finished reading.

## What The Build Will And Will Not Catch

**It catches a section nothing acknowledges.** That is the omission class this mechanism exists to remove, and it removes it completely.

**It does not catch a section acknowledged by an artifact that does something else.** A citation the build accepts is a claim the build believes. If you cite a section from a model that stores something adjacent, or from a test that exercises a neighboring rule, the report goes quiet and the requirement stays unrealized.

Nothing downstream recovers from that. A reviewer comparing the reason to the code is the only check that remains, which is why the reason has to be worth reading.

## Configuration Is Part Of The Denominator

A document, a directory, or a heading level that the graph does not select is not checked. Its absence produces no diagnostic and looks identical to full coverage.

When a new document appears under `docs/analysis/`, confirm the configuration selects it before trusting a green build.
