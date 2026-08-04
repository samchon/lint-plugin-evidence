# Evidence Frontend

`packages/frontend/lint.config.ts` declares all three frontend claims; the frontend is one Program and one configuration.

## Claim Chain

A hook cites the operations it calls, a screen cites the hooks it uses, and a journey cites the screens it walks. A hook wrapping an accessor no screen renders satisfies `frontend-hooks` and fails `frontend-screens`.

A hook may cite as many operations as it calls; the obligation is consuming the published surface, not one call per hook.

The operation and hook references refuse `@evidenceExclude` — an unconsumed operation or unused hook is missing work, so write the missing hook or screen instead of excluding it. The requirement and screen references accept a reviewed exclusion.

A journey cites each page it walks as `{@link ThatPage}` resolved through its own type-only import.

## Staged Unlock

Start frontend `pnpm dev` before implementation while every frontend claim is disabled. Enable the claims in chain order, each at exactly the point its layer completes.

- **Too early:** the first hook, page, or journey activates the complete claim, so the dev process emits thousands of diagnostics for artifacts not yet written. The flood buries real diagnostics, fills context, and impairs decisions.
- **Too late:** the chain's obligations arrive as one huge batch after work has moved on. An operation no hook consumes or a screen no journey walks surfaces only then, when fixing it reopens finished layers, and tags retrofitted in bulk drift toward compiler-satisfying filler instead of truthful mappings.

1. After every domain hook is complete, delete `disabled` from `frontend-hooks`.
2. After every screen is complete, delete `disabled` from `frontend-screens`.
3. After every journey is complete, delete `disabled` from `frontend-journeys`.

After each deletion, fix the complete diagnostic batch, complete the truthful evidence mappings, and wait for a reload without diagnostics before continuing to the next stage.

Keep `pnpm dev` running through Overall Final.

## Runtime Check

Remove every source-owned `@todo` under `packages/frontend`. Ensure `pnpm dev` is running from `packages/backend`, and keep both processes running through Overall Final.

Run `pnpm test:e2e` with `VITE_API_SIMULATE=false` against the live backend and fix every failure. After the last fix, require a frontend reload without diagnostics and an E2E exit code of 0.
