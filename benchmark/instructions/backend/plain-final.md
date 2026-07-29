# Backend Plain Final

Use goal mode for this backend Plain final stage. Resume the same unfinished stage goal after an interruption; otherwise create it now. Mark it complete only when the complete backend Loop Until Dry and every package, test, and live-server gate below are green.

Finish the backend phase with a complete plain-arm Loop Until Dry over the API and backend scope.

1. Re-read every requirement and decide its API and backend applicability.
2. Review every current schema unit, DTO, controller operation, provider branch, database access, backend test assertion, negative path, authorization rule, and generated SDK contract.
3. Fix every finding, regenerate affected outputs, rerun invalidated checks, and restart the complete backend-scoped round until one entire round is dry.
4. From `packages/api`, run its canonical lint and build commands.
5. From `packages/backend`, run `pnpm build`, `pnpm lint`, and `pnpm test`.
6. From `packages/backend`, launch `pnpm dev`, verify `/health` and representative requirement-backed operations against the live server, then stop it cleanly.

Do not run the workspace-root build during this phase. Any failed command, review finding, unremoved backend `@todo`, or unverified backend requirement means the phase is incomplete. Do not mark frontend obligations accepted; they remain pending.

Report the exact commands and results.
