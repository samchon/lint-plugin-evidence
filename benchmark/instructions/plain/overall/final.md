# Overall Final

Did the preceding Overall Review satisfy every sentence of the exact Overall Review instruction quoted below?

Audit the preceding work against the quoted instruction. Treat its completion report as evidence, not proof by itself.

If any requirement is absent, incomplete, or uncertain, perform the quoted Overall Review now. Start at the first requirement, read the full scope literally, fix every finding and consequence, and repeat without limit until one full round is dry and edit-free.

After the Review is proven complete, ensure backend `pnpm check:watch`, backend `pnpm dev`, and frontend `pnpm dev` are running and clean. Run `pnpm test` from `packages/backend`, then run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`. These gates do not replace the Review.

## Final Checklist

- [ ] Preceding or repeated Overall Review satisfies every quoted instruction and Review skill checklist item.
- [ ] No discretionary judgment changed scope, round boundaries, stopping conditions, or procedure.
- [ ] Literal full reading covered every required instruction and application artifact.
- [ ] Every finding and consequence fixed; derived artifacts regenerated.
- [ ] Every correction followed by a new full round; final full round dry and edit-free.
- [ ] Watcher and dev servers clean; backend and live browser tests passed.

Any unchecked or uncertain item leaves the Goal Mode completion conditions unmet. Perform the quoted Overall Review again from the first requirement. Mark this Goal complete only after every item is checked.
