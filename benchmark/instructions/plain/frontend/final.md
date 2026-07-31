# Frontend Final

Did the preceding frontend review actually perform the literal, indivisible, full-scope reading required by its instruction? Do not perform a substitute review or use searches, summaries, inventories, builds, tests, or Git status as proof.

If any condition below is unproven, return to the preceding frontend review objective and continue it. Complete only when every condition is proven.

Ensure backend `pnpm check:watch`, backend `pnpm dev`, and frontend `pnpm dev` are running. Run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`. A clean development build, production build, and passing live-backend browser suite are required but are not proof of the review.

Keep the three processes running through Overall Final.

| Verify | Required result |
| --- | --- |
| Scope | One review round covered the complete review table without partitioning |
| Direct reading | Every file in scope was actually read in full |
| Corrections | Every discovered problem was corrected |
| Restart | Every correction restarted the complete review from the beginning |
| Final round | The last full-scope round occurred after the final correction |
| Completion | The last round omitted nothing, found no problem, and made no edit |
