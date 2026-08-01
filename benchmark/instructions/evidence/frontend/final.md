# Evidence Frontend Final

Start a bounded backend `pnpm check:watch` with the canonical graph active, wait for a clean rebuild, then stop the watcher. Ensure backend `pnpm dev` and frontend `pnpm dev` are running, then run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`.

Fix every failure and keep both development processes running through Overall Final.

## Final Checklist

- [ ] Current backend graph rebuild passed with canonical graph configuration active.
- [ ] Current production build and live-backend browser suite passed.
- [ ] Backend and frontend development processes are running from the current workspace.
- [ ] Every gate was rerun after the latest scoped change.

Any unchecked item leaves the Goal active. Fix its cause and rerun every affected gate.
