# Backend Evidence Final

Use goal mode for this backend Evidence final stage. Resume the same unfinished stage goal after an interruption; otherwise create it now. Mark it complete only when the restored backend Evidence Graph, package gates, tests, and live-server checks below are all green.

Finish the backend phase under the fully active API and backend Evidence Graph.

1. Inspect `packages/api/lint.config.ts` and `packages/backend/lint.config.ts`.
2. Restore every deferred claim in those files.
3. Confirm the active backend-phase inventory is `schema-models`, `api-operations`, `backend-tests`, `dto-types`, and `dto-properties`, with original populations and `error` severities.
4. Follow the Evidence and Review skills over the complete API and backend scope.
5. From `packages/api`, run its canonical lint and build commands.
6. From `packages/backend`, run `pnpm build`, `pnpm lint`, and `pnpm test`.
7. From `packages/backend`, launch `pnpm dev`, verify `/health` and representative requirement-backed operations against the live server, then stop it cleanly.

Do not run the workspace-root build during this phase. Any failed command, graph diagnostic, review finding, unremoved backend `@todo`, or unverified backend requirement means the phase is incomplete. Keep fixing and rerunning the affected backend gates until they are green.

Report the exact commands and results. State explicitly that frontend obligations remain pending.
