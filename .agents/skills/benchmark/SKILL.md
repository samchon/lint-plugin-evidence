---
name: benchmark
description: Defines how @samchon/lint-plugin-evidence measures its own product claim — what a benchmark request authorizes, the launch gate, subject order, frozen inputs, measurement integrity, run ownership, and where results are recorded. Use before launching, modifying, or reporting a benchmark run, or before editing anything a run reads; do not use for the deterministic tests under tests/, which the development skill owns.
---

# Benchmark

## Why This Exists

The README claims that an unattended agent can skip a requirement and still report completion, and that the evidence graph moves that omission into the build. This repository treats unproven claims as defects, so that product claim requires measured evidence.

The benchmark generates the same application twice: once with the evidence plugin configured and once without it. The common prompts, subject requirements, shared template, arm overlays, and retained results under `benchmark/` are the experiment's authority.

The plain arm is not a strawman. Its existing review skill requires exhaustive whole-project review until a complete round is dry, because the benchmark must compare evidence against a serious manual method.

## What A Request Authorizes

A run is expensive, long, and consumes model quota. Treat the subject, arm, model, and phase boundaries in the user's request as binding.

Authorization to run a named benchmark covers that run and its report. It does not authorize an unrequested rerun or a different subject, arm, model, publication, or repository mutation. Preserve partial results when a run is interrupted instead of silently replacing them.

## Launch Gate

Launch only from a validated, merged build. The repository suites and the consumer-shaped template proof must be green for the exact merged revision under test.

Schedule pressure, an absent user, or a nearly finished branch does not weaken this gate. If a common defect appears during a paid run, stop the affected wave, preserve the interrupted data, correct and revalidate the shared cause, and start a new run identity after the correction is merged.

## Subject Order

Run Todo and Reddit first, with evidence and plain arms started concurrently. Run Shopping and ERP only after the cheaper subjects are stable and their requirements are ready.

A shared defect affects every subject, so settle deterministic failures on the cheaper wave before spending the larger one.

## Frozen Inputs

Freeze these inputs before the first cell in a comparable wave starts:

- the complete requirement corpus for every subject in the wave;
- `benchmark/prompts/instruction.md`, `goal.md`, and `review.md`;
- the shared template and both arm overlays, including their existing skills and lint configurations;
- the locally packed product revision installed by the evidence arm;
- the model, reasoning effort, Codex version, and toolchain versions; and
- the measurement and quality-scoring procedure used for every arm.

The same three user turns are supplied to both arms. Arm-specific method instructions belong only to the corresponding template overlay.

Editing a frozen input after one cell starts invalidates comparison with that cell. Preserve the affected run as interrupted, record the reason, merge the corrected input, and begin a new run identity for every affected cell.

Frozen benchmark Markdown is exempt from repository-wide formatting. Keep it covered by `.prettierignore` so an unrelated formatting pass cannot alter experimental input bytes.

## Measurement Integrity

A run is evidence only while it measures the product a real consumer would install.

- **Measure the real product.** Do not add subject-name checks, expected-answer checks, benchmark-only product branches, monkey patches, or harness restrictions that would be invalid for an ordinary consumer.
- **Give every arm its prescribed setup.** Use the same base template, requirements, user turns, model settings, and toolchain. The evidence arm alone receives the locally packed plugin and evidence lint configuration; the plain arm receives its own review instructions.
- **Preserve the workload.** Do not weaken compilation, lint, testing, requirement coverage, or review obligations to make a cell finish.
- **Record, never reconstruct.** Persist raw Codex streams, token categories, tool calls, commands, timestamps, completion claims, follow-up turns, and workspace state while the run is active. Label any later inference as an estimate.
- **Separate costs.** Report materialization and installation overhead separately from agent wall time, and separate initial implementation from the review turn.
- **Inspect surprises.** Read the raw stream and retained workspace before accepting, explaining, or correcting an unexpected result.

## Predict Before Spending

Record an evidence-based prediction of wall time, token use, requirement coverage, test coverage, implementation scale, and quality before launching a paid wave. Update the prediction when a new subject corpus becomes ready, but never rewrite a prediction after observing its run.

Settle offline whatever a deterministic check can settle. A model run must not be used to discover a template, package, configuration, or build defect that the repository tests could have exposed.

## Run Ownership And Cleanup

Each cell owns an exact temporary root and every process below it. Never reuse a workspace across arms or run identities.

Copy the complete or interrupted workspace, raw logs, measurements, and terminal state into the retained result directory before removing temporary state. Remove only the exact temporary root after verifying that no owned process still uses it and that the retained copy is readable. Never clear shared package or model caches.

## Results

Store every attempt under `benchmark/result/<subject>/<arm>/runs/<run-id>/`. Keep the latest retained demo workspace at `benchmark/result/<subject>/<arm>/workspace/` without deleting prior run records.

Record timestamps, setup and agent wall time, every native token category, commands and gates, completion-claim timing, requirement and test coverage, quality assessment, interruption reason, and the exact frozen-input identities. Keep working knowledge in `.wiki/` according to the wiki skill, but do not treat that ignored local directory as the only copy of a benchmark result.

## Contradicting Results

If measured data contradicts a public product claim, correct the claim. A result that falsifies the hypothesis is the benchmark working, not a reason to suppress or rerun the row.
