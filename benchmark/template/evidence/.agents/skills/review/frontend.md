# Frontend Review Scope

The scope is the frontend: every active acknowledgement in the `frontend-hooks`, `frontend-screens`, and `frontend-journeys` claims.

## Configuration

Compare `packages/frontend/lint.config.ts` with the baseline.

## Gates

Ensure `pnpm dev` is running from `packages/backend` and `packages/frontend`. Their output must contain no diagnostics after the last file change.

After the last correction, run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false` and fix every failure. A clean reload proves the bundle compiles, not that a journey still completes.
