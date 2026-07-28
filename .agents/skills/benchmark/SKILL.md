---
name: benchmark
description: Defines how @samchon/lint-plugin-evidence measures its own product claim — what a benchmark request authorizes, the launch gate, subject order, frozen inputs, measurement integrity, run ownership, and where results are recorded. Use before launching, modifying, or reporting a benchmark run, or before editing anything a run reads; do not use for the deterministic tests under tests/, which the development skill owns.
---

# Benchmark

## Why This Exists

The README claims that an unattended agent can skip a requirement and still report "done", and that the graph moves spec judgment into the build. This repository asserts that an unproven claim is a defect, so that claim owes measured evidence like any other.

The benchmark answers it by generating the same applications twice: once with the evidence rules off and the agent instructed to self-audit to exhaustion, once with the rules on. The protocol, the arms, the subjects, the metrics, and the pre-registered hypotheses live in issue #88 and in the frozen protocol documents it produces. This skill owns the discipline around them, not their content — read #88 for what is measured, and this file for what you are allowed to do while measuring it.

The control arm is not a strawman. Instructed exhaustive review and loop-until-dry discovery is the state of the practice, and it buys real assurance at a recurring cost. A benchmark that wins by underconfiguring it proves nothing anyone will believe.

## What A Request Authorizes

A run is expensive, long, and consumes the runner CLI's model quota. Treat the phase boundary in the request as binding.

"Run a benchmark" authorizes that run and its report. It does not authorize a second run, publishing issues, opening a pull request, merging, or editing anything the run reads. Ask before crossing a boundary the request did not name, and say what a run will cost first: which subject, which arm, the expected wall-clock, and that it spends quota.

## The Launch Gate

Launch only from a validated build. The repository suites are green and the change under test is merged before a run starts.

This gate is unconditional. Schedule pressure, an absent user, a nearly finished branch, and a partial diagnosis leave it exactly where it is. A build that compiles is not a validated build, and "the remaining failures are probably fixture churn" is an assumption rather than evidence.

A run started from an unverified tree is not evidence, because it measures a state that will never exist again. Kill it, remove its workspace so nothing later mistakes it for a result, and record the aborted attempt with its cost. #88 states the same rule from the other direction: a failed run is data, never a silent rerun.

## Subject Order

Run subjects in ascending cost — todo, reddit, shopping, erp — and prefer one with a green baseline.

A defect in a shared path breaks every subject, so it is worth finding on the cheapest one. A subject that completed before the change under test also makes a regression legible as a delta, where a subject that was already failing can only show an absolute result. Reserve erp for the claims only its scale can settle.

## Frozen Inputs

These are inputs to an experiment, not documentation, and they are frozen before the first run:

- the specification documents of every subject;
- both arms' prompts and their method instructions;
- the Phase 2 campaign procedure, its lenses, `K`, and its verification steps;
- the grading rubric and the stripping procedure that precedes grading; and
- the pinned model, reasoning effort, agent version, toolchain versions, and price sheet.

Editing any of them after the first run invalidates every cell already collected. If one must change, say so plainly, discard the affected cells, and record why — a matrix quietly mixing two input versions reports a comparison nobody made.

Frozen inputs are exempt from the repository formatter for the same reason. `prettier.config.js` sets `proseWrap: "never"` for Markdown, so an ordinary `pnpm format` would reflow a frozen specification in place, and the diff would read as whitespace. Keep them covered by `.prettierignore` and never remove an entry to make a check pass.

The prompts differ between arms by necessity, and #88 publishes both verbatim so a reader can judge the asymmetry. That is only auditable while the asymmetry stays confined to the arm overlay, so keep arm-specific content out of the shared tree and keep both overlays' file paths identical.

## Measurement Integrity

A run is evidence only while it measures the product a real consumer would install.

- **Measure the real product.** No subject-name check, expected-answer check, benchmark-only branch, monkey patch, or harness-side prompt restriction that would be wrong for a project nobody is measuring. The agent sees the same package, configuration, and instructions a consumer gets.
- **Give every arm its prescribed setup.** Configure each arm the way its own mechanism prescribes. A deliberately underconfigured control invalidates the comparison, and it is the one shortcut that would discredit the whole result.
- **Preserve the workload.** A greener or faster run obtained by compiling, linting, testing, or reading less input is not an improvement. Never weaken a gate to make a run pass; a run that fails honestly is worth more than a green one that lies, and that failure is the exact thing this product exists to surface.
- **Record, never reconstruct.** Token counts by category, tool calls, build invocations, and the moment of the first completion claim exist only in the runner's stream while it runs. Anything reconstructed after the fact is an estimate, and must be labelled as one.
- **Normalize before comparing.** A vendor's token categories are its own. Codex reports an inclusive input count whose cached subset must be subtracted before conversion to cost, or the arm with the larger stable context is charged for reading it twice.
- **Treat a surprise as failed understanding.** A result that contradicts the prediction means the change is not yet understood. Inspect the raw stream and the preserved workspace before accepting it, explaining it away, or patching around it.

## Predict Before Spending A Run

Name what a change should move and what should stay identical, and record the prediction before launching. Then judge the run against the prediction instead of reading it fresh.

Settle offline whatever a deterministic check or an existing suite can settle. A run costs hours; a Go test costs seconds, and a question answerable by either belongs to the cheaper one.

## Run Ownership And Cleanup

Each run owns an exact temporary root and every artifact below it. Preserve the run record and the generated workspace, then remove that root — the record is worthless without the workspace it points at, and the workspace is the only way a later reader can re-inspect what was seen.

Never clean a shared cache to reclaim space. Confirm no process still holds the root before removing it, and verify it is gone afterwards.

## Where Results Go

A conversation ends and a machine is reimaged. Neither is a record.

Append every completed run to the permanent results ledger issue, and keep working notes in `.wiki/` per the wiki skill. `.wiki/` is git-ignored and machine-local, so anything that must survive belongs in the ledger or in a published issue. Record UTC timestamps, the run's elapsed time separately from setup overhead, each token category unmerged, the subject scale, and the outcome — including the failures, which are the rows most likely to be quietly dropped.

## When The Data Contradicts The README

Correct the README.

#88 commits to this in advance, and pre-registering the hypotheses is what makes the commitment enforceable: a result that falsifies H1 through H5 is the benchmark working, not the benchmark failing. A product claim that survives only because the measurement was never published is the defect this repository names in every other context.
