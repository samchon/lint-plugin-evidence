# Evidence Overall Final

Ensure backend `pnpm check:watch`, backend `pnpm dev`, and frontend `pnpm dev` are running. Run `pnpm test` from `packages/backend`, then run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`.

Fix every failure and complete only after both current builds and both live runtime suites succeed.
