# Overall Final

Did the preceding Overall Review satisfy the exact Overall Review instruction appended below as a blockquote?

Treat the preceding completion report as evidence, not proof. Check every quoted instruction and its Final Checklist.

If any item is unchecked or uncertain, the Goal Mode completion conditions are unmet. Perform the quoted Overall Review now from the first requirement and repeat until every item is checked.

After the Review is proven complete, ensure backend `pnpm check:watch`, backend `pnpm dev`, and frontend `pnpm dev` are running and clean. Run `pnpm test` from `packages/backend`, then run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`. These gates do not replace the Review.

Mark this Goal complete only after the quoted Review Final Checklist and all final gates are complete.
