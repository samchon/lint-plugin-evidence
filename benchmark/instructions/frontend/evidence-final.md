# Frontend Evidence Final

Treat this frontend Evidence final stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Declare it complete only when the complete frontend Loop Until Dry, the fully active Evidence Graph, browser journeys, live integration, and package gates below are all green.

The skills-contract turn remains binding. Re-read `AGENTS.md` and the applicable Frontend, Evidence, and Review instructions in full before any final-stage action.

Restore the complete Evidence configuration before the closing review:

1. Inspect both canonical package `lint.config.ts` files.
2. Restore all seven original claim objects and confirm their original populations and `error` severities.
3. Confirm the sealed backend main and test Program projections are unchanged.
4. If this phase changed API or backend sources, re-pass the complete backend gate first.

Finish the frontend phase with the same complete Loop Until Dry over the frontend and live-integration scope. Each complete round must:

1. re-read every requirement and decide its user-facing and integration applicability;
2. review every route, screen, component, hook, form, state, error path, deliberate omission, browser journey, and SDK consumption path;
3. exercise required states against simulation and exercise persistence, sessions, authorization, and side effects against the live backend;
4. repair any proven backend defect through the named backtracking rule and re-pass the complete backend gate;
5. fix every frontend finding; and
6. from `packages/frontend`, run `pnpm build`, `pnpm test:e2e`, and `pnpm ui:review`.

From the workspace root, run `rg --hidden -n -F '@todo' packages/frontend --glob '*.ts' --glob '*.tsx'` and require no matches. This source-scoped search excludes the Evidence instruction files that teach the tag.

Any finding, correction, generated-output change, or failed gate makes the round non-dry. Restart the complete frontend-scoped round at the resulting source digest. Stop after one entire current-digest round finds zero actionable defect and leaves every gate current and green; one dry round is sufficient.

Do not run the workspace-root build during this phase. Any failed command, review finding, graph diagnostic, false acknowledgement, changed claim population, remaining frontend `@todo`, broken journey, or unverified user-facing requirement means the phase is incomplete.

Report the exact commands and results. State that whole-project verification remains pending.
