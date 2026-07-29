# Overall Plain Final

Use goal mode for this whole-project Plain final stage. Resume the same unfinished stage goal after an interruption; otherwise create it now. Mark it complete only when the full-project Loop Until Dry, every requirement, every test, and every canonical gate below are green.

Complete final verification with a full-project Loop Until Dry. Each complete round must:

1. re-read every requirement and review every database, API, backend, frontend, integration, test, generated output, mapping, negative path, state transition, and deliberate omission;
2. trace every requirement forward and every artifact backward without dividing the round by layer, file, lens, subset, finding, or time;
3. fix every finding and regenerate affected outputs;
4. from the workspace root, run `pnpm format`, `pnpm build`, `pnpm lint`, `pnpm prepare:database`, and `pnpm test`; and
5. from `packages/frontend`, run `pnpm ui:review`, then complete the required live backend and browser verification.

Any finding, correction, generated-output change, formatting change, or failed gate makes the round non-dry. Restart the complete overall round at the resulting source digest. Stop after one entire current-digest round finds zero actionable defect and leaves every gate current and green; one dry round is sufficient.

Any failed command, review finding, remaining `@todo`, stale verdict, uncovered requirement, unowned artifact, or unverified assumption means the application is incomplete. Keep fixing and repeating the complete overall round until every gate is green.

Report the exact commands and results.
