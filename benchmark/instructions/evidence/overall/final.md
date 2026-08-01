# Evidence Overall Final

Start a bounded backend `pnpm check:watch` with the canonical graph active, wait for a clean rebuild, then stop the watcher. Ensure backend `pnpm dev` and frontend `pnpm dev` are running. Run `pnpm test` from `packages/backend`, then run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`.

Fix every failure against the current workspace.

## Final Checklist

- [ ] Current backend graph rebuild passed with canonical graph configuration active.
- [ ] Current backend runtime suite passed.
- [ ] Current frontend production build and live-backend browser suite passed.
- [ ] Both development processes are clean and every gate was rerun after the latest scoped change.

Any unchecked item leaves the Goal active. Fix its cause and rerun every affected gate.
