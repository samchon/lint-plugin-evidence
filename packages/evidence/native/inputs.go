package evidence

import (
	"net/url"
	"strings"

	"github.com/samchon/ttsc/packages/lint/rule"
)

// ProjectInputs declares the files this rule reads from outside the Program.
//
// Markdown and Swagger evidence never enters the TypeScript Program, so until
// `@ttsc/lint@0.22.0` shipped this contract the host had no way to learn that
// the graph depended on them. The resulting asymmetry was invisible rather than
// merely inconvenient: a developer editing code saw fresh diagnostics, because
// the TypeScript event drove a cycle that reloaded the documents along with it,
// while a developer editing only a spec section saw the citation that had just
// gone stale keep reporting green.
//
// The host calls this after resolving options and project identity but before
// loading a Program, so nothing here may read `ctx.Sources`, and nothing here
// may touch the filesystem — this declares configured topology rather than the
// files a successful load happened to reach.
func (graphRule) ProjectInputs(ctx *rule.ProjectInputContext) []rule.ProjectInput {
	if ctx == nil {
		return nil
	}
	// Configuration problems belong to Check, which has a reporter and a source
	// position to name. Declaring the inputs of whichever claims did decode is
	// strictly better than declaring none: a graph the author is midway through
	// repairing is exactly when the editor must keep watching the sources.
	config, _ := decodeGraphConfig(ctx.Options)
	return graphProjectInputs(config)
}

// graphProjectInputs collects the external dependency of every configured
// obligation.
//
// TypeScript claims and references are absent by design. Their inventories are
// materialized from `ctx.Sources`, which is the Program the host already
// watches, so declaring them again would ask for a second watcher on a file
// that already has one.
func graphProjectInputs(config graphConfig) []rule.ProjectInput {
	inputs := []rule.ProjectInput{}
	for _, claim := range config.Claims {
		if claim.Type == artifactMarkdown {
			inputs = append(inputs, markdownGlobInputs(claim.Files)...)
		}
		for _, reference := range claim.References {
			switch reference.Type {
			case artifactMarkdown:
				inputs = append(inputs, markdownGlobInputs(reference.Files)...)
			case artifactSwagger:
				inputs = append(inputs, localSwaggerInputs(reference.Source)...)
			}
		}
	}
	return inputs
}

// markdownGlobInputs publishes the positive half of one Markdown glob set.
//
// Exclusions are dropped rather than translated, because the host's dependency
// model has no negation — declaring `!docs/private/**` as a glob would watch
// precisely the documents this graph refuses to read. What is left over-selects
// slightly, and that is the safe direction: a spurious rebuild costs one cycle,
// while a missing one leaves a stale citation reporting green, which is the
// whole failure this contract exists to remove.
//
// The declared pattern is the compiled segment form rather than `Raw`, so the
// host receives a project-relative pattern with the exclusion marker already
// stripped, `\` already normalized to `/`, and a leading `./` already gone.
func markdownGlobInputs(globs globSet) []rule.ProjectInput {
	inputs := make([]rule.ProjectInput, 0, len(globs.Patterns))
	for _, pattern := range globs.Patterns {
		if pattern.Exclude {
			continue
		}
		inputs = append(inputs, rule.ProjectInput{
			Kind:    rule.ProjectInputGlob,
			Pattern: strings.Join(pattern.Segments, "/"),
		})
	}
	return inputs
}

// localSwaggerInputs publishes a Swagger reference only when it names a file.
//
// Withholding the URL form is not a shortcut. The host rejects a remote pattern
// outright (`linthost/project_inputs.go:159-161`), and one rejected input
// discards the whole snapshot for every project rule in the run
// (`linthost/project_inputs.go:113-135`) — so declaring a URL here would take
// this graph's Markdown globs down with it and restore the exact blindness the
// contract removes.
//
// The boundary is also real rather than imposed: a URL has no filesystem event
// to observe, so its freshness is per-evaluation and belongs to the loader.
func localSwaggerInputs(source string) []rule.ProjectInput {
	if source == "" || isRemoteSwaggerSource(source) {
		return nil
	}
	return []rule.ProjectInput{{
		Kind:    rule.ProjectInputFile,
		Pattern: source,
	}}
}

// isRemoteSwaggerSource reports whether a normalized Swagger source names a URL
// rather than a project-relative file.
//
// The scheme is read through `url.Parse` rather than matched as a prefix
// because `normalizeSwaggerSource` stores the author's spelling, and a scheme
// is case-insensitive — `HTTPS://host/s.json` is accepted there and would slip
// past a literal `https://` comparison.
func isRemoteSwaggerSource(source string) bool {
	parsed, err := url.Parse(source)
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https")
}
