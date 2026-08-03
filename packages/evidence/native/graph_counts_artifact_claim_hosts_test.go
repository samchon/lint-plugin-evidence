package evidence

import (
	"strings"
	"testing"
)

const markdownClaimAcknowledgementPolicyConfig = `{"claims":[{
	"type":"markdown",
	"files":["claims/**"],
	"symbol":"h2",
	"reference":{
		"type":"markdown",
		"files":["docs/spec.md"],
		"symbol":"h2",
		"acknowledgement":{
			"exactEvidenceUnitsPerHost":1,
			"minimumEvidenceHostsPerUnit":2
		}
	}
}]}`

/**
 * Verifies Markdown claim headings retain semantic host identities for policy counts.
 *
 * Markdown declarations already carried a physical outline host, but exact cardinality also needs every selected heading that carries no HTML comment. Exercising the complete project rule proves the scanner's heading unit ID is the same semantic ID used by both policy directions.
 *
 *  1. Select one silent H2 and one positively citing H2 as claim hosts.
 *  2. Assert exact cardinality reports only the silent host and minimum cardinality sees one positive host.
 *  3. Add a second positive heading and assert the same policy passes.
 */
func TestMarkdownClaimHostsParticipateInAcknowledgementPolicyCounts(t *testing.T) {
	messages := runIndexRule(t, map[string]string{
		"claims/positive.md": `## Positive {#positive}

<!-- @evidence docs/spec.md#contract Implements the contract. -->
`,
		"claims/untagged.md": "## Untagged {#untagged}\n",
		"docs/spec.md":       "## Contract {#contract}\n",
	}, markdownClaimAcknowledgementPolicyConfig)
	if count := countProblemsContaining(messages, "acknowledgement.exactEvidenceUnitsPerHost"); count != 1 {
		t.Fatalf("expected only the silent Markdown host to fail exact cardinality, got %d:\n%s", count, strings.Join(messages, "\n"))
	}
	assertProblemContains(t, messages, "Markdown H2 'Untagged'")
	assertProblemContains(t, messages, "cites 0 distinct selected evidence unit(s)")
	assertProblemContains(t, messages, "has 1 distinct positive evidence host(s); acknowledgement.minimumEvidenceHostsPerUnit requires at least 2")
	if strings.Contains(strings.Join(messages, "\n"), "Markdown H2 'Positive'") {
		t.Fatalf("the positive Markdown host failed exact cardinality:\n%s", strings.Join(messages, "\n"))
	}

	passing := runIndexRule(t, map[string]string{
		"claims/first.md": `## First {#first}

<!-- @evidence docs/spec.md#contract First proof. -->
`,
		"claims/second.md": `## Second {#second}

<!-- @evidence docs/spec.md#contract Second proof. -->
`,
		"docs/spec.md": "## Contract {#contract}\n",
	}, markdownClaimAcknowledgementPolicyConfig)
	assertNoProblems(t, passing)
}

const prismaClaimAcknowledgementPolicyConfig = `{"claims":[{
	"type":"prisma",
	"files":["prisma/schema.prisma"],
	"symbol":"model",
	"reference":{
		"type":"markdown",
		"files":["docs/spec.md"],
		"symbol":"h2",
		"acknowledgement":{
			"exactEvidenceUnitsPerHost":1,
			"minimumEvidenceHostsPerUnit":2
		}
	}
}]}`

/**
 * Verifies Prisma claim models retain semantic host identities for policy counts.
 *
 * Prisma units come from the native parser bridge while their comments and locations come from a separate scanner. A model with no documentation must still enter exact cardinality as zero, and a parsed `///` citation must map back to the same model identity for both host and unit counts.
 *
 *  1. Parse one silent model and one positively citing model through the real bridge and project rule.
 *  2. Assert exact cardinality reports only the silent model and minimum cardinality sees one positive model.
 *  3. Give two distinct models positive evidence and assert the same policy passes.
 */
func TestPrismaClaimHostsParticipateInAcknowledgementPolicyCounts(t *testing.T) {
	run := func(schema string) []string {
		root := prismaBridgeRoot(t, nil)
		return runIndexRuleAtRoot(t, root, map[string]string{
			"docs/spec.md":         "## Contract {#contract}\n",
			"prisma/schema.prisma": schema,
		}, prismaClaimAcknowledgementPolicyConfig)
	}
	messages := run(`datasource db {
  provider = "sqlite"
}

model Untagged {
  id Int @id
}

/// @evidence docs/spec.md#contract Implements the contract.
model Positive {
  id Int @id
}
`)
	if count := countProblemsContaining(messages, "acknowledgement.exactEvidenceUnitsPerHost"); count != 1 {
		t.Fatalf("expected only the silent Prisma host to fail exact cardinality, got %d:\n%s", count, strings.Join(messages, "\n"))
	}
	assertProblemContains(t, messages, "Prisma model 'Untagged'")
	assertProblemContains(t, messages, "cites 0 distinct selected evidence unit(s)")
	assertProblemContains(t, messages, "has 1 distinct positive evidence host(s); acknowledgement.minimumEvidenceHostsPerUnit requires at least 2")
	if strings.Contains(strings.Join(messages, "\n"), "Prisma model 'Positive'") {
		t.Fatalf("the positive Prisma host failed exact cardinality:\n%s", strings.Join(messages, "\n"))
	}

	passing := run(`datasource db {
  provider = "sqlite"
}

/// @evidence docs/spec.md#contract First proof.
model First {
  id Int @id
}

/// @evidence docs/spec.md#contract Second proof.
model Second {
  id Int @id
}
`)
	assertNoProblems(t, passing)
}
