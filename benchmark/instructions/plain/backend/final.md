# Backend Final

Did the preceding backend review actually perform the literal, indivisible, full-scope reading required by its instruction? Do not perform a substitute review or use searches, summaries, inventories, builds, tests, or Git status as proof.

If any condition below is unproven, return to the preceding backend review objective and continue it. Complete only when every condition is proven.

Ensure `pnpm check:watch` is running from `packages/backend`, wait for a clean rebuild, and run `pnpm test` against the current implementation. A clean rebuild and passing runtime suite are required but are not proof of the review.

Ensure `pnpm dev` is also running from `packages/backend`, and keep both processes running through Overall Final.

| Verify | Required result |
| --- | --- |
| Scope | One review round covered the complete review table without partitioning |
| Direct reading | Every file in scope was actually read in full |
| Corrections | Every discovered problem was corrected |
| Restart | Every correction restarted the complete review from the beginning |
| Final round | The last full-scope round occurred after the final correction |
| Completion | The last round omitted nothing, found no problem, and made no edit |
