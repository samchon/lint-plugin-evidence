# Evidence Overall Final

Start backend `pnpm check:watch`, fix every diagnostic, wait for a clean rebuild, then stop the watcher. Ensure backend `pnpm dev` and frontend `pnpm dev` are running. Run `pnpm test` from `packages/backend`, then run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`.

Fix every failure and complete only after both current builds and both live runtime suites succeed.
