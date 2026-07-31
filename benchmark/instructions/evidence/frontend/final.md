# Evidence Frontend Final

Start backend `pnpm check:watch`, fix every diagnostic, wait for a clean rebuild, then stop the watcher. Ensure backend `pnpm dev` and frontend `pnpm dev` are running, then run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`.

Fix every failure and complete only after the compiler gate, current development build, production build, and live-backend browser tests all succeed. Keep both development processes running through Overall Final.
