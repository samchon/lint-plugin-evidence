# Frontend Evidence Final

Use goal mode for this frontend Evidence final stage. Resume the same unfinished stage goal after an interruption; otherwise create it now. Mark it complete only when the restored frontend Evidence Graph, browser journeys, live integration, and package gates below are all green.

The skills-contract turn remains binding. Re-read `AGENTS.md` and the applicable Frontend, Evidence, and Review instructions in full before any final-stage action.

Finish the frontend phase under the active Evidence Graph.

1. Inspect all three package `lint.config.ts` files. Restore all seven original claim objects and confirm their original populations and `error` severities.
2. If this phase changed API or backend sources, re-pass the complete backend Evidence Graph gate first.
3. From `packages/frontend`, run `pnpm build`, `pnpm test:e2e`, and `pnpm ui:review`.
4. Run the required journeys against the live backend and inspect the browser output.
5. Follow the Evidence and Review skills over every acknowledgement selected by the two frontend claims at this final source digest, with all seven claims active.

Do not run the workspace-root build during this phase. Any failed command, graph diagnostic, false acknowledgement, changed claim population, remaining frontend `@todo`, broken journey, or unverified user-facing requirement means the phase is incomplete. Fix the owner and rerun the affected claim and package gates.

Report the exact commands and results. State that whole-project verification remains pending.
