# Evidence Backend Final

With the canonical graph active, start `pnpm check:watch` from `packages/backend`, fix every diagnostic, wait for a clean rebuild, then stop the watcher. Run `pnpm test` against the current implementation and fix every failure.

Start `pnpm dev` from `packages/backend` after the runtime suite passes, and keep it running through Overall Final.

## Final Checklist

- [ ] Current watcher rebuild passed with canonical graph configuration active.
- [ ] Current `pnpm test` passed.
- [ ] Backend development process is running from the current workspace.
- [ ] Every gate was rerun after the latest scoped change.

Any unchecked item leaves the Goal active. Fix its cause and rerun every affected gate.
