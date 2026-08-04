---
name: benchmark
description: Defines how an @samchon/lint-plugin-evidence benchmark campaign is set up, launched under frozen inputs, run, supervised, recovered, and reported, from issue creation through pull-request completion. Use whenever operating, supervising, or reporting a benchmark run.
---

# Benchmark Operation

A campaign measures one coding engine building the same application twice: once with `@samchon/lint-plugin-evidence` and its guidance, once with neither. One subject and arm is a **cell**, one execution of a cell is a **run**, retained under `benchmark/output/<subject>/codex/<arm>/runs/<run-id>/`.

## Standing Rules

- Change nothing but the arm.
- Report only what the record retained.
- Never repair a measured workspace.
- Warn before resume, resume before derive, derive before restart.

## Topics

- **[Running A Campaign](running.md)** — campaign start, cell launch, workspace preparation, the objective sequence, supervision.
- **[Reporting](reporting.md)** — the live dashboard, `benchmark/aggregate`, completed-workspace review, pull-request closure.
- **[Plain Review](plain-review.md)** — the runner-owned backend review ledger, the inspecting thread, verdicts.
- **[Intervention](intervention/SKILL.md)** — anomaly triage, the frozen boundary, warnings, recovery, cancellation.

## Commands

Under `pnpm --filter @samchon/evidence-benchmark`:

- `start` — launch, resume, or derive a run. [running.md](running.md), [intervention/recovery.md](intervention/recovery.md)
- `audit-suspensions`, `dashboard`, `report` — the live dashboard and `benchmark/aggregate`. [reporting.md](reporting.md)
- `supervise` — apply a hand-written Plain review verdict. [plain-review.md](plain-review.md)
- `warn` — deliver an operator warning to a running cell. [intervention/warning.md](intervention/warning.md)
