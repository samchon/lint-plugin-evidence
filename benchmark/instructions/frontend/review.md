# Frontend Review

Treat this frontend review stage as one bounded objective. Preserve the same unfinished objective across an interruption; otherwise begin it now. Declare it complete only when the active arm's Review skill says the Frontend Phase is complete.

The skills-contract turn remains binding. Re-read `AGENTS.md`, the Frontend Layer Gate, and the active arm's Review skill in full before any review action. Follow the Review skill's Frontend Phase scope literally.

This is an independent review objective. Start a fresh complete Frontend Phase review at the first applicable requirement even when the source digest is unchanged and the implementation stage claimed a clean review. Do not reuse an implementation-stage traversal, digest, inventory, ledger entry, placeholder search, gate result, or completion claim as any part of this stage's required traversal. A digest identifies the state being reviewed; it never proves that state was reviewed.

The qualifying review must begin after the most recent finding, correction, generated-output change, or failed gate. Any such event invalidates the current traversal. Resolve it, then restart the complete Frontend Phase review at the first applicable requirement; reads and verdicts from before the invalidating event do not count toward completion. If a finding proves a backend defect, repair it only through the named backtracking rule and re-pass the backend gate before restarting.

Do not stop early, ask whether to continue, propose splitting the review, or claim whole-project completion. Report the exact findings, corrections, and current frontend gate results.
