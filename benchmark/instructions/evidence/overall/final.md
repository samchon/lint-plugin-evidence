# Evidence Overall Final

Do not edit `lint.config.ts` or lower `evidence/graph` from `error`.

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic. Stop it after a rebuild completes without diagnostics.

Run frontend `pnpm lint`. Fix every diagnostic and require exit code 0.

## Final Checklist

- [ ] `lint.config.ts` remained unchanged and `evidence/graph` remained `error`.
- [ ] After the last file change, backend `check:watch` completed a rebuild without diagnostics.
- [ ] After the last file change, frontend `pnpm lint` exited with code 0.
- [ ] Backend `check:watch` stopped after that rebuild.

Any unchecked item leaves the Goal active. Complete that item.
