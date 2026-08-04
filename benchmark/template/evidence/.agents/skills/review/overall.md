# Overall Review Scope

The scope is the whole application: every active acknowledgement in every claim. Read [backend.md](backend.md) and [frontend.md](frontend.md); this scope is their union.

## Configuration

Compare all three configurations with the baseline: `packages/api/lint.config.ts`, `packages/backend/test/lint.config.ts`, and `packages/frontend/lint.config.ts`.

## Gates

Use the backend `pnpm check:watch` process kept running by Backend Start; fix every diagnostic, wait for a rebuild without diagnostics, and keep it running. Ensure `pnpm dev` is running from `packages/backend` and `packages/frontend` with no diagnostics after the last file change.

After the last correction, run backend `pnpm test` and frontend `pnpm test:e2e` with `VITE_API_SIMULATE=false`, and fix every failure. The compiler processes report type and lint diagnostics only; the suites are the proof that behavior still holds.
