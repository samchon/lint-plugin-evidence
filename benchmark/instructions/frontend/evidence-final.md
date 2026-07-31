# Frontend Evidence Final

Treat this frontend Evidence final stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Declare it complete only when the fully active Evidence Graph, browser journeys, live integration, and package gates below are all green.

The skills-contract turn remains binding. Re-read `AGENTS.md` and the applicable Frontend, Evidence, and Review instructions in full before any final-stage action.

Restore the complete Evidence configuration before the closing review:

1. Inspect both canonical package `lint.config.ts` files.
2. Restore all seven original claim objects and confirm their original populations and `error` severities.
3. Confirm the sealed backend main and test Program projections are unchanged.
4. If this phase changed API or backend sources, re-pass the complete backend gate first.

Finish the frontend phase under the fully active Evidence Graph:

1. From `packages/frontend`, run `pnpm build`, `pnpm test:e2e`, and `pnpm ui:review`.
2. Run the required journeys against the live backend and inspect the browser output.
3. Start a fresh candidate review round at the first Review-skill population. Inspect every current host, common residual, and acknowledgement selected by the two frontend claims with all seven claims active; a digest, count, route list, prior ledger, or green gate is not review evidence.

From the workspace root, run `rg --hidden -n -F '@todo' packages/frontend --glob '*.ts' --glob '*.tsx'` and require no matches. This source-scoped search excludes the Evidence instruction files that teach the tag.

Do not run the workspace-root build during this phase. Any failed command, graph diagnostic, false acknowledgement, changed claim population, remaining frontend `@todo`, broken journey, or unverified user-facing requirement means the phase is incomplete. Any source, configuration, generated-output, or formatting change invalidates the candidate round: fix the owner, rerun the affected claim and package gates, then restart the complete Review-skill population from its first item.

Report the exact commands and results. State that whole-project verification remains pending.
