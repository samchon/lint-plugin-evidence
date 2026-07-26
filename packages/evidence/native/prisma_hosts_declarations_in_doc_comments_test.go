package evidence

import (
	"sort"
	"strings"
	"testing"
)

// prismaClaimOf scans one schema, materializes the models it names, and returns
// the declarations and problems a claim over it would see.
//
// The models are supplied rather than parsed, because this is the native half:
// what a schema declares is Prisma's answer, and what a comment cites is this
// scan's. Supplying the population keeps a case about attribution.
func prismaClaimOf(
	content string,
	models []prismaModel,
) ([]*evidenceDeclaration, []string) {
	inventories := map[string]*artifactInventory{
		"prisma/schema.prisma": {
			Path: "prisma/schema.prisma",
			Type: artifactPrisma,
		},
	}
	locations := map[string]prismaLocation{}
	scan := scanPrismaFile("prisma/schema.prisma", content, locations)
	hosts := map[string]*evidenceUnit{}
	for _, model := range models {
		for _, unit := range prismaModelUnits(model) {
			key := joinPrismaIdentity(unit.Identity)
			unit.Path = "prisma/schema.prisma"
			unit.Line = locations[key].Line
			hosts[key] = unit
		}
	}
	problems := prismaDeclarationsFromComments(scan.Comments, hosts, inventories)
	declarations := inventories["prisma/schema.prisma"].Declarations
	sort.SliceStable(declarations, func(left int, right int) bool {
		return declarations[left].Line < declarations[right].Line
	})
	return declarations, problems
}

func prismaDeclarationIndex(declarations []*evidenceDeclaration) string {
	rendered := make([]string, 0, len(declarations))
	for _, declaration := range declarations {
		rendered = append(
			rendered,
			string(declaration.Tag)+"@"+decimal(declaration.Line)+
				" host="+declaration.Hosts.names()+
				" target="+declaration.Target+
				" reason="+declaration.Reason,
		)
	}
	return strings.Join(rendered, "\n")
}

var prismaClaimModels = []prismaModel{{
	Name: "Sale",
	Fields: []prismaField{
		{Name: "price", Symbol: "column"},
		{Name: "seller", Symbol: "relation"},
	},
}}

/**
 * Verifies a `///` comment hosts a citation for the model, column, or relation
 * it documents.
 *
 * This is the direction that makes a schema answerable: a table that cites
 * nothing has no proof it was needed. The host kind has to come from the parsed
 * population rather than from the text, because a claim's `symbol` selector
 * decides which declarations are in scope, and a relation field read as a
 * column would be judged against the wrong selector.
 *
 *  1. Document a model, a stored column, and a relation field.
 *  2. Assert one declaration per comment, at the line it was written on.
 *  3. Assert each carries the host kind the population says it is.
 */
func TestPrismaDocCommentHostsACitation(t *testing.T) {
	declarations, problems := prismaClaimOf(`/// A sale.
/// @evidence docs/spec.md#pricing The sale concept comes from here.
model Sale {
  /// @evidence docs/spec.md#amounts The amount is stored here.
  price Int

  /// @evidenceExclude docs/spec.md#sellers Ownership is out of scope for now.
  seller Seller
}
`, prismaClaimModels)
	if len(problems) != 0 {
		t.Fatalf("a well-placed citation reports nothing: %v", problems)
	}
	want := strings.Join([]string{
		"evidence@2 host=model target=docs/spec.md#pricing reason=The sale concept comes from here.",
		"evidence@4 host=column target=docs/spec.md#amounts reason=The amount is stored here.",
		"evidenceExclude@7 host=relation target=docs/spec.md#sellers reason=Ownership is out of scope for now.",
	}, "\n")
	if got := prismaDeclarationIndex(declarations); got != want {
		t.Fatalf("declarations:\n%s\nwant:\n%s", got, want)
	}
}

/**
 * Verifies another tool's tag ends a citation instead of being swallowed into
 * its reason.
 *
 * A Prisma doc comment is shared ground: `prisma-markdown` reads `@namespace`
 * and `@erd`, and the prior art this product generalizes writes `@stance` and
 * `@hidden` beside its citations. Without a tag boundary the first of those
 * becomes part of the reason above it, so the reason a reviewer reads is not
 * the reason the author wrote — and nothing anywhere reports it.
 *
 *  1. Write a citation followed by two unrelated tags.
 *  2. Assert the reason stops at the first of them.
 */
func TestPrismaCitationStopsAtAnotherTag(t *testing.T) {
	declarations, problems := prismaClaimOf(`/// A sale.
/// @evidence docs/spec.md#pricing The sale price derives from this section.
/// @stance material
/// @hidden
model Sale {
  price Int
  seller Seller
}
`, prismaClaimModels)
	if len(problems) != 0 {
		t.Fatalf("unrelated tags are not this rule's business: %v", problems)
	}
	if len(declarations) != 1 {
		t.Fatalf("expected one citation, got %d", len(declarations))
	}
	if declarations[0].Reason != "The sale price derives from this section." {
		t.Fatalf("reason swallowed a neighbouring tag: %q", declarations[0].Reason)
	}
}

/**
 * Verifies a citation reaches its declaration across an intervening plain
 * comment, and that two doc runs around one are a single comment block.
 *
 * Measured against the real parser: `/// first`, `// plain`, `/// second` above
 * a model produces the documentation `"first\nsecond"`. Treating the plain line
 * as a break would leave the first citation documenting nothing and reported as
 * misplaced, on a schema Prisma reads exactly as the author intended.
 *
 *  1. Separate two citations with a plain comment.
 *  2. Assert both host on the model, each at its own line.
 */
func TestPrismaPlainCommentDoesNotBreakADocRun(t *testing.T) {
	declarations, problems := prismaClaimOf(`/// @evidence docs/spec.md#a First ground.
// an ordinary note
/// @evidence docs/spec.md#b Second ground.
model Sale {
  price Int
  seller Seller
}
`, prismaClaimModels)
	if len(problems) != 0 {
		t.Fatalf("a plain comment without a tag is not a problem: %v", problems)
	}
	want := strings.Join([]string{
		"evidence@1 host=model target=docs/spec.md#a reason=First ground.",
		"evidence@3 host=model target=docs/spec.md#b reason=Second ground.",
	}, "\n")
	if got := prismaDeclarationIndex(declarations); got != want {
		t.Fatalf("declarations:\n%s\nwant:\n%s", got, want)
	}
}

/**
 * Verifies a citation Prisma would discard is reported rather than ignored.
 *
 * Each placement below fails differently and all three fail quietly. A `//`
 * comment is dropped by Prisma outright. A block comment is the treacherous one
 * — Prisma keeps its text as documentation, so a citation there looks honoured
 * in the parsed output while this rule never reads it. And a `///` run detached
 * by a blank line at top level documents nothing at all, which is measured
 * behaviour that does not hold one level down inside a block.
 *
 * A tag that silently does nothing is the exact failure this product exists to
 * remove, so each names the move that fixes it.
 *
 *  1. Write one citation in each unusable position.
 *  2. Assert three problems and no declarations.
 *  3. Assert each names its own repair.
 */
func TestPrismaReportsACitationPrismaWouldDiscard(t *testing.T) {
	declarations, problems := prismaClaimOf(`// @evidence docs/spec.md#a Written in a line comment.
/* @evidence docs/spec.md#b Written in a block comment. */

/// @evidence docs/spec.md#c Detached by a blank line.

model Sale {
  price Int
  seller Seller
}
`, prismaClaimModels)
	if len(declarations) != 0 {
		t.Fatalf("an unusable placement hosts nothing: %s", prismaDeclarationIndex(declarations))
	}
	if len(problems) != 3 {
		t.Fatalf("expected one problem per placement, got %d:\n%s", len(problems), strings.Join(problems, "\n"))
	}
	joined := strings.Join(problems, "\n")
	for _, expected := range []string{
		"prisma/schema.prisma:1",
		"'//' line comment",
		"prisma/schema.prisma:2",
		"'/* */' block comment",
		"prisma/schema.prisma:4",
		"documents no declaration",
	} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("problems must contain %q:\n%s", expected, joined)
		}
	}
}

/**
 * Verifies a comment that documents nothing inside a block is reported too.
 *
 * A run stopping at a block attribute or at the closing brace documents nothing
 * — measured, and a different rule from the blank-line one above. Both leave a
 * citation that reads as if it works.
 *
 *  1. Cite above a block attribute and again above the closing brace.
 *  2. Assert both are reported and neither becomes a declaration.
 */
func TestPrismaReportsACitationDocumentingNothingInsideABlock(t *testing.T) {
	declarations, problems := prismaClaimOf(`model Sale {
  price Int
  seller Seller

  /// @evidence docs/spec.md#a Written above a block attribute.
  @@index([price])

  /// @evidence docs/spec.md#b Written above the closing brace.
}
`, prismaClaimModels)
	if len(declarations) != 0 {
		t.Fatalf("neither position hosts a citation: %s", prismaDeclarationIndex(declarations))
	}
	if len(problems) != 2 {
		t.Fatalf("expected two problems, got %d:\n%s", len(problems), strings.Join(problems, "\n"))
	}
}

/**
 * Verifies a blank line inside a block does not detach a citation.
 *
 * The negative twin of the detached-run case, and the reason both are measured
 * rather than reasoned about: Prisma attaches a field's doc comment across a
 * blank line even though it will not attach a top-level one. Reporting this as
 * misplaced would reject a citation the schema itself honours.
 *
 *  1. Separate a column's citation from the column by a blank line.
 *  2. Assert it still hosts on that column.
 */
func TestPrismaBlankLineInsideABlockKeepsTheCitation(t *testing.T) {
	declarations, problems := prismaClaimOf(`model Sale {
  /// @evidence docs/spec.md#amounts The amount is stored here.

  price Int
  seller Seller
}
`, prismaClaimModels)
	if len(problems) != 0 {
		t.Fatalf("Prisma attaches this comment, so this rule must too: %v", problems)
	}
	want := "evidence@2 host=column target=docs/spec.md#amounts reason=The amount is stored here."
	if got := prismaDeclarationIndex(declarations); got != want {
		t.Fatalf("declarations:\n%s\nwant:\n%s", got, want)
	}
}

/**
 * Verifies a citation on a declaration this graph does not address is reported.
 *
 * An enum, a view, a composite type, and a datasource setting are all legal
 * places to write a `///` comment and none of them materializes a unit here.
 * Dropping such a citation would leave an author believing a table's grounds
 * were recorded when nothing reads them; naming the addressable kinds is what
 * makes the repair obvious.
 *
 *  1. Cite from an enum and from a datasource setting.
 *  2. Assert both are reported and neither becomes a declaration.
 */
func TestPrismaReportsACitationOnAnUnaddressableDeclaration(t *testing.T) {
	declarations, problems := prismaClaimOf(`/// @evidence docs/spec.md#status The status set comes from here.
enum SaleStatus {
  ACTIVE
}

model Sale {
  price Int
  seller Seller
}
`, prismaClaimModels)
	if len(declarations) != 0 {
		t.Fatalf("an enum hosts nothing: %s", prismaDeclarationIndex(declarations))
	}
	if len(problems) != 1 {
		t.Fatalf("expected one problem, got %d:\n%s", len(problems), strings.Join(problems, "\n"))
	}
	if !strings.Contains(problems[0], "not a model, column, or relation") {
		t.Fatalf("the problem must name the addressable kinds: %q", problems[0])
	}
}

/**
 * Verifies an ordinary comment without a citation is never reported.
 *
 * The negative twin of the discarded-citation cases. A schema is full of
 * ordinary prose in every comment form, and a rule that reported it would be
 * turned off within a day — taking the citations it does catch with it.
 *
 *  1. Write prose in all three comment forms, in placements that document
 *     nothing.
 *  2. Assert nothing is reported.
 */
func TestPrismaOrdinaryCommentsAreNotReported(t *testing.T) {
	declarations, problems := prismaClaimOf(`// an ordinary note
/* a block note */

/// detached prose

model Sale {
  price Int

  /// documented, not cited
  seller Seller

  /// prose above the closing brace
}
`, prismaClaimModels)
	if len(problems) != 0 {
		t.Fatalf("prose is not a citation: %v", problems)
	}
	if len(declarations) != 0 {
		t.Fatalf("prose declares nothing: %s", prismaDeclarationIndex(declarations))
	}
}
