package evidence

import (
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

// prismaLocation is where one declared name is written.
type prismaLocation struct {
	Path string
	Line int
}

// prismaBlockKeywords are the top-level block openers Prisma's grammar accepts.
//
// All six are recognized even though only `model`, `view`, and `type` can own a
// unit, because recognizing a block is how the scan knows when it is *not*
// inside one. Dropping `datasource` and `generator` would leave their settings
// looking like members of whatever block was declared before them.
var prismaBlockKeywords = map[string]bool{
	"model":      true,
	"view":       true,
	"type":       true,
	"enum":       true,
	"datasource": true,
	"generator":  true,
}

// prismaMemberBlocks are the blocks whose members this graph addresses.
var prismaMemberBlocks = map[string]bool{
	"model": true,
	"view":  true,
	"type":  true,
}

// locatePrismaDeclarations finds the line each declared name is written on.
//
// This is a locator, not a parser. The names it answers for come from Prisma's
// own parser, which returns no positions at all, so the only question asked
// here is *where* — never *what*. A name it fails to find loses a precise line
// and nothing else, which is what makes a native scan safe on a grammar this
// rule does not own.
//
// Two clauses of that grammar do the work
// (`prisma/prisma-engines`, `psl/schema-ast/src/parser/datamodel.pest`):
// `field_declaration` terminates at `NEWLINE`, and a block opener is likewise
// its own line. Measured against the real parser, a field whose attribute
// arguments span two lines and a single-line `model X { ... }` are both hard
// errors — so "one declaration, one line" is Prisma's rule, inherited rather
// than approximated.
//
// The first spelling of a name wins. A duplicate name across the set is a
// schema Prisma itself rejects, so this scan never has to arbitrate one.
func locatePrismaDeclarations(
	root string,
	sources []string,
) map[string]prismaLocation {
	locations := map[string]prismaLocation{}
	for _, source := range sources {
		content, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(source)))
		if err != nil {
			continue
		}
		scanPrismaLocations(source, string(content), locations)
	}
	return locations
}

func scanPrismaLocations(
	source string,
	content string,
	locations map[string]prismaLocation,
) {
	record := func(key string, line int) {
		if key == "" {
			return
		}
		if _, exists := locations[key]; exists {
			return
		}
		locations[key] = prismaLocation{Path: source, Line: line}
	}
	depth := 0
	block := ""
	commented := false
	for index, raw := range strings.Split(content, "\n") {
		line := strings.TrimSuffix(raw, "\r")
		code, stillCommented := prismaCodeOf(line, commented)
		commented = stillCommented
		trimmed := strings.TrimSpace(code)
		opens := strings.Count(code, "{")
		closes := strings.Count(code, "}")
		switch {
		case depth == 0 && opens != 0:
			keyword, name, ok := prismaBlockHead(trimmed)
			block = ""
			if ok && prismaMemberBlocks[keyword] {
				block = name
				record(name, index+1)
			}
		case depth == 1 && block != "" && trimmed != "":
			if name, ok := prismaMemberName(trimmed); ok {
				record(block+"."+name, index+1)
			}
		}
		depth += opens - closes
		if depth <= 0 {
			depth = 0
			block = ""
		}
	}
}

// prismaCodeOf blanks out everything on a line that is not code.
//
// String contents are dropped rather than kept, because a brace inside one must
// not open or close a block — `@default("}")` is a legal field that a naive
// brace count reads as the end of its model. Comment text is dropped for the
// same reason, and a block comment's state is returned so it can span lines.
func prismaCodeOf(line string, commented bool) (string, bool) {
	var code strings.Builder
	runes := []rune(line)
	quoted := false
	for index := 0; index < len(runes); index++ {
		char := runes[index]
		if commented {
			if char == '*' && index+1 < len(runes) && runes[index+1] == '/' {
				commented = false
				index++
			}
			continue
		}
		if quoted {
			if char == '\\' {
				index++
				continue
			}
			if char == '"' {
				quoted = false
			}
			continue
		}
		if char == '"' {
			quoted = true
			continue
		}
		if char == '/' && index+1 < len(runes) {
			if runes[index+1] == '/' {
				break
			}
			if runes[index+1] == '*' {
				commented = true
				index++
				continue
			}
		}
		code.WriteRune(char)
	}
	return code.String(), commented
}

// prismaBlockHead reads `model <Name>` from a block opener.
func prismaBlockHead(trimmed string) (string, string, bool) {
	fields := strings.Fields(trimmed)
	if len(fields) < 2 {
		return "", "", false
	}
	if !prismaBlockKeywords[fields[0]] {
		return "", "", false
	}
	name := strings.TrimSuffix(fields[1], "{")
	if !isPrismaIdentifier(name) {
		return "", "", false
	}
	return fields[0], name, true
}

// prismaMemberName reads the field name a member line opens with.
//
// A line opening with `@` is a block attribute such as `@@index([a, b])` rather
// than a field, and a line opening with `}` closes the block. Neither declares
// a member, and both would otherwise be read as one named `@@index` or `}`.
func prismaMemberName(trimmed string) (string, bool) {
	if strings.HasPrefix(trimmed, "@") || strings.HasPrefix(trimmed, "}") {
		return "", false
	}
	fields := strings.Fields(trimmed)
	if len(fields) == 0 {
		return "", false
	}
	if !isPrismaIdentifier(fields[0]) {
		return "", false
	}
	return fields[0], true
}

// isPrismaIdentifier mirrors the grammar's `identifier` rule: unicode
// alphanumeric, then unicode alphanumeric or `_` or `-`. No dot can appear in
// one, which is what lets a member address join on a dot without ambiguity.
func isPrismaIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for index, char := range value {
		switch {
		case unicode.IsLetter(char), unicode.IsDigit(char):
			continue
		case index != 0 && (char == '_' || char == '-'):
			continue
		default:
			return false
		}
	}
	return true
}
