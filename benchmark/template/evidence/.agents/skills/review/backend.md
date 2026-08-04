# Backend Review Scope

The scope is the backend: every active acknowledgement in the `schema-models`, `api-operations`, `dto-types`, `dto-properties`, and `backend-tests` claims.

## Exclusion Carriers

Read all four in full:

- `packages/backend/prisma/schema/exclude.schema`
- `packages/api/src/structures/DTO_EVIDENCE_EXCLUDE.ts`
- `packages/backend/src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts`
- `packages/backend/test/features/TEST_EVIDENCE_EXCLUDE.ts`

`backend-tests` accepts an exclusion for a requirement only. An entry there answering for an operation, or any exclusion standing in for a schema model, an operation, or a test this layer owes, is a finding.

## Configuration

Compare `packages/api/lint.config.ts` (DTO claims) and `packages/backend/test/lint.config.ts` (schema, operation, and test claims with the file rules) with the baseline.

## Gates

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic, wait for a rebuild without diagnostics, and keep it running.

After the last correction, run `pnpm test` from `packages/backend` and fix every failure. The watcher reports type and lint diagnostics only; the suite is the proof that behavior still holds.
