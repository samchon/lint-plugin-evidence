# Phase Two

Read [SKILL.md](SKILL.md) and [ledger.md](ledger.md) first. This is the benchmark's shared post-completion campaign. Its text, activation, lenses, mutation frequency, clean-round rule, and stopping rule are identical in both arms.

## Activation Boundary

Phase One ends at the coding agent's first terminal completion report. Do not begin this campaign on your own, fold it into Phase One, or delay that first report in order to pre-run it.

The benchmark runner records the first-done timestamp and usage, then activates Phase Two with a separate standardized user turn. Only that turn authorizes this campaign. A runner interruption, limit, or failure is recorded at the point it occurs; it is not converted into a clean round.

## Frozen Method

The method files under `.agents/skills/**`, `AGENTS.md`, the package lint configs, the requirements under `docs/analysis/**`, the benchmark prompt, and the benchmark model settings are frozen inputs. Never edit them during a cell.

If one of those inputs is wrong, record the exact path, line, consequence, and proposed correction as a protocol finding. Stop the cell when the defect invalidates measurement. A later benchmark revision may repair the frozen input and restart from a fresh cell; the current run may not teach itself a new method.

Project code, tests, and project-owned records remain repairable outputs. Generated outputs may be regenerated from their authored owners, never edited directly.

## One Global Round

A global round examines the current repository through all six lenses, from the artifacts rather than from the ledger:

1. requirements: every selected H2/H3 section and every claimed realization;
2. database: requirements to models and columns, then models and columns back to requirements;
3. API: requirements and schema to DTOs and operations, then every DTO and operation back to both owners;
4. logic: contract effects, requirement rules, and schema invariants against providers, then provider branches back to an owner;
5. tests: requirements, API operations, DTO shapes, and business behavior against tests, including negative paths;
6. frontend: user-visible requirements and SDK operations against screens, states, journeys, and deliberate omissions, then every screen and journey back to its owner.

Use fresh finder contexts for the lenses when the runner permits it. The coordinator deduplicates their raw findings, verifies each against the source and current code, and records raw, duplicate, rejected, confirmed, and repaired counts separately. A finder report is a hypothesis, not a defect, until verified.

Review truth as well as presence. For each candidate mapping, read the claim or ledger row, the claiming artifact, and the source it names. The requirements are immutable input; every other source can itself be the defect.

## Mutation Check

Perform exactly one mutation check per global round, in both arms. Choose a critical behavioral claim, make the smallest temporary change that removes or reverses the named behavior, and confirm the relevant test or build fails for the expected reason.

Restore the changed bytes immediately and rerun the affected check. Compare the restored file hash with its pre-mutation hash and record both hashes, the command, exit code, and diagnostic. If restoration cannot be proven byte-for-byte, the round is invalid and the cell stops.

## State Identity

Every global-round verdict binds to a content digest, not to a date or a recollection. Compute SHA-256 over the lexicographically sorted relative paths and bytes of:

- `docs/analysis/**`;
- authored files under `packages/**`;
- authored project records under `wiki/**`, except `wiki/completeness/**`;
- root automation under `scripts/**`;
- root and package configuration that affects build, lint, tests, or runtime.

Exclude the completeness ledger, dependency/install directories, build and coverage output, Playwright artifacts, `docs/ERD.md`, `packages/api/src/functional/**`, `packages/api/swagger.json`, and `packages/backend/src/prisma/**`. Those paths are records or regenerated products, not authored implementation. Record the exact included path count, excluded path count, and digest.

A repair invalidates the current round and every earlier clean verdict whose digest differs. Regenerate owned outputs, run the full build, lint, and test chain, compute a new digest, and restart at lens one.

## Two Clean Rounds

A global round is clean only when all six lenses complete over the full current population, the mutation check is restored and verified, no confirmed finding remains, no frozen-input defect invalidates the cell, all required commands pass, and its digest is recorded.

Phase Two completes only after two consecutive clean global rounds at the same digest. Sampling is not a round. Re-reading only the ledger is not a round. Two partial lens passes are not one round. Any repair, source change, failed mutation restoration, or newly confirmed finding resets the clean count to zero.

The final report states the first-done boundary, every round's digest and disposition, confirmed and repaired findings by lens, mutation outcomes, validation commands, unresolved blockers, and whether two clean rounds were actually achieved.
