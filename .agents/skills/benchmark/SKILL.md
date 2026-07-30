---
name: benchmark
description: Defines how @samchon/lint-plugin-evidence measures its product claim — authorization, launch gates, frozen inputs, measurement integrity, active supervision, recovery, result publication, and reporting. Use before launching, observing, resuming, repairing, publishing, or reporting a benchmark run, or before editing anything a run reads; do not use for deterministic tests under tests/, which the development skill owns.
---

# Benchmark

## Product Claim

The README claims that an unattended agent can skip a requirement and still report completion, and that the evidence graph moves that omission into the build. This repository treats unproven claims as defects, so that product claim requires measured evidence.

For each engine, the benchmark asks the same model to build the same application twice: once with the evidence plugin and once without it. The selected instructions, subject requirements, shared template, arm overlays, locally packed product, native agent stream, and retained workspace are the experiment's authority.

The plain arm is not a strawman. Its existing review skill requires exhaustive whole-project review until a complete round is dry, because the benchmark must compare evidence against a serious manual method.

## Authority

A run is expensive, long, and consumes model quota. Treat the subject, engine, arm, model, and phase boundaries in the user's request as binding.

Authorization to run a named benchmark covers that run, active supervision, recovery of its retained cells, and its report. It does not authorize an unrequested rerun, different subject, engine, arm, model, publication, or unrelated repository mutation.

Publication requires separate explicit authorization. Never infer a GitHub owner from this repository, its remote, the package scope, or an example command.

## Campaign Contract

A benchmark is an issue campaign, not a detached batch process. Keep one campaign pull request open while its authorized waves run. Commit and push deterministic runner, template, instruction, and plugin corrections to that pull request; record detailed findings, interruptions, recoveries, interventions, and completed phases as formal `COMMENT` reviews. Do not merge the campaign pull request between waves.

After the campaign pull request merges, close only the linked issues whose current acceptance scope the merged tree actually satisfies. Keep the handoff or residual issue open until its own implementation pull request merges.

Use this fixed engine matrix unless the user explicitly replaces it:

| Engine      | Model             | Effort |
| ----------- | ----------------- | ------ |
| Codex       | `gpt-5.6-terra`   | `high` |
| Claude Code | `claude-sonnet-5` | `high` |

Launch the complete authorized engine-by-subject-by-arm matrix concurrently. For the first wave, Todo and Reddit across both engines and both arms form eight cells. Record the engine, exact model, effort, CLI version, and invocation in every run. Do not substitute a model after launch or silently inherit an effort setting. Do not launch an engine until its adapter and deterministic proof pass on the exact campaign revision.

Assign a dedicated read-only reporting subagent to refresh the campaign pull-request body every 10 minutes. The live dashboard uses separate `## Codex` and `## Claude Code` sections rather than one combined engine table. That subagent reads retained state, logs, usage, and workspace inventories; it never edits a measured workspace, frozen input, or source branch. The 30-second liveness supervisor is a separate responsibility and must act immediately rather than waiting for the reporting interval.

## Launch Gate

Launch only from a clean pushed commit. The repository suites and the consumer-shaped template proof must be green for that exact revision. Prepare and admit every cell in the selected wave before any cell enters measured agent work; if one preparation fails, launch none. Keep the campaign pull request open until every authorized subject finishes; do not merge it between waves.

Schedule pressure, an absent user, or a nearly finished branch does not weaken this gate. Settle every deterministic template, package, configuration, build, port, and CI defect before model use.

Codex and Claude Code measured launches use the installed local CLIs, their existing authenticated accounts, and each CLI's native non-interactive YOLO flag. Do not add a second permission profile or OS-sandbox policy inside the adapter. Launch only disposable measured workspaces, reject controller environments whose variable names identify credentials or proxies, freeze and audit the exact invocation, and report that model-launched shell commands are not filesystem- or network-isolated. The generated SQLite application requires no container runtime.

## Subject Order

Run Todo and Reddit first, with Codex and Claude Code evidence and plain cells started concurrently after the all-cell preparation barrier. Run Shopping and ERP only after the cheaper subjects are stable and their requirements are ready.

A shared defect affects every subject, so settle deterministic failures on the cheaper wave before spending the larger one.

## Frozen Inputs

`benchmark/requirements/**` is user-owned source material and is read-only to every agent. Never edit, rewrite, normalize, summarize, rename, add, or delete anything in that tree, and never insert a corpus contract, evaluator instruction, evidence guidance, acceptance criterion, or other agent-authored text into it. If a requirement corpus appears incomplete, inconsistent, or unsuitable, stop before launch and report the defect; only the user may restore or replace the source material.

Freeze these inputs before the first cell in a comparable wave starts:

- the complete requirement corpus for every subject in the wave;
- the complete selected user-turn workflow: `benchmark/prompts/**` for the retained baseline protocol or `benchmark/instructions/**` for the backend-first gated protocol;
- the shared template and both arm overlays, including their existing skills and lint configurations;
- the locally packed product revision installed by the evidence arm;
- each engine's model, reasoning effort, CLI version, and toolchain versions; and
- the measurement and quality-scoring procedure used for every arm.

The backend-first protocol shares each phase's start and review turn, then gives each arm its own phase-final turn. The runner must read the complete sequence once at launch, retain those exact bytes under the cell's `inputs/`, and send only the retained copy.

Editing a frozen input or active workspace by hand after one cell starts invalidates comparison with that cell. The only salvage path is the user's explicitly authorized, common, recorded operator intervention in [running.md](running.md), applied identically across both engines and both arms in the affected subject set; it qualifies the comparison and never becomes an unreported clean run.

Frozen benchmark Markdown is exempt from repository-wide formatting. Keep it covered by `.prettierignore` so an unrelated formatting pass cannot alter experimental input bytes.

## Measurement Integrity

A run is evidence only while it measures the product a real consumer would install.

- **Measure the real product.** Do not add subject-name checks, expected-answer checks, benchmark-only product branches, monkey patches, or harness restrictions that would be invalid for an ordinary consumer.
- **Give every arm its prescribed setup.** Use the same base template, requirements, user turns, model settings, and toolchain. The evidence arm alone receives the locally packed plugin and evidence lint configuration; the plain arm receives its own review instructions.
- **Preserve the workload.** Do not weaken compilation, lint, testing, requirement coverage, or review obligations to make a cell finish.
- **Record, never reconstruct.** Persist each engine's native streams, token categories, tool calls, commands, elapsed durations, completion claims, follow-up turns, and workspace state while the run is active. Label any later inference as an estimate.
- **Separate costs and time.** Agent wall time starts when the Codex or Claude Code child process starts and is the sum of retained turn durations. Materialization, installation, the all-cell preparation barrier, controller admission, and reporting time are setup or operator overhead and never enter agent wall time. For the backend-first protocol, separate backend, frontend, and overall start, review, and final turns.
- **Inspect surprises.** Read the live raw stream and workspace before stopping an unexpected cell, and inspect every successful retained workspace before accepting its result.

The coding agent is the measured instrument; the benchmark runner is not a substitute for an operator. A run therefore requires continuous agent supervision, with every active cell observed at least once every 30 seconds. Read [running.md](running.md) before launching, observing, resuming, repairing, publishing, or reporting a live run.

## Predict Before Spending

Record an evidence-based prediction of wall time, token use, requirement coverage, test coverage, implementation scale, and quality before launching a paid wave. Update the prediction when a new subject corpus becomes ready, but never rewrite a prediction after observing its run.

Settle offline whatever a deterministic check can settle. A model run must not be used to discover a template, package, configuration, or build defect that the repository tests could have exposed.

## Run Ownership

Each cell owns an exact result root and every process below it. Never reuse a workspace across engines, arms, or run identities.

Retain every cell that reached a measured agent turn. A provider-capacity error, timeout, tool interruption, or controller loss is recoverable state, not a failed result: preserve its workspace, nested Git history, frozen inputs, engine session identity, raw logs, token ledger, and elapsed time, then resume the first incomplete turn.

Remove only a setup cell that never entered measured agent work or a cell explicitly invalidated by frozen-input drift or non-comparable intervention. Resolve the exact owned path and stop its owned processes before removal. Never clear shared package or model caches.

## Results

Store attempts under `benchmark/result/<subject>/<engine>/<arm>/runs/<run-id>/`. Keep the latest successful demo workspace at `benchmark/result/<subject>/<engine>/<arm>/workspace/` and preserve the last successful subject-engine-arm result.

Record total elapsed time, setup and agent wall time, every native token category, commands and gates, completion-claim timing, requirement and test coverage, quality assessment, and the exact frozen-input identities. Do not record absolute start or completion timestamps. Keep working knowledge in `.wiki/` according to the wiki skill, but do not treat that ignored local directory as the only copy of a benchmark result.

Completion is provisional until an operator verifies the full prescribed turn sequence, terminal build, lint, backend and frontend tests, residual requirement coverage, and semantic quality. Only that accepted workspace may become a leaf in the public result repository.

## Cancellation

When the user cancels a campaign and explicitly rejects its partial results, stop the campaign reporting monitor, automatic resumers, cell controllers, model processes, servers, and their owned descendants. Verify that no owned process remains before deleting data.

Remove only the canceled campaign's ignored `benchmark/.work/` and `benchmark/result/` trees after resolving their exact workspace paths. Do not delete requirement corpora, templates, instructions, shared caches, source changes, or an independently published result repository. Report that the removed local run data is not recoverable.

## Contradicting Results

If measured data contradicts a public product claim, correct the claim. A result that falsifies the hypothesis is the benchmark working, not a reason to suppress or rerun the row.
