# Backend Evidence Final

Use goal mode for this backend Evidence final stage. Resume the same unfinished stage goal after an interruption; otherwise create it now. Mark it complete only when the restored backend Evidence Graph, package gates, tests, and live-server checks below are all green.

Finish the backend phase under the fully active API and backend Evidence Graph.

1. Inspect `packages/api/lint.config.ts` and `packages/backend/lint.config.ts`.
2. Restore every deferred claim in those files.
3. Confirm the active backend-phase inventory is `schema-models`, `api-operations`, `backend-tests`, `dto-types`, and `dto-properties`, with original populations and `error` severities.
4. From `packages/backend`, run `pnpm build:prisma` and `pnpm prepare`.
5. From `packages/api`, run `pnpm lint` and `pnpm build`.
6. Return to `packages/backend` and run `pnpm build:main`.
7. Confirm every operation and DTO is settled, then run `pnpm build:sdk`.
8. Run `pnpm build:test`, `pnpm lint`, and `pnpm test`.
9. Launch `pnpm dev`, verify `/health` and representative requirement-backed operations against the live server, then stop it cleanly.
10. Follow the Evidence and Review skills over every acknowledgement selected by the five claims at this final source digest.

Run the commands serially. Do not run the backend package's aggregate `pnpm build` or the workspace-root build during this phase. Any failed command, graph diagnostic, false acknowledgement, changed claim population, unremoved backend `@todo`, or unverified backend requirement means the phase is incomplete. Fix the owner and rerun the affected claim and package gates.

Report the exact commands and results. State explicitly that frontend obligations remain pending.
