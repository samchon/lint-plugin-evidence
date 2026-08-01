---
name: review
description: Defines the full-scope review loop until dry and final self-check for backend, frontend, and overall review objectives. Read for a review objective or when a final objective must complete an omitted review.
---

# Review

The compiler reports defects in artifacts that exist. It cannot report a required model, operation, test, screen, or journey nobody created. Completeness therefore requires direct review of the entire current scope.

`docs/analysis/` is immutable and authoritative. Correct the application, never the requirements. Any application artifact may be wrong, including an upstream schema or DTO that every downstream layer copied consistently.

Read the detailed procedure for the current objective before beginning:

- Backend Review: `backend.md`
- Frontend Review: `frontend.md`
- Overall Review: `overall.md`

## Review Loop Until Dry

**Review loop until dry** means this exact procedure:

1. Perform one read-only, literal full reading of the entire current scope and apply every branch in the detailed procedure.
2. Keep a current-round finding list while continuing through the final scoped artifact. Do not edit the product or stop the round after finding several problems.
3. After the full round ends, fix every finding and its complete consequence surface, regenerate derived artifacts, and settle the required compiler and runtime gates.
4. Start another literal full reading at the first requirement. Correction work and reads from earlier rounds count as nothing in the new round.
5. Repeat without any round limit until one entire current round reaches the end, finds no problem, and makes no product or generated-file edit.

This is a real exhaustive review loop, not shorthand, aspiration, or rhetoric. No exception or discretionary judgment may shorten or replace it.

## Scope

The detailed procedure defines the product files, live behavior, journeys, and relationships in scope.

Generated SDK output is a current consumer contract. Inspect it but correct its authored source and regenerate it instead of editing generated output directly. Dependencies, caches, logs, screenshots, build output, generated Prisma clients, and review bookkeeping are not product review scope.

Do not exclude an item because it is generated, large, repetitive, configuration-only, apparently trivial, unchanged, or already examined during an earlier objective, round, or correction.

## Findings

Keep the current round's findings in the current objective's working context. Do not create or modify a product file merely to preserve review bookkeeping.

For each finding, retain the requirement or upstream contract, the exact conflicting artifact or behavior, why they disagree, and the complete consequence surface. Do not replace this information with transcripts, command output, or guesses.

## Literal Full Reading

A file counts as read only when its complete current contents are returned and examined during the current round.

1. Build the sorted current-scope manifest before the round. An inventory defines navigation and reads no file.
2. Start at the first requirement and continue in manifest order through the final scoped artifact.
3. Read every file without truncation. Consecutive ranges count only when they cover the first through final line with no gap.
4. A multi-file command counts only files returned in full with unambiguous boundaries.
5. Searches, match excerpts, summaries, inventories, diffs, Git status, line counts, builds, lint output, test output, and previous reads count as zero.
6. Track the current position and completed propagation roots in the current objective. Never call a round full, complete, clean, final, or finished before both reach their end.
7. If a product or generated file changes during the round, invalidate the round and restart it from the first requirement against a new manifest.
8. After compaction or resume, continue only when the exact manifest, round, next item, and completed propagation roots are known. Otherwise restart the round from the first requirement.

Never partition a round by file, package, layer, requirement subset, review lens, time window, or agent. Never compose partial passes into a round.

## Correction And Completion

When a completed round has findings:

1. fix every finding at its owning layer and every downstream consequence;
2. regenerate every affected derived artifact;
3. run the gates named by the instruction and fix every failure;
4. reconcile every finding with the actual correction; and
5. begin a new full round at the first requirement.

When a completed round has no finding and made no scoped edit, run the instruction's final gates. A failure or resulting change invalidates the round and requires correction followed by another full round.

The review Goal is complete only after one dry round and unchanged clean gates.

## No Discretionary Stop

Never stop because:

- the review was extensive, productive, expensive, time-consuming, repetitive, or under context pressure;
- many or important defects were found, most defects were probably found, another round seems unlikely to help, or further review seems inefficient;
- a build, test, live journey, search, diff, summary, previous review, or sample passed; or
- a later Final objective might catch or repair an omission.

None of these satisfy review loop until dry. When a literal dry round is not proven, remain active and continue the same review Goal.

## Final Checklist

- [ ] Detailed procedure and full current scope read literally.
- [ ] No discretionary judgment changed the prescribed scope, round boundaries, stopping conditions, or review procedure.
- [ ] Every round covered the first requirement through the final artifact and every propagation branch.
- [ ] No split rounds, composed partial passes, omissions, or search/build/test substitutes.
- [ ] Every finding and consequence fixed after the complete round.
- [ ] Every correction followed by a new full round.
- [ ] Unlimited repetition reached one dry, edit-free round.
- [ ] Scope checklist complete and gates clean.

Any unchecked or uncertain item leaves the Goal Mode completion conditions unmet. Repeat the applicable literal full-reading Review from the first requirement. In a Final Goal, perform the quoted Review immediately.
