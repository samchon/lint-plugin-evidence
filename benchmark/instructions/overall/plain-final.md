# Overall Plain Final

Treat this whole-project Plain final stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Declare it complete only when the full-project Restart Until Dry, every requirement, every test, and every canonical gate below are green.

The skills-contract turn remains binding. Re-read `AGENTS.md` and every applicable project, layer, and Review instruction in full before any final-stage action.

From the workspace root, run `pnpm format` before beginning the candidate round. Formatting is preparation: if a later correction changes source, format again before restarting at the resulting digest.

Complete final verification with a full-project Restart Until Dry. Each complete round must:

1. re-read every requirement and review every database, API, backend, frontend, integration, test, generated output, mapping, negative path, state transition, and deliberate omission;
2. trace every requirement forward and every artifact backward without dividing the round by layer, file, lens, subset, finding, or time;
3. fix every finding and regenerate affected outputs;
4. from the workspace root, run `pnpm build`, `pnpm lint`, `pnpm prepare:database`, and `pnpm test`; and
5. from `packages/frontend`, run `pnpm ui:review`, then complete the required live backend and browser verification.

The qualifying dry round begins only after the most recent finding, correction, generated-output change, formatting change, or failed gate has been resolved. Work performed before that event belongs to an invalidated round and cannot be reused. Record the full-project source-population digest at the beginning of each candidate round and recompute it at the end. Equal digests prove only that the round used one stable state; they never substitute for rereading or reviewing that state.

Any finding, correction, generated-output change, formatting change, or failed gate makes the round non-dry. Stop the traversal, format the corrected state, and restart at item 1 against the resulting source digest. Do not continue from the artifact after the finding, reread only changed files, or count a post-gate digest, route count, placeholder scan, or partial audit as the restart. Stop after one entire current-digest round finds zero actionable defect and leaves every gate current and green; one dry round is sufficient.

Any failed command, review finding, unfinished stub, remaining implementation marker, stale verdict, uncovered requirement, unowned artifact, or unverified assumption means the application is incomplete. Keep fixing and repeating the complete overall round until every gate is green.

Report the exact commands and results.
