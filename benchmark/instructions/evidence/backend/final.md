# Evidence Backend Final

Do not edit `lint.config.ts` or lower `evidence/graph` from `error`.

Start backend `pnpm check:watch`. Fix every diagnostic, wait for a clean rebuild, and stop the watcher. Any resulting source correction requires a new clean rebuild before stopping it again.

## Final Checklist

- [ ] `lint.config.ts` remained unchanged and `evidence/graph` remained `error`.
- [ ] After the last backend file change, `check:watch` completed a rebuild without diagnostics.
- [ ] Backend `check:watch` stopped after that clean rebuild.

Any unchecked item leaves the Goal active. Complete that item.
