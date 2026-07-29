# Frontend Plain Final

Finish the frontend phase with a complete plain-arm Loop Until Dry over the frontend and live-integration scope.

1. Re-read every requirement and decide its user-facing and integration applicability.
2. Review every route, screen, component, hook, form, state, error path, deliberate omission, browser journey, and SDK consumption path.
3. Exercise required states against simulation and exercise persistence, sessions, authorization, and side effects against the live backend.
4. If a finding proves a backend defect, repair it through the named backtracking rule and re-pass the complete backend gate.
5. Fix every finding and restart the complete frontend-scoped round until one entire round is dry.
6. From `packages/frontend`, run `pnpm build`, `pnpm test:e2e`, and `pnpm ui:review`.

Do not run the workspace-root build during this phase. Any failed command, review finding, remaining frontend `@todo`, broken journey, or unverified user-facing requirement means the phase is incomplete.

Report the exact commands and results. State that whole-project verification remains pending.
