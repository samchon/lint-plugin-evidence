---
name: benchmark
description: Defines authorization, frozen inputs, execution, supervision, measurement, and issue-campaign reporting for the @samchon/lint-plugin-evidence benchmark. Use before changing benchmark inputs or code, or launching, supervising, resuming, or reporting a benchmark run; deterministic tests under tests/ use the development skill.
---

# Benchmark

## Purpose

The benchmark compares the same coding agent building the same application with and without the Evidence plugin. Both arms receive the same requirements, shared template, instruction sequence, model, and effort. Only the Evidence arm receives the plugin, graph configuration, and Evidence-specific guidance.

The runner is deliberately small. It prepares an isolated workspace, sends the selected Markdown instructions as Goals to one engine session in their fixed order, includes the common continuation text once in each Goal objective, and retains the complete conversation and native measurements. The native Goal runtime owns continued turns. The runner does not judge requirements, implementation quality, test results, or completion claims.

## Authorization

A model run is expensive. Launch or rerun only the exact subjects, engines, arms, models, and phases the user authorizes. Publication always requires separate explicit authorization.

Benchmark repair is an issue campaign. Open its campaign pull request before changing files. Self-review each completed correction, then commit and push it promptly. Record material findings and completed corrections as formal `COMMENT` reviews. Do not merge the campaign pull request while the campaign is active.

## Frozen Inputs

`benchmark/requirements/**` is user-owned and inviolable. Never edit, rewrite, normalize, summarize, rename, add, or delete anything in that tree. Never insert benchmark guidance or acceptance criteria into it.

Accept each selected requirement directory as opaque paths and bytes. Do not validate or infer its filenames, formats, encoding, headings, identifiers, structure, completeness, consistency, or suitability. Copy it exactly into the workspace.

The generated workspace, product archive, engine, model, effort, and CLI version stay fixed during a run. Read each instruction from its repository Markdown file when starting that Goal, and retain the exact user text in the turn record; do not create a second instruction copy.

## Implementation Boundary

Keep benchmark source under `benchmark/src/` and write it only in TypeScript. Prefer deletion and direct composition over wrappers, validators, compatibility layers, recovery protocols, or duplicated state.

Do not add subject-specific answers, expected-output checks, monkey patches, model-facing hints, or benchmark-only product behavior. Plain must contain no Evidence package, tag, rule, carrier, or guidance. Evidence-only treatment belongs only in the Evidence overlay.

Deterministic runner tests belong under `tests/` and run in CI. Never put a self-test framework in `benchmark/src/`.

## Execution

Prepare every selected cell before starting paid work. Each cell gets its own workspace and engine session. Combine each prescribed instruction with the exact text of `benchmark/instructions/continue.md` once and set that text as the Goal objective in its declared order. Do not send a synthetic continuation turn; the native Goal runtime continues an active Goal. When the measured agent marks the Goal complete, wait for its terminal turn and idle state, then start the next prescribed Goal. A non-zero exit or signal interrupts the cell.

Retain the exact prescribed and continuation user text, complete native event stream, raw stdout and stderr, session and Goal identity, native token categories, tool and command events, elapsed model-process time, exit code, and signal in delivery order. Record facts without adding build, lint, requirement, graph, quality, publication, or completion verdicts.

## Supervision

An operator agent reacts only to an abnormal interruption. It inspects the native failure, preserves the retained state, and resumes the same session when authorized. The native Goal runtime handles ordinary questions, partial reports, and pauses under the common continuation text without operator prose.

Do not add implementation advice, hints, or ad hoc completion judgments to a measured session. Do not mutate a measured workspace to rescue a run.

## Reporting

Report measured token categories and model-process elapsed time from retained native output. Label estimates as estimates. Keep setup time separate.

Inspect the completed workspace before accepting any product or quality claim. A contradiction is a benchmark result, not a reason to hide, patch, or rerun it.
