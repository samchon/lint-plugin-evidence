---
name: completeness
description: Defines the evidence arm's Phase One structural coverage method, claim-specific tag usage, residual manual checks, ledger, and first-done boundary. Use before any implementation, whenever an evidence diagnostic appears, and before the first terminal completion report; use phase-two.md only after the runner activates Phase Two.
---

# Completeness

## The Standard

Every configured H2/H3 requirement section and every configured referenced artifact must receive a claim-specific acknowledgement. The graph makes missing structural acknowledgement a lint error. It does not prove that a citation is true, that an unconfigured edge is complete, or that the selected denominator is the whole product.

The evidence arm uses the graph for configured coverage and a manual ledger for integrity and residual edges. This is its Phase One mechanism. The benchmark's repeated post-completion campaign is separate and shared with the plain arm.

## Requirement Identity

The Markdown denominator is exactly H2 and H3 headings selected from `docs/analysis/**/*.md`. Its stable identity is `<workspace-relative-path>#<canonical-anchor>`. H1 titles, H4+ prose, generated `docs/ERD.md`, and other Markdown are outside that denominator.

An H2 and each H3 descendant are separate units. The graph permits an ancestor target to cover selected descendants, but benchmark citations default to the narrowest applicable H3. Cite or exclude an H2 only when one declaration genuinely owns the entire selected subtree; the reason must enumerate the descendant responsibilities or the one architectural decision that applies to all of them. Convenience, fewer tags, and clearing several diagnostics are invalid broad-scope reasons.

## Configured Claims

Every claim has a semantic `name` in its package lint config. A name labels diagnostics; it does not merge obligations or change tag grammar.

| Claim name | Selected host | Independently complete target populations | `@evidence` belongs where | `@evidenceExclude` is valid when |
| --- | --- | --- | --- | --- |
| `schema-models` | Prisma model `///` documentation | Markdown H2/H3 | the model stores facts required by the leaf section | this schema claim deliberately has no storage responsibility for the exact section |
| `dto-types` | exported DTO root type JSDoc | Markdown H2/H3; Prisma models | the public shape serves the section or represents the model | the contract package intentionally does not expose that exact section/model |
| `dto-properties` | exported DTO property JSDoc | Prisma columns | the property carries or derives the exact column | the selected contract property population deliberately does not expose that exact column |
| `api-operations` | exported controller operation JSDoc | Markdown H2/H3; Prisma models | the public operation realizes the section or exposes the model | the public API deliberately has no operation for that exact section/model |
| `backend-tests` | exported feature-test function JSDoc | Markdown H2/H3; SDK operations; DTO root types | the test proves the section, invokes the operation, or exercises the shape | the backend suite deliberately does not own that exact target and the reason identifies the actual owner |
| `frontend-screens` | exported page function JSDoc | Markdown H2/H3 | the reachable screen realizes the user-visible section | the frontend deliberately omits the exact section for a requirement-backed reason |
| `frontend-journeys` | exported browser-journey function JSDoc | Markdown H2/H3; page functions | the journey proves the section or walks the page | the browser suite deliberately does not own that exact section/page and the reason identifies the actual verification |

References in an array are separate 100% obligations. A Markdown citation does not satisfy a Prisma, SDK, DTO, or screen reference.

## Tag Grammar And Host

The exact grammar is `@evidence <target> <reason>` or `@evidenceExclude <target> <reason>`. The target is one token and the non-empty remainder is the reviewable reason.

| Target | Meaning |
| --- | --- |
| `docs/analysis/<file>.md#<anchor>` | one Markdown section and selected descendants |
| `prisma:<model>` | one Prisma model and selected descendants |
| `prisma:<model>.<column>` | one Prisma column |
| `{@link <symbol>}` | one imported TypeScript symbol resolved in the host file |

Put `@evidence` on the exact artifact making the claim: a TypeScript declaration selected by the claim or the `///` documentation immediately attached to the selected Prisma model. For `dto-properties`, that host is the property, never the nearest root type. For operation, test, screen, and journey claims, it is the exported function. Evidence in a file header, unsupported declaration, generated file, or neighboring artifact does not tell the truth about the claiming host.

An exclusion is claim-local acknowledgement, not a relationship to its carrier and not a waiver from the product. It may move among declarations selected by that claim without changing the excluded target scope; use a stable eligible carrier in the target's domain. A property claim therefore still requires a property carrier, a model claim a model carrier, and a function claim a function carrier. The reason states the claim-wide decision a reviewer can veto. Do not use it for “not implemented yet,” uncertainty, convenience, an expected future feature, or to make a diagnostic disappear. Evidence and exclusion scopes must remain disjoint within one claim/reference obligation.

Within one named claim/reference obligation, each target scope is acknowledged exactly once across all selected hosts. Repeating a target or overlapping an ancestor and descendant is a duplicate even when the tags sit on different declarations. Different named claims remain independent; a type-to-model acknowledgement does not collide with a property-to-column acknowledgement.

## Phase One Loop

1. Read all requirements and confirm the configured file globs and H2/H3 selectors materialize the intended denominator.
2. Add the narrowest truthful claim as each authored artifact is implemented; never add speculative citations to planned work.
3. Keep the graph green while checking every reason against the host and target.
4. Complete the residual manual checks in [logic.md](logic.md) and [frontend.md](frontend.md), plus the integrity review indexed by [ledger.md](ledger.md).
5. Regenerate owned outputs, then run build, lint, tests, frontend journeys, zero-`@todo` search, and every layer-local gate.
6. Compute the current-state digest and perform one final Phase One integrity pass over every tag, exclusion, residual edge, and reverse authored population.

Phase One may report terminal completion only when the graph is green, no residual or integrity finding remains, all invalidated reviews were repeated at the current digest, and every required command passed with output read. That report is the first-done boundary.

Do not pre-run the benchmark's two clean rounds. [phase-two.md](phase-two.md) starts only after the runner records first done and sends the separate activation turn.

## Frozen Inputs

Never edit `.agents/skills/**`, `AGENTS.md`, package lint configs, or `docs/analysis/**` during a benchmark cell. If a glob, claim, method, or requirement is defective, record a protocol finding. Do not add a project-specific claim or weaken a rule mid-run.

## What Green Means

Green means every selected target received a structurally valid citation or exclusion in each configured claim and the ordinary compiler/lint checks passed. It does not mean the reason is true, every requirement detail is implemented, providers enforce the contract, every SDK capability reaches a screen, or tests are mutation-sensitive. Those remain explicit review work.
