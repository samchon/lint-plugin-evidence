---
name: requirements
description: Defines what the documents under docs/analysis contain, how they are organized, how to read a requirement so nothing in it is missed, and how that reading is established as complete here. Use before implementing anything and again when checking whether the specification is realized.
---

# Requirements

Everything else in this repository is downstream of how well you read these documents.

There is no mechanism that will tell you a section went unread. The compiler checks the code that exists, and a requirement you never saw produces no artifact and therefore no error. Every later campaign counts against the inventory you build here, so an incomplete inventory makes every downstream verdict wrong while looking exactly like a correct one.

Read [the campaign skill](../campaign/SKILL.md) and [its requirements edge](../campaign/requirements.md) before you start. That edge is the root of the graph and the only one with nothing upstream to catch its mistakes.

<!-- benchmark-template-splice: base-body -->
{{base}}

## Build The Inventory As You Read

For every heading, record the five parts in the ledger: the actor or concept, the circumstance, the required behavior, the observable result, and the named values.

Do it while reading, not afterwards. An inventory reconstructed from memory is a summary of what you found interesting.

## The Cost Of A Miss Here

A section you did not read implies a table you did not create, which implies an endpoint, a provider, a test, and a screen. When a later round finds it, every one of those campaigns re-opens in full.

That is not an argument for reading faster. It is why every new round restarts at the first requirement and why only one complete current-state round with zero actionable improvement can end the campaign.
