# `@samchon/lint-plugin-evidence`

![Logo](https://raw.githubusercontent.com/samchon/lint-plugin-evidence/master/og.jpg)

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/samchon/lint-plugin-evidence/blob/master/LICENSE) [![NPM Version](https://img.shields.io/npm/v/@samchon/lint-plugin-evidence.svg)](https://www.npmjs.com/package/@samchon/lint-plugin-evidence) [![NPM Downloads](https://img.shields.io/npm/dm/@samchon/lint-plugin-evidence.svg)](https://www.npmjs.com/package/@samchon/lint-plugin-evidence) [![Build Status](https://github.com/samchon/lint-plugin-evidence/actions/workflows/build.yml/badge.svg)](https://github.com/samchon/lint-plugin-evidence/actions/workflows/build.yml) [![Discord Badge](https://img.shields.io/badge/discord-samchon-d91965?style=flat&labelColor=5866f2&logo=discord&logoColor=white&link=https://discord.gg/E94XhzrUCZ)](https://discord.gg/E94XhzrUCZ)

The evidence graph for the AI coding era: the guardrail for goal mode.

> Your spec is now a compile error.

When Claude Code or Codex works unattended, it can skip a requirement and still report "done." Evidence Graph makes every configured requirement demand an explicit acknowledgement from the code, test, or document that claims to satisfy it.

Every acknowledgement names the exact target and states why it applies. The compiler does not decide whether that reason is true—it forces the agent to commit to a concrete claim. A fabricated reason can no longer hide inside a plausible diff; it sits beside the declaration and evidence it contradicts.

**An agent can still lie. It cannot lie by omission:**

- **Complete**: every configured obligation is accounted for, or the build fails.
- **Tested**: every selected export is claimed by a test, by name.
- **Documented**: decisions and code stay explicitly connected.
- **Honest**: "done" comes with a target and a reason.
- **Integrity**: no citation outlives its target.

```tsx
/**
 * @evidence docs/discount.md#coupon-stacking Renders the combination limit defined by this rule.
 */
export function CouponStackingNotice() {
  return <p>One seller coupon and one platform coupon may be combined.</p>;
}
```

> Without the `@evidence` citation, the next build stops:
>
> ```bash
> $ npx ttsc
> error TS16411: [evidence/graph] Missing acknowledgement for
>   'docs/discount.md#coupon-stacking' (Markdown H2 'Coupon Stacking' at docs/discount.md:3)
>   in Claim 1 reference 1 (markdown, symbols: h2, h3).
>
>   Use @evidence on a selected typescript host or @evidenceExclude on an eligible carrier.
>
> Found 1 error.
> ```

## Setup

### Install

```bash
npm install -D typescript ttsc @ttsc/lint
npm install -D @samchon/lint-plugin-evidence
```

This is a lint plugin for [`@ttsc/lint`](https://github.com/samchon/ttsc/tree/master/packages/lint), version 0.22 or newer. It runs on [`ttsc`](https://github.com/samchon/ttsc), not on stock `tsc` with ESLint. If your build does not run `ttsc` yet, adopt that toolchain first.

The first build can take several minutes; it links the rule into the lint binary once, and later builds reuse it.

### Configure

```ts
// lint.config.ts
import type { ITtscLintConfig } from "@ttsc/lint";
import { evidence, type IEvidenceGraphConfig } from "@samchon/lint-plugin-evidence";

const graph: IEvidenceGraphConfig = {
  claims: [
    {
      type: "typescript",
      files: ["src/components/**/*.tsx"],
      symbol: "function",
      reference: {
        type: "markdown",
        files: ["docs/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
  ],
};

export default {
  plugins: {
    "evidence": evidence,
  },
  rules: {
    "evidence/graph": ["error", graph],
    "evidence/documented": "error",
    "evidence/singular": "error",
    "evidence/todo": "error",
  },
} satisfies ITtscLintConfig;
```

Register the plugin in `lint.config.ts` and pass the graph declaration as the option of the `evidence/graph` rule. This graph reads as one sentence: the React components under `src` claim to implement the docs, so every H2 and H3 section under `docs` must be cited by a component.

`evidence/graph` is project-scoped, so its entry must have no `files` selector; the host rejects one that does. Scope a file rule in its own entry when you need to.

The other three are file rules. `evidence/documented` requires a JSDoc block on every selected export, because a block is the only place a citation can live. `evidence/singular` keeps one public identity per file, named after the file. `evidence/todo` reports every remaining JSDoc `@todo` tag in a linted file, exported or not — a `@todo` is a contract the declaration has not realized yet, so each tag fails the build with its own text until the work is done and the tag removed.

Violations surface in every `ttsc` build, every `--noEmit` check, and every `ttsx` run. They arrive in the same stream as type errors. No separate CI job.

### Compose

```ts
const graph: IEvidenceGraphConfig = {
  claims: [
    // 1. feature documents build on the requirements
    {
      type: "markdown",
      files: ["docs/features/**/*.md"],
      reference: {
        type: "markdown",
        files: ["docs/requirements/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
    // 2. components implement the feature rules
    {
      type: "typescript",
      files: ["src/components/**/*.tsx"],
      symbol: "function",
      reference: {
        type: "markdown",
        files: ["docs/features/**/*.md"],
        symbol: ["h2", "h3"],
      },
    },
    // 3. tests verify the feature rules and the components
    {
      type: "typescript",
      files: ["test/features/**/*.ts"],
      symbol: "function",
      reference: [
        {
          type: "markdown",
          files: ["docs/features/**/*.md"],
          symbol: ["h2", "h3"],
        },
        {
          type: "typescript",
          files: ["src/components/**/*.tsx"],
          symbol: "function",
        },
      ],
    },
  ],
};
```

A graph is one `claims` array, and every claim-reference pair is an independent obligation:

1. Markdown can claim Markdown. The feature documents must acknowledge every requirement they build on.
2. Every feature rule must be cited by a React component; a rule no component mirrors is a compile error naming that rule.
3. A `reference` array is one obligation per element. The tests must verify every feature rule and claim every exported component, never one obligation borrowing the other's citation.

### Acknowledgement policy

A reference can require positive evidence with a specific host-to-unit shape. This is useful when ordinary many-to-many coverage is too permissive, such as API operations that must each have two dedicated test functions:

```ts
const graph: IEvidenceGraphConfig = {
  claims: [
    {
      type: "typescript",
      files: ["test/features/**/*.ts"],
      symbol: "function",
      reference: {
        type: "swagger",
        file: "api/swagger.json",
        acknowledgement: {
          forbidEvidenceExclude: true,
          exactEvidenceUnitsPerHost: 1,
          minimumEvidenceHostsPerUnit: 2,
        },
      },
    },
  ],
};
```

`forbidEvidenceExclude` refuses an exclusion and gives this reference no coverage from it, so the target still needs positive evidence. `exactEvidenceUnitsPerHost` counts the distinct selected units cited positively by each selected semantic claim host, including hosts with no tag. `minimumEvidenceHostsPerUnit` counts distinct semantic claim hosts with positive evidence for each selected unit. Duplicate tags never increase either count, while a parent target contributes each selected descendant in its scope.

The policy belongs to one reference. An exclusion refused by the Swagger reference above may still satisfy a different Markdown or TypeScript reference in the same claim, and identical or overlapping references never pool counts. Omit `acknowledgement`, or use `{}`, to preserve ordinary coverage; `forbidEvidenceExclude` defaults to `false`, and either cardinality is inactive when omitted. Both cardinalities accept positive integers only.

Completion keeps every positive target. The `@evidenceExclude` completion omits a target selected only by references that forbid exclusions; a target allowed by any enabled reference remains available because the hint API has no cursor-specific claim context.

### Symbols

| Kind | `symbol` values | Default |
| --- | --- | --- |
| `"markdown"` | `"file"`, `"h1"`, `"h2"`, `"h3"`, `"h4"` | `["file", "h1", "h2", "h3", "h4"]` |
| `"prisma"` | `"model"`, `"column"`, `"relation"` | all three for claims, `["model"]` for references |
| `"swagger"` | No `symbol` property; every operation under `paths` is selected | every operation |
| `"typescript"` | `"type"`, `"function"`, `"property"` | all three for claims, `"type"` for references |

For TypeScript, `"type"` selects exported interfaces, type aliases, and namespaces. `"function"` selects exported callables. `"property"` selects properties declared by exported type-level symbols and exported `const`, `let`, and `var` declarations at module or namespace scope; a `const` initialized with an arrow or function expression remains a function, while every other variable is a property. Qualified identities preserve their owner: `Orders.Input.id` is a property below `Orders.Input`, while `Orders.state` is namespace data.

Ambient namespace members follow TypeScript's implicit export semantics. Exported object and array binding patterns expose each local binding leaf as a property. A type-only namespace alias exposes its public type-space descendants and their properties without exposing namespace data or callables.

A reference's `symbol` selects the evidence units one obligation covers, and an array widens that unit set without creating a second obligation. The units retain their hierarchy: a Markdown file contains its heading outline, a TypeScript interface or object type contains its properties, and a namespace contains every nested public unit. A target acknowledges itself and every selected descendant. An ancestor remains addressable even when its own kind is omitted from the selector, so `symbol: "property"` can still be covered by one `@evidence IShoppingSale ...`.

**Only a TypeScript claim may cite TypeScript evidence.** A symbol citation is written as an inline link and resolves in the citing module's import scope, which no other artifact has. Any other claim would have to match a bare name against every exported symbol in the repository, so two modules exporting `IPage` would make the citation impossible and the only repair would be renaming your code. Configure the obligation the other way round: let the code cite the document, the schema, or the operation.

A claim's `symbol` uses the same selector for the opposite side: it restricts which symbol kinds may host an `@evidence` tag. Namespaces are type hosts, exported data variables are property hosts, and a mixed variable statement can host either of its resident kinds. Omit either selector to accept its documented default.

For Prisma, `"model"` selects a declared model, `"column"` a stored field of one, and `"relation"` a relation field. A model contains its members, so one `@evidence prisma:Sale ...` discharges every selected column and relation beneath it.

Swagger is reference-only. It cannot host declarations and has no `symbol` selector: each operation under the normalized document's `paths` object is one independent obligation.

### File patterns

Every Markdown, Prisma, or TypeScript `files` property takes glob patterns, not regular expressions. `*` matches inside one path segment, `**` crosses segments, and `?` matches one character. A bare directory such as `docs` does not select its descendants; write `docs/**` for the subtree.

- `docs/**/*.md` selects every document below `docs`.
- `backend/src/**/*.ts` selects every backend source file.
- `frontend/src/components/**/*.tsx` selects every React component.
- `test/features/**/*.ts` selects every feature test function.

A pattern resolves against its population's base — the `ttsc` project root unless the population declares a `root` — and it may not escape that base: `..` and an absolute path are both refused inside a pattern, because a base spread across every pattern is a base nobody can read off the configuration. Declare it once instead.

### Populations above the project

A monorepo usually keeps one requirements set that several packages implement together, and each package is its own `ttsc` project with its own `tsconfig.json` and `lint.config.ts`. A Markdown or Prisma population, or a TypeScript claim, declares the directory it resolves against with `root`:

```ts
// packages/backend/lint.config.ts and packages/api/lint.config.ts, identically
{
  type: "markdown",
  root: "../../docs",
  files: ["requirements/**"],
  symbol: "h2",
}
```

`root` is one directory, never a glob. It may sit inside the project (`docs`), above it (`../../docs`), or on an absolute path (`/srv/contracts`, `C:/contracts`). A Windows drive-relative path such as `C:docs` is refused, because it resolves against whatever directory that drive is currently on rather than against a stable base.

**Moving the root moves the addresses with it.** Under the configuration above, a section is cited as `requirements/pricing.md#discounts` — not through the citing package's distance from the documents. That is what lets two packages share one document set: they declare the same base and write the same citation, so adopting the set costs a `root` line and nothing else. Prisma and TypeScript targets carry no path, so a root there changes which files join the population and where a diagnostic points, never how a model or symbol is cited.

Diagnostics name the resolved base, so a population that selects nothing says which directory it looked in, and a unit above the project is located through it: `Missing acknowledgement for 'requirements/pricing.md#discounts' (Markdown H2 'Discount Policy' at ../../docs/requirements/pricing.md:12)`. A root that names no directory is reported as a root, with the spelling you wrote and the path it resolved to.

Everything a rooted Markdown or Prisma population reads is published to the `ttsc` host as a watched dependency, so editing a document two directories up starts the next `ttsc check --watch` cycle exactly as editing one inside the project does.

A TypeScript claim `root` changes only the base used to match files already supplied by `ttsc`. It does not scan that directory or follow imports, so the owning tsconfig must explicitly include a sibling source root before the claim can select it. TypeScript references retain their existing Program or installed-package selectors and do not accept `root`; `package` is the channel that reaches a population you do not own.

**Each project still owes its own coverage.** Two projects referencing one document set are two independent obligations, so a section only the backend implements needs an `@evidenceExclude` in the API project, and the reverse for an API-only one. That is the intended form rather than a gap: the claim that a requirement does not apply to a package is a reviewable decision, and a shared population with a per-project filter would let one package silently drop a requirement the other still enforces.

### TypeScript populations

A TypeScript reference selects its population three ways, and the choice decides how its units are addressed.

```ts
// every exported type under src/contracts, addressed by its own name
{ type: "typescript", files: ["src/contracts/**"] }

// everything the entry exposes, addressed by its accessor path from that entry
{ type: "typescript", file: "src/sdk/index.ts" }

// the same, for a package a consumer installs
{ type: "typescript", package: "@ORGANIZATION/PROJECT-api" }
```

`files` and `file` are mutually exclusive, and a local reference must set one of them; there is no implicit project entry.

An entry-selected population is addressed the way a consumer reaches it, not the way the declaring file spells it: `export * as functional` nests a path segment, `export * from` flattens one, and `export { A as B }` addresses the symbol as `B`. That is what makes `api.functional.questions.get` nameable. Identity still belongs to the declaring file, so a symbol an entry exposes through two paths answers to two addresses but remains one coverage unit rather than two obligations.

A `package` population is read from disk rather than from the `ttsc` program, which is the point: a symbol nothing imports is absent from the program by definition, and it is exactly the symbol an obligation needs to name. Without `file` or `files`, the package's declaration entry is the population, resolved through the `types` condition of its `exports` map, then `typesVersions`, then `types` or `typings` — never `main`, which names the JavaScript a consumer runs rather than the declarations a citation can address. With `files`, the globs are package-relative.

The obligation set of a package reference belongs to whoever publishes it. A minor release that adds exports adds obligations, so pin the version or narrow the selection when the population is not yours.

### Swagger API references

A Swagger reference owns exactly one document through its singular `file` property:

```ts
const graph: IEvidenceGraphConfig = {
  claims: [
    {
      type: "typescript",
      files: ["src/controllers/**/*.ts"],
      reference: {
        type: "swagger",
        file: "api/openapi.yaml",
      },
    },
  ],
};
```

`file` is either one exact local path or one exact `http:`/`https:` URL; it is never a glob and never a directory. Use a `reference` array when one claim owes separate coverage to several API documents.

A local path resolves against the `ttsc` project root and may name a document anywhere on the filesystem — `api/openapi.yaml` inside the project, `../contracts/swagger.json` beside it, or `/srv/contracts/swagger.json` outside it entirely. An OpenAPI document is routinely generated somewhere with no relationship to the project that consumes it: a sibling package's generator output, a shared contract repository checked out alongside, a CI artifact directory. Since a `reference` may already name an arbitrary URL on any host, refusing the local form would have refused the one an author can pin, version, and diff. A Windows drive-relative path such as `C:openapi.json` is still refused, because it resolves against whatever directory that drive is currently on.

Swagger 2.0 and OpenAPI 3.0, 3.1, and 3.2 JSON or YAML documents are normalized through `@typia/utils` to `OpenApi.IDocument` before indexing. A local document is read and a remote document is fetched on every evidence-graph project evaluation; failures, non-2xx responses, invalid documents, 30-second remote timeouts, and documents larger than 16 MiB fail the build.

Normalization runs a Node process, and starting it costs far more than the document itself — 198 ms for a 3-operation document against 234 ms for a 240-operation one, measured on this repository's own bridge. A local document is therefore read every evaluation but re-normalized only when its bytes changed, so a watch session or an editor stops paying that toll for a spec nobody touched. The key is the content, not a timestamp or a size, which is why an edit that happens to preserve both is still seen. A remote document has no such key without fetching it, so it is fetched once per process and answered from memory afterwards: the choice there is not "cache or revalidate" but "fetch once or fetch forever", and a resident session that refetched on every rebuild would put a network round trip on the edit loop. A served document that changes mid-session is therefore not seen until the session restarts, and a one-shot `ttsc check` is a fresh process that always fetches. A refused URL is never remembered, so a transient outage recovers on the next cycle instead of lasting the session.

Only operations under `paths` become evidence units. Webhooks and component schemas are outside this reference type. Standard and additional operation methods use the same target identity.

One-shot checks always evaluate the current Markdown, TypeScript, and Swagger sources. `ttsc check --watch` and the editor server do too: the rule declares its configured Markdown globs and local Swagger paths to the host, so editing a spec section or regenerating an OpenAPI document starts the next cycle on its own, with no TypeScript file touched. A path stays declared while it is missing, which is what lets a document that has not been generated yet be observed the moment it appears. A source above the project is declared on the same terms, so a rooted population and an ancestor-relative Swagger document are watched exactly like ones inside it.

An `http:`/`https:` Swagger source is the one exception, and it is not a gap that will close. A URL has no filesystem event to observe, so nothing wakes the watcher when the served document changes — and because it is fetched once per process, an editor session keeps the document it started with until it restarts.

### Prisma schema references and claims

A Prisma schema works in both directions. A model can ground a claim, and the schema itself can carry citations back to the requirements that asked for it:

```ts
const graph: IEvidenceGraphConfig = {
  claims: [
    {
      type: "prisma",
      name: "Every model justifies itself",
      files: [
        "prisma/schema/**/*.prisma",
        "prisma/schema/exclude.schema",
      ],
      symbol: "model",
      reference: {
        type: "markdown",
        files: ["docs/requirements/**/*.md"],
        symbol: "h2",
      },
    },
    {
      type: "typescript",
      files: ["src/providers/**/*.ts"],
      symbol: "function",
      reference: {
        type: "prisma",
        files: ["prisma/schema/**/*.prisma"],
      },
    },
  ],
};
```

Every matched file is parsed together as one schema, because a Prisma schema folder is a single namespace whose files reference each other. Targets carry a `prisma:` prefix and are one whitespace-free token: `prisma:Sale` for a model and `prisma:Sale.price` for a member. A model name is unique across the whole folder, so a target never names the file its model is declared in — moving a model between files cannot break a citation.

Three symbols select evidence units and declaration hosts: `"model"`, `"column"` for a stored field, and `"relation"` for a relation field. That split follows Prisma's own resolution rather than the schema text, which is what makes a relation back-reference such as `Seller.sales` classify correctly even though it carries no `@relation` attribute. A view is a `"model"` unit, which is Prisma's own shape rather than a choice made here: its parser returns a view among the datamodel's models. A reference selects `["model"]` by default, and a claim selects all three. Selecting `"column"` puts every `id`, `created_at`, and back-reference into the denominator, so turn it on where a claim really does owe an answer per member and reach for `@evidenceExclude` on the ones it deliberately does not use.

Citations live in `///` documentation comments:

```prisma
/// @evidence docs/requirements/pricing.md#discount-policy Discount columns exist for this policy.
model Sale {
  /// @evidence docs/requirements/pricing.md#coupon-stacking The stacking limit is stored here.
  coupon_limit Int
}
```

A `/* */` block comment hosts one too: Prisma documents a declaration with either form, and both reach the generated client types. A `//` line comment is discarded by Prisma itself and cannot host a citation, so a tag written in one is reported rather than ignored. A comment documents whatever declaration immediately follows it, which is Prisma's own rule: a blank line before a top-level block detaches it, and a comment above a block attribute or a closing brace documents nothing. Each of those placements is reported with the move that fixes it.

One deliberate exception belongs only to exclusions. A matching claim may include a lint-only file such as `prisma/schema/exclude.schema`, outside the Prisma generation glob, and place unattached top-level `/// @evidenceExclude` declarations there. The file adds no model to the schema inventory. Unattached `@evidence` remains invalid because ownership evidence belongs directly above the selected model, column, or relation.

The schema is parsed by Prisma itself, resolved from your project when your project can resolve one and from this package's pinned `@prisma/prisma-schema-wasm` otherwise. A rejection names which of the two judged the schema, because a parser build validates what it parses and Prisma's rules move between major versions. A schema Prisma rejects fails the build with Prisma's own message and location; it never becomes an empty population whose obligations are all vacuously satisfied.

Parsing costs a Node process, so an unchanged schema is re-parsed only when its bytes change — keyed on the content of the whole ordered file set, so adding a file, editing one, or moving a model between two of them all miss. Configured Prisma globs are declared to the host alongside the Markdown ones, so editing only a schema starts the next watch cycle on its own.

## Evidence Tags

The tags below are not yours to write. Your agent writes them as it implements, and your job is to review the stated reasons.

### Cite

```ts
/**
 * @evidence docs/sales.md#sale-price This DTO exposes the documented price.
 */
export interface IShoppingSale {
  price: number;
}
```

A TypeScript declaration cites in its JSDoc. The tag is `@evidence target reason`: the target names one evidence unit as the root of an acknowledgement scope, and everything after it is the reason. The reason is required, because a citation that cannot say why it exists is filler.

The target takes these forms:

| Target | Cites |
| --- | --- |
| `docs/sales.md` | A Markdown document and every selected heading below it |
| `docs/sales.md#sale-price` | A heading section and its selected subsection descendants; the heading declares its anchor with the `{#sale-price}` suffix |
| `POST:/members` | One Swagger or OpenAPI operation |
| `{@link sales.IShoppingSale}` | An exported type, function, or namespace; types and namespaces cover selected descendants |
| `{@link sales.IShoppingSale.price}` | One property of an exported type |

A path-addressed target is one whitespace-delimited token. Swagger operations therefore use `<UPPERCASE_METHOD>:<path>`: write `@evidence POST:/members Creates a member`, not `@evidence POST /members Creates a member`. The latter still means target `POST` with `/members Creates a member` as its reason, preserving the grammar for a TypeScript symbol named `POST`.

A TypeScript target is written as an inline link and resolved through the citing module's imports:

```ts
import type * as sales from "./contracts/IShoppingSale.js";

/**
 * @evidence {@link sales.IShoppingSale} Renders the price exactly as the contract declares it.
 */
export function SalePrice(): null {
  return null;
}
```

The braces are not decoration. They are what makes the import legitimate, and the import is what makes the citation a reference instead of a string.

```text
$ npx ttsc check
error TS16411: [evidence/graph] Unimported evidence target '{@link contracts.ISale}' at src/ui/SalePrice.ts:2 for Claim 1 across reference 1 (typescript, symbols: type): 'contracts' is not imported by this module, so the citation names a symbol this file does not reference. Import it; 'import type' is enough and is erased at emit.
```

TypeScript counts a symbol referenced from `{@link}` as used, so an import that exists only to carry a citation survives `noUnusedLocals`. It does not resolve names inside an unknown tag, so a bare `@evidence sales.IShoppingSale` would leave that import unreferenced and raise `TS6133`. Use `import type`, which is erased at emit and adds no runtime edge.

Resolving through the module's own imports also removes an ambiguity that has no fix. A generated SDK puts the same leaf name in many modules, so `get` alone names several symbols; resolved from one file's bindings, `{@link api.functional.questions.get}` names exactly one.

```tsx
/**
 * @evidence docs/sales.md#sale-price Renders the price exactly as the pricing rule defines it.
 * @evidence docs/discount.md#discount-display Shows the discounted price next to the original.
 */
export function SalePrice({ sale }: { sale: IShoppingSale }) {
  return <strong>{formatPrice(sale.price)}</strong>;
}
```

A React component cites the same way, and one declaration stacks as many `@evidence` tags as the rules or scopes it honors. The same requirement may be cited from several declarations, and parent and child evidence scopes may overlap: one requirement can need several implementations. Repeating the same resolved `@evidence` scope on one declaration is rejected; keep the truthful reason or combine the useful detail into it. A narrow target documents a narrow implementation; a parent target deliberately accepts responsibility for the complete selected subtree.

```md
# Pricing Guide

<!-- @evidence docs/requirements/pricing.md#sale-price Uses the approved sale-price definition. -->
```

A Markdown document cites path-addressed evidence in an HTML comment, so rendered prose stays clean. A heading-level citation sits right below its heading. A file-level citation sits at the top of the document. The example makes a guide answer to a requirements section selected by that Markdown claim's reference.

Markdown cannot cite a TypeScript symbol: it has no import scope in which `{@link}` can resolve, and matching a plain name repository-wide would make unrelated symbol collisions decide whether the citation works. Reverse that relation and let the TypeScript declaration cite the document, schema, or operation that justifies it.

```md
## Editorial Terminology

<!-- @evidenceExclude docs/requirements/coupons.md#coupon-stacking This section defines wording and intentionally does not implement coupon behavior. -->
```

`@evidenceExclude target reason` records that a claim intentionally does not use the target scope. On a reference that allows exclusions, it follows the same hierarchy as `@evidence`, so excluding an H2 also excludes its selected H3/H4 descendants, and excluding a type or namespace excludes its selected children. It affects only the matching claim and never crosses a reference boundary. A reference with `acknowledgement.forbidEvidenceExclude` reports the exclusion and receives no coverage from it. One claim-reference obligation may exclude a selected scope only once; overlapping exclusions are rejected even when they sit on different carriers, because the exclusion reason must have one reviewable owner. Unlike ownership evidence, a TypeScript exclusion may sit on any supported public export in the claim's file population, even when that export's symbol kind is not selected by the claim. Prisma also accepts the lint-only file carrier described above. Unexported TypeScript declarations, unsupported locations, and files outside the claim population do not qualify. Overlapping evidence and exclusion scopes are rejected because they state contradictory intent for the same unit.

In an agent workflow the tags cost nothing extra. The agent writes each citation as it implements. You review the stated reasons instead of reverse-engineering the diff. A misreading also surfaces in that review, because the reason sits beside the exact section it claims to honor.

### Violate

```md
<!-- docs/discount.md -->

## Coupon Stacking {#coupon-stacking}

At most one seller coupon and one platform coupon may combine on a single order.
```

```text
$ npx ttsc check
error TS16411: [evidence/graph] Missing acknowledgement for 'docs/discount.md#coupon-stacking' (Markdown H2 'Coupon Stacking' at docs/discount.md:3) in Claim 1 reference 1 (markdown, symbols: h2, h3). Use @evidence on a selected typescript host or @evidenceExclude on an eligible carrier.

Found 1 error.
```

The section exists in the spec, but no React component cites it, so the build fails. The diagnostic names the exact section, the claim that owes it, and both repairs: implement it and cite the section, or exempt it with an `@evidenceExclude` reason a reviewer can veto.

## Concepts

### Why agents need a gate

An agent's completion report is a claim it grades itself. Type errors guard structure and tests guard behavior, but whether the spec was honored has always been checked by a human reading a diff, and in an unattended run that human is gone.

The evidence graph moves that judgment into the build, the one authority an agent already obeys. A skipped section, a missing test, an undocumented contract: each becomes a diagnostic in the same stream as type errors, so the agent fixes spec drift inside the same loop it uses to fix types. The gate costs the workflow nothing, because the agent writes citations as it implements, and what the human reviews shrinks from the whole diff to the stated reasons.

### Coverage and integrity

The graph makes two promises. Coverage says every evidence unit is claimed by everyone who owes it. Integrity says every claim stays true.

Coverage is counted per obligation, never pooled. A backend that honors a rule and a frontend that forgot it is not a 67% project; it is a compile error naming the exact section the screen ignored. This is deliberate: pooled percentages are how partial use by several consumers masquerades as complete use by the project, and how duplicated business logic drifts apart unnoticed. A test citation is stricter than line coverage for the same reason. Line coverage credits code a test merely passes through, while a citation is an explicit claim of responsibility for a named unit.

Integrity is what survives change. A citation dies with its target, so editing a spec section out of existence breaks every artifact that leaned on it, immediately and by name. Between the two promises, every defect this plugin exists for is either a claim that is missing or a claim that stopped being true.

### Documents that can break

Code has always had reference integrity: rename a function and every caller fails. Documents never had it, which is why they rot. Nothing complains when a spec section goes stale, so no one trusts specs, so no one invests in them.

In an evidence graph a document is a set of claims that other artifacts point at by name. Prose gains the same right to break the build that a type has, and the reverse direction closes the loop: a decision that reaches code before anyone writes it down materializes as an exported symbol, which then demands a document. The spec's gaps are found by the compiler instead of by the next confused reader. Completeness guarded in one direction and breakage in the other, documentation stops aging: it is either current or it stops the build. That is what "docs as spec" needs to become real: not discipline, but a linker.

## Sponsors

[![Sponsors](https://raw.githubusercontent.com/samchon/sponsor-images/refs/heads/master/public/circle.svg)](https://github.com/sponsors/samchon)

Thanks for your support.

Your [donation](https://github.com/sponsors/samchon) encourages `@samchon/lint-plugin-evidence` development.

## References

- [`ttsc`](https://github.com/samchon/ttsc): the `typescript-go` toolchain this plugin runs on.
- [`@ttsc/lint`](https://github.com/samchon/ttsc/tree/master/packages/lint): the lint engine that links this rule into the compiler.

Evidence Graph is being developed as an independent package while its rule model and adoption path mature. Once complete and stable, it may move into the `ttsc` repository as the official `@ttsc/lint-plugin-evidence` package.

The longer-term plan also reaches beyond TypeScript: a standalone, language-agnostic evidence checker that can enforce the same graph across documents and code in any programming language, without depending on a single compiler or lint engine.
