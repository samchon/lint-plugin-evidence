package evidence

import (
	"strings"
	"testing"
)

/**
 * Verifies a public TypeScript export may carry an exclusion for a claim whose
 * selected ownership host has another symbol kind.
 *
 * Central exclusion ledgers are deliberately data exports so they cannot be
 * mistaken for an operation or DTO. Requiring the claim selector to include
 * that property would couple reviewed non-applicability to ownership evidence.
 *
 *  1. Select function and type ownership hosts in separate claim files.
 *  2. Put each exclusion on a public property carrier in its matching file.
 *  3. Assert both claims are completely acknowledged without widening symbols.
 */
func TestGraphAcceptsPublicTypeScriptExclusionCarriers(t *testing.T) {
	messages := runIndexRule(t, map[string]string{
		"docs/controller.md": "## Controller\n",
		"docs/dto.md":        "## DTO\n",
		"src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts": `
/**
 * Central controller exclusions.
 *
 * @evidenceExclude docs/controller.md#controller This package intentionally exposes no operation for the section.
 */
export const CONTROLLER_EVIDENCE_EXCLUDE = true;
`,
		"src/structures/DTO_EVIDENCE_EXCLUDE.ts": `
/**
 * Central DTO exclusions.
 *
 * @evidenceExclude docs/dto.md#dto This package intentionally exposes no DTO for the section.
 */
export const DTO_EVIDENCE_EXCLUDE = true;
`,
	}, `{"claims":[{
		"name":"api-operations",
		"type":"typescript",
		"files":["src/controllers/**/*.ts"],
		"symbol":"function",
		"reference":{"type":"markdown","files":["docs/controller.md"],"symbol":"h2"}
	},{
		"name":"dto-types",
		"type":"typescript",
		"files":["src/structures/**/*.ts"],
		"symbol":"type",
		"reference":{"type":"markdown","files":["docs/dto.md"],"symbol":"h2"}
	}]}`)
	assertNoProblems(t, messages)
}

/**
 * Verifies ownership evidence remains bound to the symbol selector even when
 * the same public export is an eligible exclusion carrier.
 *
 * The carrier exception expresses non-applicability only. Letting `@evidence`
 * use it would move claimed implementation away from the declaration that
 * actually owns the behavior and erase the graph's host meaning.
 *
 *  1. Select function hosts and cite the target from an exported property.
 *  2. Use `@evidence`, not `@evidenceExclude`, on that carrier.
 *  3. Assert the selected-host diagnostic and missing obligation both remain.
 */
func TestGraphKeepsEvidenceOnSelectedTypeScriptHosts(t *testing.T) {
	messages := runIndexRule(t, map[string]string{
		"docs/spec.md": "## Contract\n",
		"src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts": `
/**
 * Central controller exclusions.
 *
 * @evidence docs/spec.md#contract This property does not own an operation.
 */
export const CONTROLLER_EVIDENCE_EXCLUDE = true;
`,
	}, `{"claims":[{
		"type":"typescript",
		"files":["src/controllers/**/*.ts"],
		"symbol":"function",
		"reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
	}]}`)
	assertProblemContains(t, messages, "Out-of-scope @evidence host")
	assertProblemContains(t, messages, "host kind 'property' is not selected")
	assertProblemContains(t, messages, "Missing acknowledgement for 'docs/spec.md#contract'")
}

/**
 * Verifies an unexported declaration is not promoted into an exclusion carrier.
 *
 * Carrier eligibility follows the same public-declaration inventory the graph
 * can identify durably. Accepting a private constant would create an invisible
 * acknowledgement surface that generated declarations and consumers cannot
 * address.
 *
 *  1. Put an exclusion on an unexported constant in a matching claim file.
 *  2. Select function hosts and materialize one Markdown obligation.
 *  3. Assert the carrier is rejected and the obligation remains missing.
 */
func TestGraphRejectsPrivateTypeScriptExclusionCarriers(t *testing.T) {
	messages := runIndexRule(t, map[string]string{
		"docs/spec.md": "## Contract\n",
		"src/controllers/CONTROLLER_EVIDENCE_EXCLUDE.ts": `
/** @evidenceExclude docs/spec.md#contract This private ledger must not count. */
const CONTROLLER_EVIDENCE_EXCLUDE = true;
`,
	}, `{"claims":[{
		"type":"typescript",
		"files":["src/controllers/**/*.ts"],
		"symbol":"function",
		"reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
	}]}`)
	assertProblemContains(t, messages, "Out-of-scope @evidenceExclude carrier")
	assertProblemContains(t, messages, "unsupported or non-exported declaration")
	assertProblemContains(t, messages, "Missing acknowledgement for 'docs/spec.md#contract'")
}

/**
 * Verifies a carrier ignores host kind without crossing claim-reference
 * boundaries in one overlapping file population.
 *
 * Two claims may read the same ledger, but each exclusion must still resolve
 * into a reference owned by that claim. Host relaxation must not turn one
 * declaration into a package-wide exemption.
 *
 *  1. Point function and type claims at the same carrier file.
 *  2. Give the claims distinct Markdown populations and exclude both targets.
 *  3. Assert each declaration participates only in the obligation it resolves.
 */
func TestGraphKeepsExclusionCarriersClaimLocal(t *testing.T) {
	messages := runIndexRule(t, map[string]string{
		"docs/api.md": "## Operation\n",
		"docs/dto.md": "## Shape\n",
		"src/EVIDENCE_EXCLUDE.ts": `
/**
 * Shared central exclusions.
 *
 * @evidenceExclude docs/api.md#operation This package intentionally omits the operation.
 * @evidenceExclude docs/dto.md#shape This package intentionally omits the shape.
 */
export const EVIDENCE_EXCLUDE = true;
`,
	}, `{"claims":[{
		"name":"operations",
		"type":"typescript",
		"files":["src/**/*.ts"],
		"symbol":"function",
		"reference":{"type":"markdown","files":["docs/api.md"],"symbol":"h2"}
	},{
		"name":"shapes",
		"type":"typescript",
		"files":["src/**/*.ts"],
		"symbol":"type",
		"reference":{"type":"markdown","files":["docs/dto.md"],"symbol":"h2"}
	}]}`)
	assertNoProblems(t, messages)
}

/**
 * Verifies a comment-only `.schema` file can carry a top-level Prisma
 * exclusion without adding a model to the schema inventory.
 *
 * The ledger belongs to the graph input but not to Prisma generation. Parsing
 * it in the same configured set proves the extension and empty datamodel are
 * accepted while the exclusion covers the real model claim's reference.
 *
 *  1. Configure one ordinary Prisma schema and one comment-only carrier.
 *  2. Put the only Markdown exclusion at file level in the carrier.
 *  3. Assert the combined Prisma claim is healthy and completely acknowledged.
 */
func TestGraphAcceptsFileLevelPrismaExclusionCarrier(t *testing.T) {
	messages := runIndexRule(t, map[string]string{
		"docs/spec.md": "## Contract\n",
		"prisma/schema/main.prisma": `
datasource db {
  provider = "sqlite"
}

generator client {
  provider = "prisma-client-js"
}

model Sale {
  id String @id
}
`,
		"prisma/schema/exclude.schema": `/// Lint-only exclusion ledger; Prisma generation does not read this extension.
///
/// @evidenceExclude docs/spec.md#contract This schema intentionally stores no state for the section.
`,
	}, `{"claims":[{
		"type":"prisma",
		"files":["prisma/schema/**/*.prisma","prisma/schema/exclude.schema"],
		"symbol":"model",
		"reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
	}]}`)
	assertNoProblems(t, messages)
}

/**
 * Verifies file-level Prisma carriers accept exclusions only and retain the
 * existing placement and resolution failures.
 *
 * A detached `@evidence` would claim schema ownership without a model, while a
 * double-slash tag is discarded by Prisma and an unresolved exclusion cannot
 * discharge any configured obligation.
 *
 *  1. Exercise file-level `@evidence`, `// @evidenceExclude`, and a bad target.
 *  2. Evaluate each against the same model-only claim.
 *  3. Assert every case names its exact invalid boundary.
 */
func TestGraphRejectsInvalidFileLevelPrismaCarrierTags(t *testing.T) {
	config := `{"claims":[{
		"type":"prisma",
		"files":["prisma/schema/**/*.prisma","prisma/schema/exclude.schema"],
		"symbol":"model",
		"reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
	}]}`
	schema := `
datasource db {
  provider = "sqlite"
}

generator client {
  provider = "prisma-client-js"
}

model Sale {
  id String @id
}
`
	cases := []struct {
		name     string
		carrier  string
		expected string
	}{
		{
			name:     "ownership evidence",
			carrier:  "/// @evidence docs/spec.md#contract A file cannot own this evidence.\n",
			expected: "only @evidenceExclude may be unattached at file level",
		},
		{
			name:     "line comment",
			carrier:  "// @evidenceExclude docs/spec.md#contract Prisma discards this line.\n",
			expected: "'//' line comment",
		},
		{
			name:     "block comment",
			carrier:  "/* @evidenceExclude docs/spec.md#contract Only triple slash opens a file carrier. */\n",
			expected: "documents no declaration",
		},
		{
			name:     "buried fourth slash",
			carrier:  "//// @evidenceExclude docs/spec.md#contract The tag is buried.\n",
			expected: "buried behind an extra slash",
		},
		{
			name:     "unresolved target",
			carrier:  "/// @evidenceExclude docs/spec.md#missing No configured section has this address.\n",
			expected: "Unresolved evidence target 'docs/spec.md#missing'",
		},
	}
	for _, entry := range cases {
		t.Run(entry.name, func(t *testing.T) {
			messages := runIndexRule(t, map[string]string{
				"docs/spec.md":                 "## Contract\n",
				"prisma/schema/main.prisma":    schema,
				"prisma/schema/exclude.schema": entry.carrier,
			}, config)
			if !strings.Contains(strings.Join(messages, "\n"), entry.expected) {
				t.Fatalf(
					"expected diagnostic containing %q, got:\n%s",
					entry.expected,
					strings.Join(messages, "\n"),
				)
			}
		})
	}
}
