# Ledger

Read [SKILL.md](SKILL.md) first. This document owns what still needs writing down when the build does the counting.

## What The Build Already Records

Coverage. Every configured obligation is either acknowledged or reported, and the report is reproducible by running the build. You do not maintain a coverage inventory by hand, and you should not: a hand-kept one would drift from the real answer and be trusted anyway.

## What It Does Not Record

Three things, and each is invisible afterwards unless you write it down.

**Why an exclusion exists.** `@evidenceExclude` carries a reason, which is the record, and that is why the reason has to be a decision rather than a note. "Not applicable" tells the next reader nothing and will be re-litigated every time someone reads it. Write what makes it not applicable.

**What a diagnostic actually meant.** When a diagnostic at one layer was repaired at another, the repair leaves no trace of the reasoning. Record it: the operation could not cite the requirement because the schema had no state for it, so the table was added and these four diagnostics cleared together. That is the note that stops the next person from adding a citation at the reporting layer.

**What the build cannot check.** A citation whose reason you verified against the code, a cross-cutting rule you walked to every place it applies, a test you proved would fail by removing the behavior. Each of those is work the report cannot distinguish from work not done.

**Keep these in `wiki/` at the repository root**, under version control, so a later reader can see how the green build was earned. The frontend keeps its own notes the same way, in `packages/frontend/wiki/`, and neither is built or shipped.

Name the files for what they hold. This ledger is short by design, because the build already keeps the long part, and that is exactly why the little it holds has to be findable.

## Configuration Changes Are Ledger Events

Narrowing the graph, adding a document, or adding an edge changes what the build means. A green build before and after a narrowing are not the same claim.

Record every configuration change with its reason. This is the one place where a repository can lose coverage without a single diagnostic appearing, and where reviewing the reason is the only defense.

## Honesty

Record a requirement you could not satisfy and what blocked it. Record an exclusion you are unsure about.

A green lint stage plus a ledger that shows only successes cannot be distinguished from a green lint stage over work nobody examined. If you reach the end with something unrealized, say so here and in your final report. A truthful blocked outranks a hopeful done.
