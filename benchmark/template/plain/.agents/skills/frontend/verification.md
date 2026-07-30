# Verification

The browser suite has a denominator, and nothing counts it for you.

Every journey the documents give an actor must have a spec under `tests/journeys/` that walks it, and every spec must name the journey it walks. The exported `journey_` functions are what make both directions countable, so the walk is against the documents and the export list, never against memory.

Read [the campaign skill](../campaign/SKILL.md) and [its frontend edge](../campaign/frontend.md) before starting; the journey-to-spec walk lives there with the rest of the frontend campaign.

<!-- benchmark-template-splice: base-body -->
{{base}}

## The Ledger Rows This Suite Owes

One row per journey: the requirement section, the actor, the spec that walks it, and whether the walk ran against simulation only or closed against the live backend. A journey recorded as covered by a spec that only ran simulated is the frontend's version of a test nobody ran.

The ui-review spec, the readme spec, and the gallery carry no rows. They verify presentation, and putting them in the journey ledger inflates the denominator with things that prove no requirement.

## What Re-Opens This

A requirements finding, a contract change, and any screen change on the journey's path. The spec still passing does not establish that the verdict survived: the spec proves the flow it encodes, and the question is whether that flow is still the one the documents describe.
