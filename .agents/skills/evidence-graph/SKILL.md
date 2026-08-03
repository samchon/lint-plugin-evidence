---
name: evidence-graph
description: Defines the evidence graph domain model for @samchon/lint-plugin-evidence — the tag grammar, node kinds, hierarchy, reference resolution, obligation coverage, and exclusions. Use before changing rule semantics, the tag grammar, the configuration surface, or a diagnostic message; do not use for the mechanics of the Go rule API, which the lint-rule-authoring skill owns.
---

# Evidence Graph

## Product Contract

An artifact that cites nothing has no proof it was needed. An artifact that cites a target no configured source declares has proof of nothing. `evidence/graph` turns both states into compile errors under the graph the consumer defines in `lint.config.ts`.

The graph is configurable. Claims select the files and declaration hosts that owe acknowledgements; references select the evidence populations they owe. Every claim-reference pair is an independently complete obligation, and every element of a reference array remains separate.

Read `.wiki/references/autobe-mcp.md` before generalizing behavior from that prior art, and `.wiki/design/decisions.md` for settled repository decisions and their costs.

## Tag Grammar

```text
@evidence <target> <reason>
@evidenceExclude <target> <reason>
```

The target is one whitespace-delimited token, except that a target opening with `{@link`, `{@linkcode`, or `{@linkplain` runs to its closing brace. Everything after the target is prose. A declaration may carry any number of tags. Every tag requires a target and non-empty reason and is validated independently.

```ts
/** @evidence docs/spec.md#pricing Sale price derives from this section. */
/** @evidence POST:/members Member creation follows this API operation. */
/** @evidence {@link ISale} The complete sale contract is mirrored here. */
```

The two forms are two resolvers, and the token itself says which. A path address resolves against configured sources; an inline link resolves through the citing module's imports, so the citation is a real reference rather than a string that spells a symbol's name.

**The braces are load-bearing, not decoration.** TypeScript resolves a name inside an inline link and counts it as a use, so an import that exists only to support a citation survives `noUnusedLocals`. It does not resolve names inside an unknown tag, so an unbraced symbol target leaves the import unreferenced and raises `TS6133`. Recommend `import type` for a citation-only import: it is erased at emit, creating no runtime dependency or cycle. A consumer also running `@typescript-eslint/no-unused-vars` still sees a false positive there, because that rule does not count JSDoc usage.

Keeping the discrimination in the token is what preserves the parser's independence from reference context. Without a boundary character, `POST /members` would have to be guessed at, which is why a path target stays one token and only a code target may spend braces to buy one.

**Only a TypeScript claim may cite TypeScript evidence.** An inline link resolves in the citing module's import scope, which no other artifact has, so any other claim would have to match a bare name against one repository-wide table — and that makes symbol-name uniqueness across the whole repository load-bearing. The configuration refuses the pairing at decode, and resolution refuses a code target reached through another claim's reference, because addresses are indexed from every claim at once and the guard alone left that door open. Both halves are needed; either alone is silent. What this gives up is that documentation can no longer cite code, and the inverse obligation is not the same one — `.wiki/design/decisions.md` records the reversal and its cost.

The reason exists for review, not machine judgment. Do not add a rule that guesses whether prose is sincere; it will teach authors to write filler that passes.

## Units And Hierarchy

Four artifact kinds materialize evidence units.

- **Markdown** — a file addressed as `<path>` or an H1-H4 ATX section addressed as `<path>#<anchor>`.
- **Prisma** — a model addressed as `prisma:<Model>` and one of its members addressed as `prisma:<Model>.<member>`.
- **Swagger** — a reference-only Swagger/OpenAPI document whose operations under `paths` are addressed as `<UPPERCASE_METHOD>:<path>`.
- **TypeScript** — an exported type, function, or property addressed by its qualified public name.

Units form structural containment scopes. A Markdown file contains its heading outline; a heading contains lower-level headings until the next heading of equal or higher level. A Prisma model contains its columns and relations. A TypeScript interface or object-shaped type alias contains its direct properties, and a namespace contains every nested public unit. Top-level TypeScript functions and properties have no aggregate file node. Swagger operations are independent leaves with no document or path aggregate target.

An `@evidence` target acknowledges the selected target and every selected descendant; an `@evidenceExclude` target does the same unless that reference's acknowledgement policy forbids exclusions. The reference's `symbol` selector defines the obligation denominator, not the only addressable targets: every structural ancestor of a selected unit remains resolvable as an aggregate scope.

Keep selected obligations and resolvable scopes separate. Do not make every unselected unit resolvable; only actual ancestors belong to the scope closure, or an unrelated same-name declaration can create false ambiguity.

Hierarchy is identity, not spelling. Store explicit parent unit IDs while materializing. Never infer TypeScript ancestry from a dotted-string prefix: literal names may contain dots, and `A.B` can mean one literal segment or two qualified segments.

## Swagger Classification

Swagger is reference-only. One `IEvidenceGraphSwaggerReference` owns one exact project-relative file path or HTTP(S) URL through its singular `file` property; multiple documents are separate reference-array obligations. It has no public `symbol` selector because every operation under the normalized document's `paths` object is selected.

Normalize Swagger 2.0 and OpenAPI 3.x JSON/YAML inputs with `@typia/utils` to `@typia/interface`'s `OpenApi.IDocument` before materializing operations. Standard and additional operation methods become uppercase targets such as `POST:/members`; preserve the OpenAPI path exactly. Webhooks and component schemas are outside this artifact kind.

Keep the target one whitespace-delimited token. Do not parse `POST /members` as a two-token target: the parser has no reference context, and doing so would reinterpret a TypeScript target `POST` whose reason begins with `/members`.

## Prisma Classification

A Prisma schema works in both directions: its models ground claims, and its `///` comments host them. Selectors are `model`, `column` for a stored field, and `relation` for a relation field. A reference defaults to `["model"]` and a claim to all three, because a reference default promises a denominator while a claim default only decides where a tag may sit.

**The classification is Prisma's, not ours.** Every configured file is parsed together as one schema by Prisma's own parser, which is what separates a column from a relation — a relation has two sides, only one usually carries `@relation`, and the back-reference carries no attribute at all. A **view** arrives among that parser's models and is therefore a `model` unit; the name argues otherwise, which is exactly why it was measured. Enums, composite types, and indexes are outside the unit model.

**That parser returns no position for anything, so a native scan supplies every location.** The scan is subordinate: it may not add a unit, remove one, or change a symbol kind, so a scan that misses costs a precise line and never a smaller coverage denominator. Keep it that way — the moment it decides what exists, a mis-scan turns into a silently passing build.

A model name is unique across the whole schema folder, so a target never names the declaring file and moving a model between files cannot break a citation. A Prisma identifier can never contain a dot, so joining a member address on one is unambiguous — the hazard that keeps TypeScript identities segmented does not exist here.

`///` and `/* */` both host a declaration, and `//` does not. That split is Prisma's rather than ours and was settled by running `prisma generate`: both documentation forms reach the generated client types and prisma-markdown's ERD indistinguishably, while a `//` comment is discarded outright. A citation in a `//` comment is therefore **reported** rather than ignored, as is one buried behind an extra slash — `//// @evidence` arrives as content beginning with a slash and opens no tag. A blank line detaches a top-level comment but not a field's, an intervening `//` line does not break a run, and a comment above a block attribute or a closing brace documents nothing. Do not re-derive these from the grammar; both directions are silent when wrong.

## TypeScript Classification

Selectors classify public contracts semantically.

A TypeScript claim may declare `root` to move the base its `files` globs resolve against. This changes only population addressing: the claim still materializes exclusively from `ctx.Sources`, and the root never scans a directory, follows arbitrary imports, or admits `node_modules`. A sibling package must therefore be an explicit root of the active tsconfig Program. Targets remain symbol identities, while file matching is root-relative and diagnostics retain project-relative locations.

- `"type"` selects exported interfaces, type aliases, and namespaces. Classes and enums are not type units.
- `"function"` selects exported function declarations, function-valued exported `const` declarations, public class callables, and namespace variants of those forms.
- `"property"` selects direct properties of exported interfaces and object-shaped type aliases plus exported `const`, `let`, or `var` declarations at module or namespace scope. A `const` initialized with an arrow or function expression remains a function; every other variable, including a function-typed declaration or function-valued `let` or `var`, remains a property.

Only public identities materialize. A top-level declaration needs an export modifier or local export-list alias; a namespace member needs to be exported from that namespace unless ambient namespace semantics make it implicitly public. A type-only namespace alias projects only public namespaces, interfaces, type aliases, and their type properties, never value-space data or callables.

**A re-export decides reachability, never identity.** The rule splits in two, and both halves are load-bearing.

- **Identity stays with the declaring file.** A re-export whose declaration lives in another file creates no second unit. A symbol exposed through two barrels is one unit with one ID and one coverage obligation — this is what stops a barrel from doubling every obligation beneath it.
- **Reachability comes from the entry.** Under entry selection, traversal follows `export *`, `export * as ns`, and `export { A as B }` to decide _membership_ in the population, and gives each reached symbol its accessor path from the entry. `export * as functional` nests a segment, `export * from` flattens one, and an alias is addressed by its public name.

A symbol reached by two paths therefore answers to two addresses and still materializes one coverage unit. Build those addresses from identity segments rather than by rewriting a joined target, or a literal dot inside a name collapses into qualification.

A mixed variable statement can carry both function and property host kinds because TypeScript attaches one leading JSDoc block to the statement wrapper. Every public leaf of an object or array binding pattern is a property under its local binding name. Preserve the host set; choosing one kind makes the other selector spuriously out of scope.

## Evaluation

`evidence/graph` evaluates the complete configured graph once per Program and answers three distinct questions.

- **Resolution.** Does every declaration target resolve to exactly one selected unit or structural ancestor?
- **Host eligibility.** Does `@evidence` live on a symbol kind selected by its claim, or does `@evidenceExclude` live on an eligible carrier in a matching claim file?
- **Coverage.** Does every selected reference unit have at least one acknowledgement in this claim?

Keep claim and reference state separate. A declaration that satisfies one claim or reference never leaks coverage into another, even when the physical target is the same.

Several declaration hosts may acknowledge the same unit with `@evidence`; one requirement can need several implementations or proofs. One declaration host may state one resolved evidence scope only once.

`@evidenceExclude` is one reviewed non-applicability decision per scope in one claim-reference obligation. Exclusion scopes must not overlap each other. An evidence scope and exclusion scope must not overlap because they state opposite intent. Report one duplicate or conflict diagnostic per later overlapping scope rather than one per descendant.

## Reference Acknowledgement Policies

A reference may strengthen its own acknowledgement relation with `acknowledgement.forbidEvidenceExclude`, `acknowledgement.exactEvidenceUnitsPerHost`, and `acknowledgement.minimumEvidenceHostsPerUnit`. Omission and `{}` preserve ordinary coverage, and constraints never cross or pool between reference-array elements, including identical and overlapping references.

- **Forbidden exclusions are reference-local.** Report one forbidden-exclusion diagnostic for the declaration and reference, give that reference no coverage from it, and leave its missing or insufficient positive coverage visible. The same declaration may still satisfy another reference that allows exclusions.
- **Exact units are positive semantic edges per selected claim host.** Count distinct selected reference-unit identities reached by `@evidence`, including every selected descendant of an aggregate scope. Begin from the complete selected claim-host population so a host with no tag counts as zero. Do not count tags, source positions, exclusions, or repeated edges.
- **Minimum hosts are distinct semantic claim hosts per selected unit.** Declaration merging and overloads remain one host identity; several tags on one identity count once. A physical JSDoc position is not a host identity.
- **Incomplete populations never establish cardinality.** Preserve the loader failure and do not derive exact or minimum counts from a partial denominator.

Completion keeps all positive targets. At the exclusion trigger, omit a target selected only by references with `forbidEvidenceExclude`; keep it when any enabled reference allows exclusion. The hint API has no cursor or claim context, so cardinality remains an evaluation diagnostic rather than a completion filter.

## Exclusions

`@evidenceExclude` records that one claim intentionally does not use a target scope. On a reference that allows exclusions, it has the same hierarchy and coverage cardinality as `@evidence`; only its reviewed intent differs. A reference with `acknowledgement.forbidEvidenceExclude` reports the exclusion and receives no coverage from it.

Three properties are load-bearing.

- **The reason is mandatory.** A blank exclusion is not a decision anyone can review.
- **It belongs to one claim.** Another claim referencing the same source still owes its own acknowledgement.
- **It follows hierarchy.** Excluding a parent excludes every selected descendant. Another exclusion covering any of those units is a duplicate, while overlapping evidence is a conflict.

Carrier eligibility is intentionally wider than ownership evidence and no wider than the claim's file population.

- A TypeScript exclusion may sit on any supported public export in a matching claim file, even when the claim's `symbol` selector chooses another host kind. Unexported and unsupported declarations remain ineligible.
- A Prisma exclusion may sit on a selected model or field host, or in an unattached top-level `///` run in a matching claim file. This permits a lint-only `.schema` ledger outside Prisma generation. The same unattached position never accepts `@evidence`.
- Markdown and Swagger claim hosts retain their selected-symbol behavior.

Never auto-exclude, auto-retarget, or delete an artifact or citation to make a graph green. Repair is the author's, and every diagnostic must name the path that performs it.

## Diagnostic Messages

Most users meet this plugin only through an error message. State what is wrong, then what fixes it. Name the claim, reference, target, source location, and supported repair. Prefer one precise diagnostic to several descendant duplicates.

## Identity Rules

- **Targets are exact tokens.** Prose is free, but target identity never depends on heading text beyond its generated or explicit anchor.
- **Paths are case-sensitive identity on every host.** Case-insensitive comparison may improve a diagnostic but never decides equality.
- **Markdown separators normalize only for Markdown targets.** Do not rewrite TypeScript literal symbol names.
- **Swagger methods canonicalize to uppercase; Swagger paths do not normalize.** `POST:/members` and `POST:/Members` are distinct.
- **A Prisma target carries its `prisma:` prefix and never a file path.** The prefix is what stops a model named `Sale` from competing with a TypeScript type of the same name in the one address map every reference shares.
- **Qualified TypeScript segments stay encoded internally.** This prevents a literal dot from collapsing into namespace or property qualification.
- **A merged identity reports the declaration encountered first.** Order is source position, never declaration kind, so `namespace ISale` written above `interface ISale` is the one every diagnostic names.
- **A citation may sit on any declaration of a merged identity.** The relation is judged on the identity, so placement changes neither resolution nor coverage and is not worth a diagnostic.
- **The unit model decides which declarations a citation may sit on.** A class registers no host, so `class Sale` beside `namespace Sale` leaves the namespace as the only declaration that can carry a tag for `Sale`. `evidence/documented` demands the block on the same declaration for the same reason, while `evidence/singular` still counts the pair as one identity — that rule is about a file's public surface, where the class is part of it.
