# Evidence Backend

## Configuration

| Configuration | Declares | Checked by |
| --- | --- | --- |
| `packages/api/lint.config.ts` | `dto-types`, `dto-properties` | backend `pnpm build:sdk`, which compiles the API package |
| `packages/backend/test/lint.config.ts` | `schema-models`, `api-operations`, `backend-tests`, `evidence/singular`, `evidence/todo` | backend `pnpm check:watch` |

The DTO claims live in the API package because a TypeScript claim selects only files its own `tsconfig` includes, and the API Program is the one that includes `src/structures/`.

Every other backend rule lives in the test configuration because `test/tsconfig.json` compiles `../src` together with the tests — the one backend Program that holds controllers and test functions alike — and `pnpm check:watch` runs exactly that Program. `packages/backend/lint.config.ts` stays as shipped: `nestia all` inside `pnpm build:sdk` resolves the package configuration, so leaving it untouched keeps SDK generation free of evidence rules.

`evidence/singular` keeps one public identity per file, named after the file. `evidence/todo` fails the build on every remaining JSDoc `@todo` in the Program, exported or not.

## Staged Unlock

Start backend `pnpm check:watch` before implementation while every backend claim is disabled. Delete each `disabled` at exactly the point its layer completes.

- **Too early:** the first selected host activates the complete claim, so the watcher emits thousands of diagnostics for models, operations, and tags not yet written. The flood buries real diagnostics, fills context, and impairs decisions.
- **Too late:** the layer's obligations arrive as one huge batch after work has moved on. Coverage gaps — a requirement no model, operation, or test answers — surface only then, when fixing them reopens finished layers, and tags retrofitted in bulk drift toward compiler-satisfying filler instead of truthful mappings.

1. After the complete schema passes `pnpm build:prisma` and `pnpm schema`, delete `disabled` from `schema-models`.
2. After every DTO and controller is complete and `pnpm build:sdk` passes, delete `disabled` from `dto-types`, `dto-properties`, and `api-operations`.
3. After every public-operation test is written, delete `disabled` from `backend-tests`.
4. Finish every provider with the watcher running: replace every controller stub, remove every source-owned `@todo` under `packages/api` and `packages/backend`, then run `pnpm test` and fix every failure.

After each deletion, fix the complete diagnostic batch, complete the truthful evidence mappings, and wait for a rebuild without diagnostics before continuing to the next stage.

Keep the watcher running through Overall Final; `pnpm test` does not report every type or lint diagnostic.

## Operation Reference

The `backend-tests` operation reference refuses `@evidenceExclude` and admits exactly one operation per test: every published operation is proved by a backend test, or the product is incomplete. Cite the one operation the test proves; write a missing test instead of excluding its operation.
