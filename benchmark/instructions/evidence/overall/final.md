# Evidence Overall Final

Confirm every claim remains enabled. Do not edit `lint.config.ts` or lower `evidence/graph` from `error`.

Use the backend `pnpm check:watch` process kept running by Backend Start. Fix every diagnostic and stop it after a rebuild completes without diagnostics.

Use the frontend `pnpm dev` process kept running by Frontend Start. Fix every diagnostic, wait for a reload without diagnostics, and keep it running.

## Final Checklist

- [ ] Every claim remained enabled; `lint.config.ts` otherwise remained unchanged and `evidence/graph` remained `error`.
- [ ] After the last file change, backend `check:watch` completed a rebuild without diagnostics.
- [ ] After the last file change, frontend `pnpm dev` completed a reload without diagnostics and remains running.
- [ ] Backend `check:watch` stopped after that rebuild.

Any unchecked item leaves the Goal active. Complete that item.
