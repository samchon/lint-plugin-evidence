package evidence

import "testing"

/**
 * Verifies a healthy Markdown claim matching zero files is inactive.
 *
 * Markdown uses the same own-population gate as TypeScript and Prisma. The
 * missing Prisma root is deliberately placed behind the claim so silence also
 * proves reference loading did not start.
 *
 *  1. Match no Markdown file with the claim glob.
 *  2. Configure an unreadable Prisma reference root.
 *  3. Assert the healthy empty claim and its reference remain silent.
 */
func TestMarkdownClaimMatchingZeroFilesIsInactive(t *testing.T) {
	assertNoProblems(t, runIndexRule(t, map[string]string{
		"src/index.ts": "export interface Index {}\n",
	}, `{"claims":[{
		"type":"markdown",
		"files":["docs/absent/**/*.md"],
		"symbol":"h2",
		"reference":{
			"type":"prisma",
			"root":"missing-prisma",
			"files":["**/*.prisma"],
			"symbol":"model"
		}
	}]}`))
}

/**
 * Verifies a matched Markdown file without the selected heading is inactive.
 *
 * File matching alone does not create a claim host. An H1-only document under
 * an H2 claim has no selected own unit, so the unreadable reference behind it
 * must not be loaded or diagnosed.
 *
 *  1. Match one Markdown file containing an H1 but no H2.
 *  2. Select H2 claim hosts and configure an unreadable Prisma reference.
 *  3. Assert the healthy zero-selected claim remains silent.
 */
func TestMarkdownClaimWithoutItsSelectedHeadingIsInactive(t *testing.T) {
	assertNoProblems(t, runIndexRule(t, map[string]string{
		"docs/README.md": "# Overview\n",
		"src/index.ts":   "export interface Index {}\n",
	}, `{"claims":[{
		"type":"markdown",
		"files":["docs/**/*.md"],
		"symbol":"h2",
		"reference":{
			"type":"prisma",
			"root":"missing-prisma",
			"files":["**/*.prisma"],
			"symbol":"model"
		}
	}]}`))
}

const emptyPrismaScaffold = `generator client {
  provider     = "prisma-client"
  output       = "../../src/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "sqlite"
}

generator markdown {
  provider = "prisma-markdown"
  output   = "../../../../docs/ERD.md"
}
`

/**
 * Verifies the benchmark Prisma scaffold is inactive before its references.
 *
 * `prisma/schema/main.prisma` is a real matched schema file but its generator
 * and datasource blocks materialize no `model` unit. The fixture reproduces
 * the benchmark scaffold exactly and supplies the empty loader result that its
 * model population produces.
 *
 *  1. Match the exact model-free benchmark scaffold path and contents.
 *  2. Apply a model claim to the resulting healthy empty inventory.
 *  3. Assert the Prisma claim is removed before reference loading.
 */
func TestPrismaClaimWithOnlyTheBenchmarkScaffoldIsInactive(t *testing.T) {
	root := t.TempDir()
	config := decodeInventoryConfig(t, root, `{"claims":[{
		"type":"prisma",
		"files":["prisma/schema/**/*.prisma"],
		"symbol":"model",
		"reference":{
			"type":"markdown",
			"root":"missing-docs",
			"files":["**/*.md"],
			"symbol":"h2"
		}
	}]}`)
	address := config.Claims[0].Base.addressOf("prisma/schema/main.prisma")
	_ = scanPrismaFile(
		address.Display,
		emptyPrismaScaffold,
		map[string]prismaLocation{},
	)
	inventory := &artifactInventory{
		Address: address.Key,
		Path:    address.Display,
		Type:    artifactPrisma,
	}
	active := activeGraphConfig(
		config,
		map[string]*artifactInventory{},
		map[string]*artifactInventory{address.Key: inventory},
		map[string]*artifactInventory{},
	)
	if len(active.Claims) != 0 {
		t.Fatal("a matched Prisma scaffold with no selected model must be inactive")
	}
}

/**
 * Verifies a failed Prisma parse cannot make its claim inactive.
 *
 * A parser failure may have hidden every selected model, so a unitless failed
 * inventory is not evidence of a healthy empty population. Keeping the claim
 * active preserves the parser diagnostic loaded during activation.
 *
 *  1. Match one Prisma claim inventory marked as parse-failed.
 *  2. Apply the shared own-population activation gate.
 *  3. Assert the failed claim remains active for its direct diagnostic.
 */
func TestFailedPrismaClaimPopulationDoesNotBecomeInactive(t *testing.T) {
	root := t.TempDir()
	config := decodeInventoryConfig(t, root, `{"claims":[{
		"type":"prisma",
		"files":["prisma/schema/main.prisma"],
		"symbol":"model",
		"reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
	}]}`)
	address := config.Claims[0].Base.addressOf("prisma/schema/main.prisma")
	active := activeGraphConfig(
		config,
		map[string]*artifactInventory{},
		map[string]*artifactInventory{
			address.Key: {
				Address:    address.Key,
				Path:       address.Display,
				Type:       artifactPrisma,
				LoadFailed: true,
			},
		},
		map[string]*artifactInventory{},
	)
	if len(active.Claims) != 1 {
		t.Fatal("a parse-failed Prisma claim must remain active for its loader diagnostic")
	}
}

/**
 * Verifies an unreadable Markdown root cannot become inactive.
 *
 * No files match when the root cannot be opened, but that absence is not a
 * healthy empty population. The claim remains active so the root problem
 * produced by the claim-side loader is reported.
 *
 *  1. Resolve a Markdown claim against a missing root.
 *  2. Apply activation with no materialized inventory.
 *  3. Assert the unreadable claim remains active for diagnosis.
 */
func TestUnreadableMarkdownClaimRootDoesNotBecomeInactive(t *testing.T) {
	root := t.TempDir()
	config := decodeInventoryConfig(t, root, `{"claims":[{
		"type":"markdown",
		"root":"missing-docs",
		"files":["**/*.md"],
		"symbol":"h2",
		"reference":{"type":"prisma","files":["prisma/**/*.prisma"],"symbol":"model"}
	}]}`)
	active := activeGraphConfig(
		config,
		map[string]*artifactInventory{},
		map[string]*artifactInventory{},
		map[string]*artifactInventory{},
	)
	if len(active.Claims) != 1 {
		t.Fatal("an unreadable Markdown root must remain active for its loader diagnostic")
	}
}

/**
 * Verifies selected Markdown and Prisma units activate their claims.
 *
 * The shared activation gate must remove only healthy zero-unit populations.
 * A selected heading or model keeps the complete claim and its references in
 * the graph.
 *
 *  1. Configure one Markdown H2 claim and one Prisma model claim.
 *  2. Materialize one selected own unit for each claim.
 *  3. Assert both claims remain active.
 */
func TestSelectedMarkdownAndPrismaUnitsActivateClaims(t *testing.T) {
	root := t.TempDir()
	config := decodeInventoryConfig(t, root, `{"claims":[
		{
			"type":"markdown",
			"files":["docs/**/*.md"],
			"symbol":"h2",
			"reference":{"type":"prisma","files":["prisma/**/*.prisma"],"symbol":"model"}
		},
		{
			"type":"prisma",
			"files":["prisma/**/*.prisma"],
			"symbol":"model",
			"reference":{"type":"markdown","files":["docs/**/*.md"],"symbol":"h2"}
		}
	]}`)
	markdownAddress := config.Claims[0].Base.addressOf("docs/spec.md")
	prismaAddress := config.Claims[1].Base.addressOf("prisma/schema.prisma")
	active := activeGraphConfig(
		config,
		map[string]*artifactInventory{
			markdownAddress.Key: {
				Address: markdownAddress.Key,
				Path:    markdownAddress.Display,
				Type:    artifactMarkdown,
				Units: []*evidenceUnit{{
					Type:   artifactMarkdown,
					Symbol: "h2",
				}},
			},
		},
		map[string]*artifactInventory{
			prismaAddress.Key: {
				Address: prismaAddress.Key,
				Path:    prismaAddress.Display,
				Type:    artifactPrisma,
				Units: []*evidenceUnit{{
					Type:   artifactPrisma,
					Symbol: "model",
				}},
			},
		},
		map[string]*artifactInventory{},
	)
	if len(active.Claims) != len(config.Claims) {
		t.Fatalf(
			"selected artifact claims were filtered: got %d, want %d",
			len(active.Claims),
			len(config.Claims),
		)
	}
}
