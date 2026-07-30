# Backend Plain Final

Treat this backend Plain final stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Declare it complete only when the complete backend Restart Until Dry and every package, test, and live-server gate below are green.

The skills-contract turn remains binding. Re-read `AGENTS.md` and the applicable Backend and Review instructions in full before any final-stage action.

Finish the backend phase with a complete plain-arm Restart Until Dry over the API and backend scope.

Each complete review round must include these gates:

1. Re-read every requirement and decide its API and backend applicability.
2. Review every current schema unit, DTO, controller operation, provider branch, database access, backend test assertion, negative path, authorization rule, and generated SDK contract.
3. Fix every finding.
4. From `packages/backend`, run `pnpm build:prisma` and `pnpm prepare:database`.
5. From `packages/backend`, run `pnpm build:api` and `pnpm build:main`.
6. Confirm every operation and DTO is settled, then run `pnpm build:sdk`.
7. Run `pnpm build:test`, `pnpm lint`, `pnpm test`, and the live-server checks.

Any finding, correction, generated-output change, or failed gate makes the round non-dry. Restart the complete backend-scoped round at the resulting source digest. Stop after one entire current-digest round finds zero actionable defect and leaves every gate current and green; one dry round is sufficient.

Run the commands serially. Do not run the backend package's aggregate `pnpm build` or the workspace-root build during this phase. Any failed command, review finding, unfinished backend stub, remaining backend implementation marker, or unverified backend requirement means the phase is incomplete. Do not mark frontend obligations accepted; they remain pending.

Report the exact commands and results.
