package evidence

import "testing"

const entryClaimConfig = `{"claims":[{
	"type":"typescript",
	"files":["src/views/**"],
	"symbol":"function",
	"reference":{"type":"typescript","files":["src/api/index.ts"],"symbol":"function"}
}]}`

/**
 * Verifies a matched module reaches a symbol through `export *` and addresses it
 * by its accessor path.
 *
 * A glob selects modules, and the population is what those modules publish
 * rather than what they happen to declare. The declaring file here is outside
 * the glob, so the symbol belongs to the obligation only through the barrel —
 * and the accessor address is what makes it nameable at all.
 *
 *  1. Re-export a module's whole surface from a matched barrel.
 *  2. Cite the symbol under the barrel-relative address.
 *  3. Assert silence, which requires both resolution and coverage to succeed.
 */
func TestGraphReachesSymbolsThroughStarReExports(t *testing.T) {
	assertNoProblems(t, runIndexRule(t, map[string]string{
		"src/api/questions.ts": "export function get(): void {}\n",
		"src/api/index.ts":     "export * from \"./questions.js\";\n",
		"src/views/detail.ts": `
import type * as api from "./../api/index.js";

/** @evidence {@link api.get} Renders this operation's response. */
export function detail(): void {}
`,
	}, entryClaimConfig))
}

/**
 * Verifies `export * as ns` nests the target's surface one segment deeper.
 *
 * This is the shape a generated SDK is built from, and it is the whole reason
 * `api.functional.questions.get` can be written at all. Flattening it would
 * collapse every resource module into one namespace and reintroduce the
 * collision the accessor path exists to avoid.
 *
 *  1. Nest two resource modules under namespace re-exports.
 *  2. Cite one operation by its full accessor path.
 *  3. Assert silence.
 */
func TestGraphNestsNamespaceReExportsIntoTheAddress(t *testing.T) {
	assertNoProblems(t, runIndexRule(t, map[string]string{
		"src/api/questions.ts": "export function get(): void {}\n",
		"src/api/functional.ts": `
export * as questions from "./questions.js";
`,
		"src/api/index.ts": "export * as functional from \"./functional.js\";\n",
		"src/views/detail.ts": `
import type * as api from "./../api/index.js";

/** @evidence {@link api.functional.questions.get} Renders this operation's response. */
export function detail(): void {}
`,
	}, entryClaimConfig))
}

/**
 * Verifies an aliased re-export is addressed by its public name.
 *
 * `export { get as fetch }` is what a consumer can import, so the accessor path
 * has to follow the alias. Addressing the declaring module's own name would
 * name something no importer can reach.
 *
 *  1. Re-export a callable under a different name.
 *  2. Cite the alias, and assert the original name is not addressable.
 *  3. Assert the alias resolves and the original does not.
 */
func TestGraphAddressesAliasedReExportsByTheirPublicName(t *testing.T) {
	files := map[string]string{
		"src/api/questions.ts": "export function get(): void {}\n",
		"src/api/index.ts":     "export { get as fetch } from \"./questions.js\";\n",
		"src/views/detail.ts": `
import type * as api from "./../api/index.js";

/** @evidence {@link api.fetch} Renders this operation's response. */
export function detail(): void {}
`,
	}
	assertNoProblems(t, runIndexRule(t, files, entryClaimConfig))

	files["src/views/detail.ts"] = `
import type * as api from "./../api/index.js";

/** @evidence {@link api.get} Renders this operation's response. */
export function detail(): void {}
`
	assertProblemContains(
		t,
		runIndexRule(t, files, entryClaimConfig),
		"declares no selected unit named 'get'",
	)
}

/**
 * Verifies a symbol an entry exposes twice remains one coverage unit.
 *
 * Both addresses have to resolve, because both are real to an importer, and
 * neither may create a second obligation — a barrel that also re-exports a
 * namespace would otherwise double every symbol underneath it and demand two
 * citations for one contract.
 *
 *  1. Expose one declaration flat and under a namespace from the same entry.
 *  2. Acknowledge its one coverage obligation through either address.
 *  3. Assert silence, so the other address created no second obligation.
 */
func TestGraphCountsATwiceReachedSymbolOnce(t *testing.T) {
	files := map[string]string{
		"src/api/questions.ts": "export function get(): void {}\n",
		"src/api/index.ts": `
export * from "./questions.js";
export * as questions from "./questions.js";
`,
		"src/views/detail.ts": `
import type * as api from "./../api/index.js";

/** @evidence {@link api.get} Renders this operation's response. */
export function detail(): void {}
`,
	}
	assertNoProblems(t, runIndexRule(t, files, entryClaimConfig))

	files["src/views/detail.ts"] = `
import type * as api from "./../api/index.js";

/** @evidence {@link api.questions.get} Renders this operation's response. */
export function detail(): void {}
`
	assertNoProblems(t, runIndexRule(t, files, entryClaimConfig))
}

/**
 * Verifies several selected modules union into one population.
 *
 * A glob usually matches a barrel and the modules beneath it at once. Each is a
 * module a consumer may import, so the symbol is citable through either — and
 * the two ways of reaching one declaration must still leave one obligation, or
 * selecting a directory would demand a second citation for every re-export.
 *
 *  1. Match both a barrel and the module it forwards.
 *  2. Cite the declaration through the barrel, then through the declaring module.
 *  3. Assert each citation alone resolves and completes the obligation.
 */
func TestGraphUnionsSeveralSelectedModules(t *testing.T) {
	const config = `{"claims":[{
		"type":"typescript",
		"files":["src/views/**"],
		"symbol":"function",
		"reference":{"type":"typescript","files":["src/api/**"],"symbol":"function"}
	}]}`
	files := map[string]string{
		"src/api/questions.ts": "export function get(): void {}\n",
		"src/api/index.ts":     "export * from \"./questions.js\";\n",
		"src/views/detail.ts": `
import type * as api from "./../api/index.js";

/** @evidence {@link api.get} Renders this operation's response. */
export function detail(): void {}
`,
	}
	assertNoProblems(t, runIndexRule(t, files, config))

	files["src/views/detail.ts"] = `
import type * as questions from "./../api/questions.js";

/** @evidence {@link questions.get} Renders this operation's response. */
export function detail(): void {}
`
	assertNoProblems(t, runIndexRule(t, files, config))
}

/**
 * Verifies a property travels with the type that owns it.
 *
 * A property is addressable exactly when its owner is, so an entry that reaches
 * `ISale` must also reach `ISale.price`. Materializing only the top-level
 * declaration would silently drop every property obligation the moment a
 * reference switched from globs to an entry.
 *
 *  1. Select type and property units through an entry.
 *  2. Acknowledge the owning type alone.
 *  3. Assert the property is covered by its owner's scope.
 */
func TestGraphCarriesPropertiesUnderTheirOwnersAddress(t *testing.T) {
	assertNoProblems(t, runIndexRule(t, map[string]string{
		"src/api/sale.ts": `
export interface ISale {
  price: number;
}
`,
		"src/api/index.ts": "export * from \"./sale.js\";\n",
		"src/views/detail.ts": `
import type * as api from "./../api/index.js";

/** @evidence {@link api.ISale} Mirrors the sale contract and its properties. */
export function detail(): void {}
`,
	}, `{"claims":[{
		"type":"typescript",
		"files":["src/views/**"],
		"symbol":"function",
		"reference":{"type":"typescript","files":["src/api/index.ts"],"symbol":["type","property"]}
	}]}`))
}

/**
 * Verifies a cyclic barrel terminates.
 *
 * Two modules re-exporting each other is a real shape in generated code, and an
 * unguarded traversal would recurse until the process died. A rule that hangs
 * is worse than one that reports nothing, because nothing else in the build
 * gets to run either.
 *
 *  1. Point two barrels at each other, one of them declaring a symbol.
 *  2. Cite that symbol through the entry.
 *  3. Assert the run completes and resolves.
 */
func TestGraphTerminatesOnCyclicReExports(t *testing.T) {
	assertNoProblems(t, runIndexRule(t, map[string]string{
		"src/api/index.ts": `
export * from "./other.js";
export function get(): void {}
`,
		"src/api/other.ts": "export * from \"./index.js\";\n",
		"src/views/detail.ts": `
import type * as api from "./../api/index.js";

/** @evidence {@link api.get} Renders this operation's response. */
export function detail(): void {}
`,
	}, entryClaimConfig))
}

/**
 * Verifies a glob matching nothing is reported against what it tried to select.
 *
 * A population that resolves to no module materializes no units, and a silent
 * empty population would read as a satisfied obligation — the failure this
 * product exists to prevent.
 *
 *  1. Point a reference at a module that does not exist.
 *  2. Evaluate the graph.
 *  3. Assert the diagnostic names the attempted population.
 */
func TestGraphReportsAMissingReferenceModule(t *testing.T) {
	assertProblemContains(t, runIndexRule(t, map[string]string{
		"src/views/detail.ts": "export function detail(): void {}\n",
	}, entryClaimConfig), "matched no typescript files for ['src/api/index.ts']")
}

/**
 * Verifies a matched module exposing none of the selected kinds is reported.
 *
 * The population resolved and is empty, which coverage would otherwise treat as
 * complete. Naming the selector tells the author which half to correct.
 *
 *  1. Publish only a type while selecting callables.
 *  2. Evaluate the graph.
 *  3. Assert the empty population is reported rather than passing.
 */
func TestGraphReportsAPopulationThatReachesNoSelectedUnits(t *testing.T) {
	assertProblemContains(t, runIndexRule(t, map[string]string{
		"src/api/sale.ts": `
export interface ISale {
  price: number;
}
`,
		"src/api/index.ts":    "export * from \"./sale.js\";\n",
		"src/views/detail.ts": "export function detail(): void {}\n",
	}, entryClaimConfig), "matched 1 file(s) but materialized no selected evidence units (function)")
}

/**
 * Verifies a barrel forwarding many names from one module reaches all of them.
 *
 * A wide `export { a, b, c, ... } from` is the ordinary shape of a generated
 * barrel. Walking the target once per specifier returns the same answer and
 * re-traverses its whole subtree for every name, so this pins the result while
 * the grouping keeps the cost linear.
 *
 *  1. Forward four names from one module through an entry.
 *  2. Acknowledge all four by their entry-relative addresses.
 *  3. Assert silence, so every forwarded name both resolved and was covered.
 */
func TestGraphReachesEveryNameOfAWideReExport(t *testing.T) {
	assertNoProblems(t, runIndexRule(t, map[string]string{
		"src/api/operations.ts": `
export function get(): void {}
export function post(): void {}
export function patch(): void {}
export function erase(): void {}
`,
		"src/api/index.ts": `
export { get, post, patch, erase } from "./operations.js";
`,
		"src/views/detail.ts": `
import type * as api from "./../api/index.js";

/**
 * @evidence {@link api.get} Reads the resource.
 * @evidence {@link api.post} Creates the resource.
 * @evidence {@link api.patch} Updates the resource.
 * @evidence {@link api.erase} Removes the resource.
 */
export function detail(): void {}
`,
	}, entryClaimConfig))
}
