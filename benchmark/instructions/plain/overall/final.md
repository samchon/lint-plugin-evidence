Ignore the preceding completion reports. Check the actual work against the quoted Overall Review below.

Confirm all four:

- Every scoped file, cross-layer relationship, and live journey was reviewed in full.
- All findings and consequences were fixed.
- Every change was followed by a new full round.
- The last full round found nothing and made no edit.

If any item is false or uncertain, perform the quoted Overall Review now and repeat full rounds until all are true. Do not stop with an explanation or unsupported claim.

Then:

- Keep backend `pnpm check:watch` and `pnpm dev` running and clean.
- Keep frontend `pnpm dev` running and clean.
- Run `pnpm test` from `packages/backend`.
- Run `pnpm test:e2e` from `packages/frontend` with `VITE_API_SIMULATE=false`.

Do not complete this Goal until the review conditions and every final gate are satisfied.
