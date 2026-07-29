# Frontend Evidence Final

Use goal mode for this frontend Evidence final stage. Resume the same unfinished stage goal after an interruption; otherwise create it now. Mark it complete only when the restored frontend Evidence Graph, browser journeys, live integration, and package gates below are all green.

Finish the frontend phase under the active Evidence Graph.

1. Inspect `packages/frontend/lint.config.ts` and restore `frontend-screens` and `frontend-journeys`.
2. If this phase changed API or backend sources, restore their claims and re-pass the complete backend Evidence Graph gate first.
3. From `packages/frontend`, run `pnpm build`, `pnpm test:e2e`, and `pnpm ui:review`.
4. Run the required journeys against the live backend and inspect the browser output.
5. Follow the Evidence and Review skills over every acknowledgement selected by the two frontend claims at this final source digest.

Do not run the workspace-root build during this phase. Any failed command, graph diagnostic, false acknowledgement, changed claim population, remaining frontend `@todo`, broken journey, or unverified user-facing requirement means the phase is incomplete. Fix the owner and rerun the affected claim and package gates.

Report the exact commands and results. State that whole-project verification remains pending.
