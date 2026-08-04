# Recovery

## Diagnose

Preserve the run and identify the exact instruction, process result, native session, and failure from `state.json`, `events.jsonl`, and the stage logs. The failing instruction names the file to read.

Always read the launcher's own output after a resume. A refused launch says so there and nowhere else, which is how a cell that is merely unable to start comes to look dead.

When the resume conditions below match, resume immediately after diagnosis and any required runner correction. Do not wait for operator prose or the next reporting interval.

## Free The Cell's Ports

Each cell owns a disjoint block of four ports from base 46000, so two cells never contend. What does contend is a cell and its own past: a killed runner leaves its API server, Swagger, Vite, and Playwright children holding that block, and the next launch fails its pre-launch port check.

| subject  | arm      | api   | swagger | vite  | playwright |
| -------- | -------- | ----- | ------- | ----- | ---------- |
| todo     | evidence | 46000 | 46001   | 46002 | 46003      |
| todo     | plain    | 46010 | 46011   | 46012 | 46013      |
| reddit   | evidence | 46020 | 46021   | 46022 | 46023      |
| reddit   | plain    | 46030 | 46031   | 46032 | 46033      |
| shopping | evidence | 46040 | 46041   | 46042 | 46043      |
| shopping | plain    | 46050 | 46051   | 46052 | 46053      |
| erp      | evidence | 46060 | 46061   | 46062 | 46063      |
| erp      | plain    | 46070 | 46071   | 46072 | 46073      |

Before resuming a stopped cell, confirm its four ports have no listener and stop whatever holds one. A listener on a cell's port while no runner of its own is alive means orphans are blocking recovery, and the reporting subagent reports that as its own condition rather than as a dead cell.

## Resume The Same Run

Resume only when the cell identity, frozen inputs, workspace, CLI version, objective, and native checkpoint still match:

```bash
pnpm --filter @samchon/evidence-benchmark start <engine> <subject> <arm> <model> <effort> <run-id>
```

Keep the cell's original `benchmarkRevision` frozen. When recovery requires a committed runner correction, resume only from a clean descendant revision, which the runner retains as the new process's `runnerRevision`.

Before continuing, the runner revalidates the stored cell, instruction bytes, workspace, artifact digest, CLI, session, Goal, and token boundary. Codex may resume an exact retained Goal checkpoint.

Two retained statuses refuse resume outright:

- `quality-failed` — the run exhausted its supplementation attempts and is finished.
- `checkpointed` — the run was stopped deliberately after `backend-start` and continues only as a derived run.

If the resume itself fails, preserve that attempt, diagnose the new failure, and recover again from the last exact checkpoint. Never abandon a cell, and never loop without evidence.

## Derive A Run From The Backend-Start Checkpoint

After `backend-start` completes, the runner stores a durable checkpoint of the material workspace, prepared Git baseline, native session and terminal turn, CLI version, token boundary, input digests, and inherited timing. It is a recovery point for a later downstream-instruction correction, not permission to modify an active measured workspace.

When a defect is confined to an instruction after `backend-start`, preserve the source run and create a new checkpoint-derived run:

```bash
pnpm --filter @samchon/evidence-benchmark start codex <subject> <arm> <model> <effort> --from-backend-start <source-run-id>
```

The command verifies the retained cell and the exact completed `backend-start` boundary, restores that workspace and reinstalls its dependencies, revalidates the restored digests, reapplies the current non-product instruction surface — `AGENTS.md` and `.agents/` — forks the native thread through the retained terminal turn, and starts the new run at `backend-review` with the current downstream instructions. An explicit operator launch does not reject the checkpoint because repository inputs changed after it was created.

Never edit a checkpoint, its source run, or its retained state. A derived run has a new run ID and records its source lineage and inherited timing; report inherited and continuation measurements together, and never describe it as resuming the original run.

## Cancel The Campaign

Stop the reporting subagent and every liveness watcher first, then force-stop every benchmark command, native process, and owned descendant. Verify that no process still references an affected run.

Preserve every run directory and report each cell as incomplete. Never delete one and never mark it complete.
