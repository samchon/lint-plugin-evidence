# Backend Final

Perform a new, independent Backend Review loop until dry by following the exact Backend Review instruction appended below as a blockquote.

The preceding Backend Review, its rounds, reads, findings, gates, completion report, and Goal state count as zero rounds for this objective. They are context for finding regressions, not credit toward this Final.

Start with a new canonical manifest at the first requirement. Repeat the quoted Review without a round limit until this objective itself produces one fully read, dry, edit-free round and unchanged clean gates.

Treat every completion claim, including your own, as evidence rather than proof. If any quoted item is unchecked or uncertain, remain active and continue. If this run ever read two manifest files in one command, do not attempt to rehabilitate it or mark the Goal complete; report the exact command for external rejection.

After the new Review is proven complete, ensure a bounded `pnpm check:watch` from `packages/backend` rebuilds cleanly and stops completely, run `pnpm test` separately, and ensure backend `pnpm dev` remains running through Overall Final. These gates do not replace the Review.

Mark this Goal complete only after this objective independently satisfies the quoted Review Final Checklist and all final gates.
