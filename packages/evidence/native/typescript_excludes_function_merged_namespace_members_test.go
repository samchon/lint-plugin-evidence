package evidence

import (
	"sort"
	"strings"
	"testing"
)

// mergedAccessorFiles is the generated SDK shape this correction exists for:
// one exported function merged with a namespace of the same name, reached
// through the nested barrels a Nestia SDK publishes.
func mergedAccessorFiles() map[string]string {
	return map[string]string{
		"src/api/health.ts": `
export async function get(connection: string): Promise<get.Output> {
  return get.simulate(connection);
}
export namespace get {
  export type Output = string;

  export const METADATA = {
    method: "GET",
    path: "/health",
  } as const;

  export const path = () => "/health";
  export const random = (): string => "true";
  export const simulate = (_connection: string): Output => random();
}
`,
		"src/api/index.ts": "export * as health from \"./health\";\n",
		"src/index.ts":     "export * as functional from \"./api/index\";\n",
	}
}

/**
 * Verifies that nothing declared inside a namespace merged with a same-named
 * function materializes as an evidence unit, at any depth and of any kind.
 *
 * Such a namespace is the function's static side rather than an independent
 * container: `get.path` is a property of the `get` function value and
 * `get.Output` is the type its own signature spells. Splitting the exclusion by
 * member kind would leave the same namespace reading as machinery under one
 * symbol selector and as public surface under another, so the population would
 * depend on which reference is looking at it. The ordinary namespace beside it
 * is the negative twin that keeps this from becoming "namespaces select
 * nothing".
 *
 *  1. Declare a function-merged namespace holding every member kind, including
 *     a nested namespace and a nested function-merged pair.
 *  2. Declare an ordinary namespace beside it, itself holding a function-merged
 *     pair.
 *  3. Assert the exact public inventory: the merged namespaces contribute their
 *     own identities and nothing beneath them, while every ordinary member
 *     survives.
 */
func TestTypeScriptFunctionMergedNamespaceMembersAreNotUnits(t *testing.T) {
	inventory := parseTypeScriptInventory(t, "src/contracts.ts", `
export function get(connection: string): string {
  return get.simulate(connection);
}
export namespace get {
  export type Output = string;
  export const METADATA = { method: "GET" } as const;
  export const path = () => "/health";
  export interface Query {
    page: number;
  }
  export class Client {
    send(): void {}
  }
  export namespace nested {
    export const inner = (): void => {};
  }
}

export namespace catalog {
  export const size = 1;
  export const list = (): void => {};
  export interface Item {
    id: string;
  }
  export function find(): void {}
  export namespace find {
    export const path = () => "/find";
  }
}
`)
	units := []string{}
	for _, unit := range inventory.Units {
		units = append(units, unit.Symbol+":"+unit.Target)
	}
	sort.Strings(units)
	want := []string{
		"function:catalog.find",
		"function:catalog.list",
		"function:get",
		"property:catalog.Item.id",
		"property:catalog.size",
		"type:catalog",
		"type:catalog.Item",
		"type:catalog.find",
		"type:get",
	}
	sort.Strings(want)
	if strings.Join(units, "\n") != strings.Join(want, "\n") {
		t.Fatalf(
			"function-merged namespace units:\n%s\nwant:\n%s",
			strings.Join(units, "\n"),
			strings.Join(want, "\n"),
		)
	}
}

/**
 * Verifies a generated accessor resolves to exactly one unit and owes exactly
 * one acknowledgement.
 *
 * The members were not merely noisy: selecting them promoted the merged
 * namespace to an addressable aggregate scope, where it collided with the
 * function unit of the same name and left every `{@link ...}` citation of the
 * accessor ambiguous. So there was no spelling of the target that resolved, and
 * the citing host was reported as citing zero units under
 * `singleEvidencePerSymbol`. Resolution and cardinality are asserted together
 * because the second was a consequence of the first.
 *
 *  1. Publish the accessor through the nested barrels an SDK generates.
 *  2. Cite it once from a host under `singleEvidencePerSymbol`.
 *  3. Assert silence, which requires one resolution, one obligation, and a
 *     count of exactly one.
 */
func TestGraphResolvesAFunctionMergedAccessorToOneUnit(t *testing.T) {
	files := mergedAccessorFiles()
	files["test/health.ts"] = `import type * as api from "../src/index";

/** @evidence {@link api.functional.health.get} Exercises the health operation. */
export function test_health(): void {}
`
	assertNoProblems(t, runIndexRule(t, files, `{"claims":[{
		"type":"typescript",
		"files":["test/**"],
		"symbol":"function",
		"reference":{
			"type":"typescript",
			"files":["src/index.ts"],
			"symbol":["function"],
			"singleEvidencePerSymbol":true
		}
	}]}`))
}

/**
 * Verifies the accessor's obligation is real rather than absent.
 *
 * An operation that materializes no unit at all would also be silent when
 * nobody cites it, which is indistinguishable from the fix above and is the
 * failure mode this product exists to prevent. Removing the citation must
 * therefore leave exactly one missing acknowledgement, named for the accessor.
 *
 *  1. Publish the same accessor with no citation anywhere.
 *  2. Evaluate the graph.
 *  3. Assert one missing acknowledgement, for the accessor itself.
 */
func TestGraphStillOwesTheFunctionMergedAccessorItself(t *testing.T) {
	files := mergedAccessorFiles()
	files["test/health.ts"] = "export function test_health(): void {}\n"
	messages := runIndexRule(t, files, `{"claims":[{
		"type":"typescript",
		"files":["test/**"],
		"symbol":"function",
		"reference":{"type":"typescript","files":["src/index.ts"],"symbol":["function"]}
	}]}`)
	if count := countProblemsContaining(messages, "Missing acknowledgement"); count != 1 {
		t.Fatalf(
			"expected the accessor to owe exactly one acknowledgement, got %d:\n%s",
			count,
			strings.Join(messages, "\n"),
		)
	}
	assertProblemContains(
		t,
		messages,
		"Missing acknowledgement for 'functional.health.get' (TypeScript function 'get'",
	)
}

/**
 * Verifies the negative twin: an ordinary namespace keeps every member
 * selected.
 *
 * The correction is keyed on the merge, not on nesting. Without this case a
 * rule that dropped every namespace member would pass the accessor cases just
 * as well, and would silently erase the obligations of every grouped export in
 * a consumer's codebase.
 *
 *  1. Group independent callables under a namespace nothing merges with.
 *  2. Cite the namespace's own name.
 *  3. Assert the members are still owed under their qualified addresses.
 */
func TestGraphKeepsOrdinaryNamespaceMembersSelected(t *testing.T) {
	messages := runIndexRule(t, map[string]string{
		"src/api/health.ts": `
export namespace health {
  export const check = (): void => {};
  export const probe = (): void => {};
}
`,
		"src/index.ts": "export * from \"./api/health\";\n",
		"test/health.ts": `import type * as api from "../src/index";

/** @evidence {@link api.health.check} Exercises the check helper. */
export function test_health(): void {}
`,
	}, `{"claims":[{
		"type":"typescript",
		"files":["test/**"],
		"symbol":"function",
		"reference":{"type":"typescript","files":["src/index.ts"],"symbol":["function"]}
	}]}`)
	assertProblemContains(t, messages, "Missing acknowledgement for 'health.probe'")
	if count := countProblemsContaining(messages, "Missing acknowledgement"); count != 1 {
		t.Fatalf(
			"expected only the uncited member to remain owed, got %d:\n%s",
			count,
			strings.Join(messages, "\n"),
		)
	}
}

/**
 * Verifies an interface merged with a same-named namespace is untouched.
 *
 * `IShoppingSale` beside `namespace IShoppingSale` is how a type family spells
 * its variants, and both declarations are symbol `type` under one identity, so
 * they already materialize one unit and nothing competes for the name. The
 * correction must not reach it: dropping the namespace's members here would
 * erase `IShoppingSale.ICreate` from every population that selects types.
 *
 *  1. Merge an interface with a namespace declaring a nested variant.
 *  2. Collect the inventory.
 *  3. Assert the merged name is one unit and every nested member survives.
 */
func TestTypeScriptInterfaceMergedNamespaceKeepsItsMembers(t *testing.T) {
	inventory := parseTypeScriptInventory(t, "src/contracts.ts", `
export interface IShoppingSale {
  id: string;
}
export namespace IShoppingSale {
  export interface ICreate {
    title: string;
  }
  export const DEFAULT_PAGE = 1;
}
`)
	units := []string{}
	for _, unit := range inventory.Units {
		units = append(units, unit.Symbol+":"+unit.Target)
	}
	sort.Strings(units)
	want := []string{
		"property:IShoppingSale.DEFAULT_PAGE",
		"property:IShoppingSale.ICreate.title",
		"property:IShoppingSale.id",
		"type:IShoppingSale",
		"type:IShoppingSale.ICreate",
	}
	sort.Strings(want)
	if strings.Join(units, "\n") != strings.Join(want, "\n") {
		t.Fatalf(
			"interface-merged namespace units:\n%s\nwant:\n%s",
			strings.Join(units, "\n"),
			strings.Join(want, "\n"),
		)
	}
}

/**
 * Verifies a class merged with a same-named namespace is untouched.
 *
 * A class registers no unit under its own name — only its callables do — so
 * `class Service` beside `namespace Service` has nothing to collide with and
 * never produced the ambiguity this change removes. Keying the correction on
 * the namespace alone would have caught it anyway and erased the companion
 * object every such class publishes.
 *
 *  1. Merge a class with a namespace declaring companion members.
 *  2. Collect the inventory.
 *  3. Assert the class callables and every namespace member survive.
 */
func TestTypeScriptClassMergedNamespaceKeepsItsMembers(t *testing.T) {
	inventory := parseTypeScriptInventory(t, "src/contracts.ts", `
export class Service {
  static create(): void {}
  send(): void {}
}
export namespace Service {
  export const VERSION = 1;
  export const build = (): void => {};
}
`)
	units := []string{}
	for _, unit := range inventory.Units {
		units = append(units, unit.Symbol+":"+unit.Target)
	}
	sort.Strings(units)
	want := []string{
		"function:Service.build",
		"function:Service.create",
		"function:Service.prototype.send",
		"property:Service.VERSION",
		"type:Service",
	}
	sort.Strings(want)
	if strings.Join(units, "\n") != strings.Join(want, "\n") {
		t.Fatalf(
			"class-merged namespace units:\n%s\nwant:\n%s",
			strings.Join(units, "\n"),
			strings.Join(want, "\n"),
		)
	}
}

/**
 * Verifies `evidence/documented` sees the same corrected population.
 *
 * The correction belongs to the unit collection every rule shares, not to the
 * graph rule alone. If it did not reach here, a consumer selecting function
 * hosts would still be told to write a JSDoc block on `get.path`, `get.random`,
 * and `get.simulate` — declarations that are no longer part of the public
 * surface at all.
 *
 *  1. Document the accessor and leave its static members bare.
 *  2. Run the documented rule over function hosts.
 *  3. Assert silence, then assert the rule still fires on an ordinary
 *     namespace's undocumented member.
 */
func TestDocumentedSkipsFunctionMergedNamespaceMembers(t *testing.T) {
	assertSilent(t, runDocumentedRule(t, "src/health.ts", `
/** Returns the process health marker. */
export function get(connection: string): string {
  return get.simulate(connection);
}
export namespace get {
  export const path = () => "/health";
  export const simulate = (_connection: string): string => "true";
}
`, `{"symbol":["function"]}`))

	assertReported(t, runDocumentedRule(t, "src/health.ts", `
export namespace health {
  export const probe = (): void => {};
}
`, `{"symbol":["function"]}`), "Missing JSDoc on exported function 'health.probe'")
}
