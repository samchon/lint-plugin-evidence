# Evidence Backend Final

Confirm every backend claim remains enabled. Do not edit `lint.config.ts` or lower `evidence/graph` from `error`.

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic and wait for a rebuild without diagnostics. Keep it running.

Run backend `pnpm test` and fix every failure.

## Final Checklist

- [ ] Every backend claim remained enabled; `lint.config.ts` otherwise remained unchanged and `evidence/graph` remained `error`.
- [ ] After the last backend file change, `check:watch` completed a rebuild without diagnostics.
- [ ] Backend `check:watch` remains running.
- [ ] Backend `pnpm test` passed with complete operation-scenario coverage.

Any unchecked item leaves the Goal active. Complete that item.
