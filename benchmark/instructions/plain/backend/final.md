Use Final as a last safety check, not a new Review. Verify the quoted report against current sources: every operation has two sole-primary business scenarios with public observable assertions, every finding and consequence is fixed, and Review ended dry. Do not repeat proven work; fix and verify any residual gap you actually find.

In `packages/backend`, stop `pnpm dev` before `pnpm test` because both own the API port; after the test passes, restart dev. Finish only when clean `pnpm check:watch` and restarted dev processes remain running through Overall Final.
