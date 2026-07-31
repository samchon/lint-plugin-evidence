# Frontend Plain Final

Treat this frontend Plain final stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Declare it complete only when the complete frontend Restart Until Dry, browser journeys, live integration, and package gates below are all green.

The skills-contract turn remains binding. Re-read `AGENTS.md` and the applicable Frontend and Review instructions in full before any final-stage action.

Finish the frontend phase with a complete plain-arm Restart Until Dry over the frontend and live-integration scope. Each complete round must:

1. re-read every requirement and decide its user-facing and integration applicability;
2. review every route, screen, component, hook, form, state, error path, deliberate omission, browser journey, and SDK consumption path;
3. exercise required states against simulation and exercise persistence, sessions, authorization, and side effects against the live backend;
4. repair any proven backend defect through the named backtracking rule and re-pass the complete backend gate;
5. fix every frontend finding; and
6. from `packages/frontend`, run `pnpm build`, `pnpm test:e2e`, and `pnpm ui:review`.

The qualifying dry round begins only after the most recent finding, correction, generated-output change, formatting change, or failed gate has been resolved. Work performed before that event belongs to an invalidated round and cannot be reused. Record the frontend/integration source-population digest at the beginning of each candidate round and recompute it at the end. Equal digests prove only that the round used one stable state; they never substitute for rereading or reviewing that state.

Any finding, correction, generated-output change, formatting change, or failed gate makes the round non-dry. Stop the traversal, resolve the invalidation, and restart at item 1 against the resulting source digest. Do not continue from the artifact after the finding, reread only changed files, or count a post-gate digest, route count, placeholder scan, or partial audit as the restart. Stop after one entire current-digest round finds zero actionable defect and leaves every gate current and green; one dry round is sufficient.

Do not run the workspace-root build during this phase. Any failed command, review finding, unfinished frontend stub, remaining frontend implementation marker, broken journey, or unverified user-facing requirement means the phase is incomplete.

Report the exact commands and results. State that whole-project verification remains pending.
