package evidence

import (
	"encoding/json"
	"strings"
	"testing"
)

/**
 * Verifies acknowledgement policy defaults preserve the original reference contract.
 *
 * The policy strengthens a single reference only when one of its fields is set. Omission and an explicit empty object therefore need the same zero-value native model, or merely adding the public property would change every existing graph.
 *
 *  1. Decode one omitted policy and one empty policy.
 *  2. Inspect both native reference models.
 *  3. Assert every policy field retains its behavior-preserving zero value.
 */
func TestAcknowledgementPolicyDefaultsPreserveReferenceBehavior(t *testing.T) {
	config, problems := decodeGraphConfig(json.RawMessage(`{"claims":[{
		"type":"typescript",
		"files":["src/**"],
		"reference":[
			{"type":"markdown","files":["docs/a.md"]},
			{"type":"markdown","files":["docs/b.md"],"acknowledgement":{}},
			{"type":"markdown","files":["docs/c.md"],"acknowledgement":{"forbidEvidenceExclude":false}}
		]
	}]}`))
	if len(problems) != 0 {
		t.Fatalf("unexpected decode diagnostics: %v", problems)
	}
	for index, reference := range config.Claims[0].References {
		policy := reference.Acknowledgement
		if policy.ForbidEvidenceExclude ||
			policy.ExactEvidenceUnitsPerHost != 0 ||
			policy.MinimumEvidenceHostsPerUnit != 0 {
			t.Fatalf("reference %d did not preserve zero-value behavior: %+v", index, policy)
		}
	}
}

/**
 * Verifies every reference kind accepts the same reference-local policy.
 *
 * The policy belongs to the acknowledgement relation rather than to an artifact loader. Decoding it in only the Swagger path would leave identical configuration fields silently unavailable on Markdown, Prisma, or TypeScript references.
 *
 *  1. Configure all four reference kinds with the complete policy.
 *  2. Decode the graph through the shared reference boundary.
 *  3. Assert each reference retains the three exact values.
 */
func TestAcknowledgementPolicyAppliesToEveryReferenceKind(t *testing.T) {
	policy := `"acknowledgement":{
		"forbidEvidenceExclude":true,
		"exactEvidenceUnitsPerHost":1,
		"minimumEvidenceHostsPerUnit":2
	}`
	config, problems := decodeGraphConfig(json.RawMessage(`{"claims":[{
		"type":"typescript",
		"files":["src/**"],
		"reference":[
			{"type":"markdown","files":["docs/**"],` + policy + `},
			{"type":"prisma","files":["prisma/**"],` + policy + `},
			{"type":"swagger","file":"openapi.json",` + policy + `},
			{"type":"typescript","files":["contracts/**"],` + policy + `}
		]
	}]}`))
	if len(problems) != 0 {
		t.Fatalf("unexpected decode diagnostics: %v", problems)
	}
	if len(config.Claims[0].References) != 4 {
		t.Fatalf("expected four references, got %d", len(config.Claims[0].References))
	}
	for index, reference := range config.Claims[0].References {
		policy := reference.Acknowledgement
		if !policy.ForbidEvidenceExclude ||
			policy.ExactEvidenceUnitsPerHost != 1 ||
			policy.MinimumEvidenceHostsPerUnit != 2 {
			t.Fatalf("reference %d lost its policy: %+v", index, policy)
		}
	}
}

/**
 * Verifies acknowledgement policy rejects every non-contract runtime shape.
 *
 * TypeScript catches most malformed literals, but JavaScript and unchecked generated config reach the native decoder directly. Nulls are especially dangerous because Go's JSON decoder otherwise turns them into zero values that look exactly like an omitted field.
 *
 *  1. Supply invalid objects, booleans, cardinalities, and an unknown nested key.
 *  2. Decode each through a disabled claim as well as an enabled one.
 *  3. Assert the complete public option path names every rejection.
 */
func TestAcknowledgementPolicyRejectsMalformedRuntimeShapes(t *testing.T) {
	type invalidPolicy struct {
		name  string
		value string
		path  string
	}
	cases := []invalidPolicy{
		{name: "null policy", value: `null`, path: "acknowledgement: expected an object"},
		{name: "array policy", value: `[]`, path: "acknowledgement: expected an object"},
		{name: "boolean policy", value: `true`, path: "acknowledgement: expected an object"},
		{name: "number policy", value: `1`, path: "acknowledgement: expected an object"},
		{name: "string policy", value: `"strict"`, path: "acknowledgement: expected an object"},
		{name: "unknown nested", value: `{"minimumHosts":2}`, path: "acknowledgement.minimumHosts: unknown property"},
	}
	invalidBooleans := []struct {
		name  string
		value string
	}{
		{name: "number", value: "1"},
		{name: "string", value: `"true"`},
		{name: "array", value: `[]`},
		{name: "object", value: `{}`},
		{name: "null", value: `null`},
	}
	for _, invalid := range invalidBooleans {
		cases = append(cases, invalidPolicy{
			name:  invalid.name + " forbid",
			value: `{"forbidEvidenceExclude":` + invalid.value + `}`,
			path:  "acknowledgement.forbidEvidenceExclude: expected a boolean",
		})
	}
	invalidCardinalities := []struct {
		name  string
		value string
	}{
		{name: "zero", value: "0"},
		{name: "negative", value: "-1"},
		{name: "fractional", value: "1.5"},
		{name: "string", value: `"1"`},
		{name: "boolean", value: "true"},
		{name: "array", value: `[]`},
		{name: "object", value: `{}`},
		{name: "null", value: `null`},
	}
	for _, property := range []string{
		"exactEvidenceUnitsPerHost",
		"minimumEvidenceHostsPerUnit",
	} {
		for _, invalid := range invalidCardinalities {
			cases = append(cases, invalidPolicy{
				name:  invalid.name + " " + property,
				value: `{"` + property + `":` + invalid.value + `}`,
				path:  "acknowledgement." + property + ": expected a positive integer",
			})
		}
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			for _, disabled := range []string{"false", "true"} {
				_, problems := decodeGraphConfig(json.RawMessage(`{"claims":[{
					"type":"typescript",
					"disabled":` + disabled + `,
					"files":["src/**"],
					"reference":{
						"type":"markdown",
						"files":["docs/**"],
						"acknowledgement":` + test.value + `
					}
				}]}`))
				if !strings.Contains(strings.Join(problems, "\n"), test.path) {
					t.Fatalf("disabled=%s did not reject %s at %q: %v", disabled, test.name, test.path, problems)
				}
			}
		})
	}
}

/**
 * Verifies acknowledgement policy remains exclusive to a reference object.
 *
 * A claim-level policy would silently pool constraints across independent references and make a permitted Markdown exclusion inherit a strict Swagger operation policy. The ordinary unknown-field diagnostic must keep that escape route closed.
 *
 *  1. Put a valid-looking policy beside the claim selectors.
 *  2. Decode the graph.
 *  3. Assert the claim path reports an unknown property.
 */
func TestAcknowledgementPolicyIsRejectedAtClaimLevel(t *testing.T) {
	_, problems := decodeGraphConfig(json.RawMessage(`{"claims":[{
		"type":"typescript",
		"files":["src/**"],
		"acknowledgement":{"forbidEvidenceExclude":true},
		"reference":{"type":"markdown","files":["docs/**"]}
	}]}`))
	assertProblemContains(t, problems, "claims[0].acknowledgement: unknown property")
}
