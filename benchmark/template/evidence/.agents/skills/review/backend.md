# Backend Review Scope

The scope is the backend: every active acknowledgement in the `schema-models`, `api-operations`, `dto-types`, `dto-properties`, and `backend-tests` claims.

## Configuration

Compare `packages/api/lint.config.ts` (DTO claims) and `packages/backend/test/lint.config.ts` (schema, operation, and test claims with the file rules) with the baseline.

## Gates

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic, wait for a rebuild without diagnostics, and keep it running.

After the last correction, run `pnpm test` from `packages/backend` and fix every failure. The watcher reports type and lint diagnostics only; the suite is the proof that behavior still holds.
