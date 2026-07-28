# Database Obligation

Read [SKILL.md](SKILL.md) first. This document covers the edges into and out of the schema.

## What The Build Checks

**Into the schema.** Every configured requirement section must be acknowledged by a model. A section nothing cites is a requirement with no storage.

**Out of the schema.** Every selected model, and depending on the configuration its columns and relations, must be acknowledged by an operation that exposes it and by the provider that reads or writes it. A model nothing cites is storage nothing reaches.

A citation acknowledges its target and every selected descendant, so one tag on a model can discharge its columns when the configuration selects them beneath it.

## Reading The Diagnostic

**A model nothing exposes** is either an operation you have not designed or a table you invented. Those need opposite repairs, so decide which before writing anything: find the requirement the table serves, and if there is none, the table is the defect.

**A column nothing exposes** is often correct. Internal bookkeeping is not meant to reach the API. Record that with `@evidenceExclude` and a reason, on the claim that owes it, so the next round does not re-derive the decision.

## Where The Repair Usually Is

An operation that cannot cite a model is not the schema's problem. A model that cannot cite a requirement usually is: either the requirement was misread, or the table exists for a reason nobody wrote down.

Go back to the section and read it again before adding a tag. A citation invented to clear a diagnostic is the one repair that leaves no trace.

## After Any Schema Change

Run the build. A removed model leaves every citation to it dangling, and a renamed one does the same while looking like a small edit.

A dangling citation means the schema moved under a claim that still believes the old shape. Fix whichever is actually wrong, and never delete the citation to stop the message.
