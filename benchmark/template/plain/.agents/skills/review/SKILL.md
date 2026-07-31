---
name: review
description: Defines the full-scope finding ledger and review loop until dry for backend, frontend, and overall review objectives. Read only for a review objective, then read the linked scope procedure.
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
2. Accumulate every finding in the ledger while continuing through the final scoped artifact. Do not edit the product or stop the round after finding several problems.
3. After the full round ends, fix every finding and its complete consequence surface, regenerate derived artifacts, and settle the required compiler and runtime gates.
4. Start another literal full reading at the first requirement. Correction work and reads from earlier rounds count as nothing in the new round.
5. Repeat without any round limit until one entire current round reaches the end, finds no problem, and makes no product or generated-file edit.

This is a real exhaustive review loop, not shorthand, aspiration, or rhetoric. No exception or discretionary judgment may shorten or replace it.

## Scope

The detailed procedure defines the product files, live behavior, journeys, and relationships in scope.

Generated SDK output is a current consumer contract. Inspect it but correct its authored source and regenerate it instead of editing generated output directly. Dependencies, caches, logs, screenshots, build output, generated Prisma clients, and the finding ledger are not product review scope.

Do not exclude an item because it is generated, large, repetitive, configuration-only, apparently trivial, unchanged, or already examined during an earlier objective, round, or correction.

## Finding Ledger

Keep the durable ledger at `.wiki/reviews/backend.md`, `.wiki/reviews/frontend.md`, or `.wiki/reviews/overall.md`. Create it when the review begins. It is the only file you may change during an otherwise read-only round.

For each round, retain its sorted scope manifest, current read position, completed propagation roots, findings, corrections, and final status. The ledger preserves exact review state across compaction and resume; it does not replace the review.

Record findings in this form:

```markdown
## Round 3

- Scope: 128 files
- Read: 128/128
- Propagation: complete
- Status: findings

### Findings

1. `REQ-RULE-BROWSE` — `TodoProvider.ts` orders null dates before dated values.
   - Cause: the database order does not implement the required null-last rule.
   - Consequences: active browsing, pagination stability, generated response examples, and ordering tests.

### Corrections

1. Fixed the provider ordering and every recorded consequence; resident compiler gate is clean.
```

Record the requirement or upstream contract, the exact conflicting artifact or behavior, why they disagree, and the complete consequence surface. Do not paste transcripts, command output, or guesses. Never erase an earlier round. A dry round has an empty Findings section and `Status: dry`.

## Literal Full Reading

A file counts as read only when its complete current contents are returned and examined during the current round.

1. Build the sorted current-scope manifest before the round. An inventory defines navigation and reads no file.
2. Start at the first requirement and continue in manifest order through the final scoped artifact.
3. Read every file without truncation. Consecutive ranges count only when they cover the first through final line with no gap.
4. A multi-file command counts only files returned in full with unambiguous boundaries.
5. Searches, match excerpts, summaries, inventories, diffs, Git status, line counts, builds, lint output, test output, and previous reads count as zero.
6. Maintain `READ <current>/<total>: <path>` and propagation progress in the ledger. Never call a round full, complete, clean, final, or finished before both reach their end.
7. If a product or generated file changes during the round, invalidate the round and restart it from the first requirement against a new manifest.
8. After compaction or resume, continue only when the ledger preserves the exact manifest, round, next item, and completed propagation roots. Otherwise mark the round unproven and restart it.

Never partition a round by file, package, layer, requirement subset, review lens, time window, or agent. Never compose partial passes into a round.

## Correction And Completion

When a completed round has findings:

1. fix every finding at its owning layer and every downstream consequence;
2. regenerate every affected derived artifact;
3. run the gates named by the instruction and fix every failure;
4. reconcile every ledger entry with the actual correction; and
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
