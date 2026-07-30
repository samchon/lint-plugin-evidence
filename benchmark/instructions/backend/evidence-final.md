# Backend Evidence Final

Treat this backend Evidence final stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Declare it complete only when the complete backend Loop Until Dry, the fully active backend Evidence Graph, and every package, test, and live-server gate below are green.

The skills-contract turn remains binding. Re-read `AGENTS.md` and the applicable Backend, Evidence, and Review instructions in full before any final-stage action.

Restore the backend Evidence configuration before the closing review:

1. Inspect `packages/backend/lint.config.ts`; confirm the sealed `packages/backend/lint.config.main.ts` and `packages/backend/lint.config.test.ts` Program projections are unchanged.
2. Restore every deferred claim in the canonical backend file.
3. Confirm the active backend-phase inventory is `schema-models`, `api-operations`, `backend-tests`, `dto-types`, and `dto-properties`, with original populations and `error` severities.

Finish the backend phase with the same complete Loop Until Dry over the API and backend scope. Each complete review round must include these gates:

1. Re-read every requirement and decide its API and backend applicability.
2. Review every current schema unit, DTO, controller operation, provider branch, database access, backend test assertion, negative path, authorization rule, and generated SDK contract.
3. Fix every finding.
4. From `packages/backend`, run `pnpm build:prisma` and `pnpm prepare`.
5. From `packages/backend`, run `pnpm build:api` and `pnpm build:main`.
6. Confirm every operation and DTO is settled, then run `pnpm build:sdk`.
7. Run `pnpm build:test`, `pnpm lint`, `pnpm test`, and the live-server checks.

From the workspace root, run `rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'` and require no matches. This source-scoped search excludes the Evidence instruction files that teach the tag.

Any finding, correction, generated-output change, or failed gate makes the round non-dry. Restart the complete backend-scoped round at the resulting source digest. Stop after one entire current-digest round finds zero actionable defect and leaves every gate current and green; one dry round is sufficient.

Run the commands serially. Do not run the backend package's aggregate `pnpm build` or the workspace-root build during this phase. Any failed command, review finding, graph diagnostic, false acknowledgement, changed claim population, unremoved backend `@todo`, or unverified backend requirement means the phase is incomplete. Do not mark frontend obligations accepted; they remain pending.

Report the exact commands and results.
