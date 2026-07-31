# Backend Evidence Final

Treat this backend Evidence final stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Declare it complete only when the fully active backend Evidence Graph and every package, test, and live-server gate below are green.

The skills-contract turn remains binding. Re-read `AGENTS.md` and the applicable Backend, Evidence, and Review instructions in full before any final-stage action.

Restore the backend Evidence configuration before the closing review:

1. Inspect `packages/backend/lint.config.ts`; confirm the sealed `packages/backend/lint.config.main.ts` and `packages/backend/lint.config.test.ts` Program projections are unchanged.
2. Restore every deferred claim in the canonical backend file.
3. Confirm the active backend-phase inventory is `schema-models`, `api-operations`, `backend-tests`, `dto-types`, and `dto-properties`, with original populations and `error` severities.

Finish the backend phase under the fully active backend Evidence Graph:

1. From `packages/backend`, run `pnpm build:prisma` and `pnpm prepare:database`.
2. Run `pnpm build:api` and `pnpm build:main`.
3. Run `pnpm lint` with all five backend claims active.
4. Confirm every operation and DTO is settled, then run `pnpm build:sdk`.
5. Run `pnpm build:test`, `pnpm lint`, `pnpm test`, and the live-server checks.
6. Start a fresh candidate review round at the first Review-skill population. Inspect every current host, common residual, and acknowledgement selected by the five active claims; a digest, count, route list, prior ledger, or green gate is not review evidence.

From the workspace root, run `rg --hidden -n -F '@todo' packages/api packages/backend --glob '*.ts'` and require no matches. This source-scoped search excludes the Evidence instruction files that teach the tag.

Run the commands serially. Do not run the backend package's aggregate `pnpm build` or the workspace-root build during this phase. Any failed command, graph diagnostic, false acknowledgement, changed claim population, unremoved backend `@todo`, or unverified backend requirement means the phase is incomplete. Any source, configuration, generated-output, or formatting change invalidates the candidate round: fix the owner, rerun the affected claim and package gates, then restart the complete Review-skill population from its first item. Do not mark frontend obligations accepted; they remain pending.

Report the exact commands and results.
