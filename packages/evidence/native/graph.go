package evidence

import (
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/samchon/ttsc/packages/lint/rule"
)

type graphRule struct{}

func (graphRule) Name() string { return graphRuleName }

func (graphRule) NeedsTypeChecker() bool { return false }

func (graphRule) Check(ctx *rule.ProjectContext) {
	if ctx == nil {
		return
	}
	cycle := &graphCycleState{}
	// SetState survives a later project finding and belongs only to this
	// Program cycle. File rules can therefore coordinate diagnostics even when
	// the graph itself fails, while Hints remains protected by the host's
	// passed-only publication gate.
	ctx.SetState(cycle)
	config, problems := decodeGraphConfig(ctx.Options)
	if len(problems) != 0 {
		reportProblems(ctx, problems)
		return
	}
	root := evidenceProjectRoot(ctx.Identity)
	if root == "" {
		ctx.Report("Evidence graph could not resolve the project root. Run ttsc with a project config or explicit project root so project-relative evidence globs have one stable base.")
		return
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		ctx.Report("Evidence graph project root '" + root + "' is not a readable directory. Fix the ttsc project identity before evaluating evidence globs.")
		return
	}
	// Every population is anchored before anything is read, so a loader, a
	// diagnostic, and the corpus the editor receives all speak of one resolved
	// base rather than each re-deriving it from the author's spelling.
	resolveGraphBases(root, &config)

	// A TypeScript claim with matched files but no selected public host has
	// nothing that can own an acknowledgement. Materialize only those own
	// populations first, so an inactive claim cannot make its reference
	// loaders perform work or report diagnostics.
	typescript := loadTypeScriptInventories(
		root,
		ctx.Sources,
		typeScriptClaimPopulationConfig(config),
	)
	config = activeGraphConfig(config, typescript)
	extendTypeScriptInventories(root, ctx.Sources, config, typescript)
	markdown, markdownProblems := loadMarkdownInventories(root, config)
	prisma, prismaProblems := loadPrismaInventories(root, config)
	swagger, swaggerProblems := loadSwaggerInventories(root, config)
	problems = append(problems, markdownProblems...)
	problems = append(problems, prismaProblems...)
	problems = append(problems, swaggerProblems...)
	loader := newTypeScriptLoader(root, typescript)
	states, stateProblems := materializeClaimStates(
		config,
		markdown,
		prisma,
		swagger,
		typescript,
		loader,
	)
	problems = append(problems, stateProblems...)
	problems = append(problems, evaluateEvidenceGraph(states, loader)...)
	reportProblems(ctx, problems)
	if len(problems) == 0 {
		// Published only on a clean evaluation, because the host reads state
		// from a rule that passed and reporting anything marks this one failed
		// (`linthost/hints.go:147-149`, `linthost/project_engine.go:68-77`).
		// Setting it unconditionally would not widen the gate; it would only
		// hide where the gate is.
		cycle.Corpus = graphCorpus{
			Config:   config,
			Markdown: markdown,
			Prisma:   prisma,
			Swagger:  swagger,
		}
	}
}

func init() {
	rule.RegisterProject(graphRule{})
}

func evidenceProjectRoot(identity rule.ProjectIdentity) string {
	for _, candidate := range []string{
		identity.PhysicalProjectRoot,
		identity.LogicalProjectRoot,
		identity.ExplicitProjectRoot,
		identity.InvocationCwd,
	} {
		if candidate == "" {
			continue
		}
		absolute, err := filepath.Abs(candidate)
		if err == nil {
			return filepath.Clean(absolute)
		}
	}
	return ""
}

// typeScriptClaimPopulationConfig removes every reference and non-TypeScript
// claim from the loader input used to decide activation.
//
// This is a loading boundary, not merely an evaluation filter: a claim cannot
// become inactive because a failed reference was inspected before the claim's
// own selected host population was known.
func typeScriptClaimPopulationConfig(config graphConfig) graphConfig {
	claims := make([]claimSpec, 0, len(config.Claims))
	for _, claim := range config.Claims {
		if claim.Type != artifactTypeScript {
			continue
		}
		claim.References = nil
		claims = append(claims, claim)
	}
	return graphConfig{Claims: claims}
}

// activeGraphConfig omits only healthy TypeScript claims whose matched own
// population contains no exported unit selected by the claim's symbol set.
//
// Zero matched files stays active so a misspelled glob remains an error.
// Unhealthy populations stay active because failed input cannot prove the
// selected population is empty. Other artifact kinds retain their existing
// activation and evaluation semantics.
func activeGraphConfig(
	config graphConfig,
	typescript map[string]*artifactInventory,
) graphConfig {
	active := make([]claimSpec, 0, len(config.Claims))
	for _, claim := range config.Claims {
		if claim.Type == artifactTypeScript &&
			typeScriptClaimIsInactive(claim, typescript) {
			continue
		}
		active = append(active, claim)
	}
	config.Claims = active
	return config
}

func typeScriptClaimIsInactive(
	claim claimSpec,
	inventories map[string]*artifactInventory,
) bool {
	paths := matchingInventoryPaths(inventories, claim.Base, claim.Files)
	if len(paths) == 0 ||
		!populationIsHealthy(inventories, claim.Base, paths) {
		return false
	}
	for _, path := range paths {
		for _, unit := range inventories[path].Units {
			if claim.Symbols.contains(unit.Symbol) {
				return false
			}
		}
	}
	return true
}

func materializeClaimStates(
	config graphConfig,
	markdown map[string]*artifactInventory,
	prisma map[string]*artifactInventory,
	swagger map[string]*artifactInventory,
	typescript map[string]*artifactInventory,
	loader *typeScriptLoader,
) ([]claimState, []string) {
	states := make([]claimState, 0, len(config.Claims))
	problems := []string{}
	for _, claim := range config.Claims {
		inventories := inventoriesOf(claim.Type, markdown, prisma, swagger, typescript)
		paths := matchingInventoryPaths(inventories, claim.Base, claim.Files)
		state := claimState{
			Spec:    claim,
			Paths:   paths,
			Healthy: populationIsHealthy(inventories, claim.Base, paths),
		}
		if len(paths) == 0 && state.Healthy {
			problems = append(
				problems,
				claimLabel(claim)+" matched no "+string(claim.Type)+" files for "+describePopulation(claim.Base, claim.Files)+". Fix the globs or the root they resolve against; '*' stays within one segment, '**' crosses segments, and a bare directory is not recursive.",
			)
		}
		for _, path := range paths {
			state.Declarations = append(
				state.Declarations,
				inventories[path].Declarations...,
			)
		}
		for _, reference := range claim.References {
			referenceInventories := inventoriesOf(
				reference.Type,
				markdown,
				prisma,
				swagger,
				typescript,
			)
			if reference.Type == artifactTypeScript && reference.entrySelected() {
				entryState, entryProblems := materializeEntryReference(
					claim,
					reference,
					loader,
				)
				problems = append(problems, entryProblems...)
				state.References = append(state.References, entryState)
				continue
			}
			if reference.Type == artifactTypeScript && reference.Package != "" {
				packageState, packageProblems := materializePackageGlobReference(
					claim,
					reference,
					loader,
				)
				problems = append(problems, packageProblems...)
				state.References = append(state.References, packageState)
				continue
			}
			referencePaths := matchingReferencePaths(
				referenceInventories,
				reference,
			)
			referenceState := referenceState{
				Spec:         reference,
				Paths:        referencePaths,
				UnitsByScope: map[string][]*evidenceUnit{},
				Healthy:      populationIsHealthy(referenceInventories, reference.Base, referencePaths),
			}
			if len(referencePaths) == 0 && referenceState.Healthy {
				if reference.Type == artifactSwagger {
					problems = append(
						problems,
						claimLabel(claim)+" "+referenceLabel(reference)+" matched no swagger source for "+describeReferenceSources(reference)+". Fix the reference location; this obligation cannot materialize evidence units without a source.",
					)
				} else {
					problems = append(
						problems,
						claimLabel(claim)+" "+referenceLabel(reference)+" matched no "+string(reference.Type)+" files for "+describePopulation(reference.Base, reference.Files)+". Fix the reference globs or the root they resolve against; this obligation cannot materialize evidence units without files.",
					)
				}
			}
			selectedInventoryProblem := false
			availableUnits := map[string]*evidenceUnit{}
			selectedUnits := map[string]bool{}
			for _, path := range referencePaths {
				for _, inventoryProblem := range referenceInventories[path].Problems {
					if inventoryProblem.Symbol == "*" ||
						reference.Symbols.contains(inventoryProblem.Symbol) {
						selectedInventoryProblem = true
					}
				}
				for _, unit := range referenceInventories[path].Units {
					availableUnits[unit.ID] = unit
					if !reference.Symbols.contains(unit.Symbol) ||
						selectedUnits[unit.ID] {
						continue
					}
					selectedUnits[unit.ID] = true
					referenceState.Units = append(referenceState.Units, unit)
				}
			}
			sortUnits(referenceState.Units)
			scopesByID := map[string]*evidenceUnit{}
			for _, unit := range referenceState.Units {
				for scope := unit; scope != nil; scope = availableUnits[scope.ParentID] {
					referenceState.UnitsByScope[scope.ID] = append(
						referenceState.UnitsByScope[scope.ID],
						unit,
					)
					if scopesByID[scope.ID] == nil {
						scopesByID[scope.ID] = scope
						referenceState.Scopes = append(referenceState.Scopes, scope)
					}
					if scope.ParentID == "" {
						break
					}
				}
			}
			sortUnits(referenceState.Scopes)
			if len(referencePaths) != 0 &&
				len(referenceState.Units) == 0 &&
				referenceState.Healthy &&
				!selectedInventoryProblem {
				problems = append(
					problems,
					claimLabel(claim)+" "+referenceLabel(reference)+" matched "+decimal(len(referencePaths))+" file(s) but materialized no selected evidence units ("+reference.Symbols.names()+"). Select symbol kinds present in those files or correct the reference globs.",
				)
			}
			state.References = append(state.References, referenceState)
		}
		states = append(states, state)
	}
	return states, problems
}

func evaluateEvidenceGraph(
	states []claimState,
	loader *typeScriptLoader,
) []string {
	problems := []string{}
	targets := map[string]map[string]*evidenceUnit{}
	markdownTargets := map[string]map[string]*evidenceUnit{}
	// Scoped targets are keyed by owning file as well as name, which is what
	// makes import-scope resolution unambiguous: two modules exporting `get`
	// never compete, because resolution already knows which file it landed in.
	scopedTargets := map[string]map[string]*evidenceUnit{}
	for _, state := range states {
		for _, reference := range state.References {
			// An entry-selected address is valid in the module that exposes it,
			// not in the one that declares the symbol. Identity still belongs to
			// the declaring file; only reachability moves.
			addressPath := ""
			if reference.Spec.entrySelected() && len(reference.Paths) == 1 {
				addressPath = reference.Paths[0]
			}
			for _, unit := range reference.Scopes {
				for _, address := range append([]string{unit.Target}, unit.Aliases...) {
					if targets[address] == nil {
						targets[address] = map[string]*evidenceUnit{}
					}
					targets[address][unit.ID] = unit
				}
				if unit.Type == artifactMarkdown {
					if markdownTargets[unit.Target] == nil {
						markdownTargets[unit.Target] = map[string]*evidenceUnit{}
					}
					markdownTargets[unit.Target][unit.ID] = unit
				}
				if unit.Type == artifactTypeScript {
					owner := unit.Path
					if addressPath != "" {
						owner = addressPath
					}
					// Every address the unit answers to indexes the same unit, so
					// a symbol an entry exposes by two paths is one obligation
					// acknowledged once rather than two competing candidates.
					for _, address := range append([]string{unit.Target}, unit.Aliases...) {
						key := scopedTargetKey(owner, address)
						if scopedTargets[key] == nil {
							scopedTargets[key] = map[string]*evidenceUnit{}
						}
						scopedTargets[key][unit.ID] = unit
					}
				}
			}
		}
	}

	declarations := map[string]*evidenceDeclaration{}
	owners := map[string][]claimState{}
	for _, state := range states {
		for _, declaration := range state.Declarations {
			declarations[declaration.ID] = declaration
			seen := false
			for _, owner := range owners[declaration.ID] {
				if owner.Spec.Index == state.Spec.Index {
					seen = true
					break
				}
			}
			if !seen {
				owners[declaration.ID] = append(owners[declaration.ID], state)
			}
		}
	}
	declarationIDs := make([]string, 0, len(declarations))
	for id := range declarations {
		declarationIDs = append(declarationIDs, id)
	}
	sort.Strings(declarationIDs)

	resolved := map[string]string{}
	for _, id := range declarationIDs {
		declaration := declarations[id]
		context := declarationObligationContext(owners[id])
		if !declaration.valid() {
			problems = append(
				problems,
				"Malformed @"+string(declaration.Tag)+" declaration at "+declaration.location()+" for "+context+": target and non-empty reason are mandatory. Write '@"+string(declaration.Tag)+" <target> <reason>'.",
			)
			continue
		}
		if isInlineLinkTarget(declaration.Target) {
			unitID, problem := resolveInlineLinkDeclaration(
				declaration,
				loader,
				scopedTargets,
				context,
			)
			if problem != "" {
				problems = append(problems, problem)
				continue
			}
			resolved[id] = unitID
			continue
		}
		if declaration.Type == artifactTypeScript &&
			looksLikeTypeScriptTarget(declaration.Target, targets, markdownTargets) {
			problems = append(
				problems,
				"Unbraced TypeScript evidence target '"+declaration.Target+"' at "+declaration.location()+" for "+context+": a target naming a symbol is now written as an inline link, so the citing module's import is what resolves it. Write '@"+string(declaration.Tag)+" {@link "+declaration.Target+"} <reason>' and import the symbol; 'import type' is enough.",
			)
			continue
		}
		candidates := declarationCandidates(declaration.Target, targets, markdownTargets)
		// The configuration guard refuses a code population to a claim that
		// cannot address one, but the address map is built from every claim at
		// once — so a Markdown claim could still land on a symbol materialized
		// by some *other* claim's TypeScript reference. Measured: it resolved
		// silently, which left repository-wide name uniqueness load-bearing
		// through a door the guard does not cover. Closing it here rather than
		// by scoping the whole map keeps resolution global for the artifacts
		// that are addressed by path, where a shared map costs nothing.
		if declaration.Type != artifactTypeScript {
			addressable, code := splitCodeCandidates(candidates)
			if len(addressable) == 0 && len(code) != 0 {
				problems = append(
					problems,
					"Code evidence target '"+declaration.Target+"' at "+declaration.location()+" for "+context+": a "+string(declaration.Type)+" claim cannot cite a TypeScript symbol, because a symbol citation resolves through the citing module's imports and this artifact has none. Invert the obligation so the code cites this artifact, or move the citation into TypeScript.",
				)
				continue
			}
			candidates = addressable
		}
		switch len(candidates) {
		case 0:
			// A failed reference population may contain the declaration's target;
			// absence from the partial address map proves nothing until that
			// population is healthy again. Its loader diagnostic already names
			// the repair boundary, so an unresolved-target diagnostic here would
			// be a derivative false claim.
			if declarationResolutionUncertain(owners[id]) {
				continue
			}
			problems = append(
				problems,
				"Unresolved evidence target '"+declaration.Target+"' at "+declaration.location()+" for "+context+": no configured source materializes that evidence unit. Correct the target, or make one of the named references select the source unit this claim actually uses.",
			)
		case 1:
			for unitID := range candidates {
				resolved[id] = unitID
			}
		default:
			descriptions := make([]string, 0, len(candidates))
			for _, unit := range candidates {
				descriptions = append(descriptions, unit.Readable+" at "+unit.location())
			}
			sort.Strings(descriptions)
			problems = append(
				problems,
				"Ambiguous evidence target '"+declaration.Target+"' at "+declaration.location()+" for "+context+": it matches "+strings.Join(descriptions, "; ")+". Rename or qualify the source symbols so the target has exactly one meaning.",
			)
		}
	}

	participates := map[string]bool{}
	uncertain := map[string]bool{}
	outOfScope := map[string][]string{}
	outOfScopeSelections := map[string]symbolSet{}
	for _, state := range states {
		if len(state.Paths) == 0 {
			continue
		}
		if !state.Healthy {
			for _, declaration := range state.Declarations {
				uncertain[declaration.ID] = true
			}
		}
		for _, reference := range state.References {
			if !reference.Healthy {
				for _, declaration := range state.Declarations {
					uncertain[declaration.ID] = true
				}
			}
			if len(reference.Units) == 0 {
				continue
			}
			acknowledged := map[string]*evidenceDeclaration{}
			for _, declaration := range state.Declarations {
				scopeID := resolved[declaration.ID]
				covered := reference.UnitsByScope[scopeID]
				if len(covered) == 0 {
					continue
				}
				if !declarationEligibleForClaim(declaration, state.Spec) {
					outOfScope[declaration.ID] = appendUniqueString(
						outOfScope[declaration.ID],
						claimLabel(state.Spec)+" "+referenceLabel(reference.Spec),
					)
					if outOfScopeSelections[declaration.ID] == nil {
						outOfScopeSelections[declaration.ID] = symbolSet{}
					}
					for symbol := range state.Spec.Symbols {
						outOfScopeSelections[declaration.ID][symbol] = true
					}
					continue
				}
				// Physical file ownership, resolved reference scope, and host
				// eligibility decide which overlapping claims this declaration
				// belongs to. A declaration may participate in several eligible
				// obligations, but an ineligible overlap must not reject one
				// already owned elsewhere.
				participates[declaration.ID] = true
				if !state.Healthy || !reference.Healthy {
					continue
				}
				var overlappingUnit *evidenceUnit
				var firstAcknowledgement *evidenceDeclaration
				for _, unit := range covered {
					if first := acknowledged[unit.ID]; first != nil {
						if overlappingUnit == nil {
							overlappingUnit = unit
							firstAcknowledgement = first
						}
						continue
					}
					acknowledged[unit.ID] = declaration
				}
				if overlappingUnit != nil {
					problems = append(
						problems,
						"Duplicate acknowledgement for '"+overlappingUnit.Target+"' in "+claimLabel(state.Spec)+" "+referenceLabel(reference.Spec)+" at "+declaration.location()+": scope '"+declaration.Target+"' overlaps the first acknowledgement at "+firstAcknowledgement.location()+". Keep @evidence and @evidenceExclude scopes disjoint within this claim.",
					)
				}
			}
			if !state.Healthy || !reference.Healthy || len(reference.Paths) == 0 {
				continue
			}
			for _, unit := range reference.Units {
				if acknowledged[unit.ID] != nil {
					continue
				}
				problems = append(
					problems,
					"Missing acknowledgement for '"+unit.Target+"' ("+unit.Readable+" at "+unit.location()+") in "+claimLabel(state.Spec)+" "+referenceLabel(reference.Spec)+". Add '@evidence "+acknowledgementForm(unit, state.Spec)+" <reason>' to a selected "+string(state.Spec.Type)+" host of this claim, or add '@evidenceExclude "+acknowledgementForm(unit, state.Spec)+" <reason>' to an eligible exclusion carrier in a matching claim file when this claim intentionally does not use it.",
				)
			}
		}
	}
	for _, id := range declarationIDs {
		if resolved[id] == "" || participates[id] {
			continue
		}
		declaration := declarations[id]
		context := declarationObligationContext(owners[id])
		if obligations := outOfScope[id]; len(obligations) != 0 {
			host := declaration.Hosts.names()
			if len(declaration.Hosts) == 0 {
				host = "unsupported or non-exported declaration"
			}
			if declaration.Tag == tagExclude {
				problems = append(
					problems,
					"Out-of-scope @evidenceExclude carrier at "+declaration.location()+" for "+strings.Join(obligations, "; ")+", target '"+displayTarget(declaration.Target)+"': '"+host+"' is not an eligible exclusion carrier in these matching claim files. Move the exclusion to a supported public export or selected declaration host, or use a top-level unattached Prisma documentation comment.",
				)
				continue
			}
			problems = append(
				problems,
				"Out-of-scope @"+string(declaration.Tag)+" host at "+declaration.location()+" for "+strings.Join(obligations, "; ")+", target '"+displayTarget(declaration.Target)+"': host kind '"+host+"' is not selected ("+outOfScopeSelections[id].names()+") by any of these claim obligations. Move the declaration to a selected host, or widen only the claim symbol selector that genuinely owns this target.",
			)
			continue
		}
		if uncertain[id] {
			// A failed loader makes non-participation unknowable. Its direct
			// diagnostic is the repair path; adding a ghost finding here would
			// derive a second claim from an incomplete graph.
			continue
		}
		problems = append(
			problems,
			"Non-participating @"+string(declaration.Tag)+" target '"+displayTarget(declaration.Target)+"' at "+declaration.location()+" for "+context+": the target resolves, but none of this declaration's configured references selects it. Correct the target or reference, or move the tag to an eligible host or exclusion carrier in the claim that owes it; a resolving tag must discharge at least one obligation.",
		)
	}
	return problems
}

// declarationEligibleForClaim keeps ownership evidence on the selected host
// while allowing an intentional exclusion to live on a claim-file carrier.
func declarationEligibleForClaim(
	declaration *evidenceDeclaration,
	claim claimSpec,
) bool {
	if claim.Symbols.intersects(declaration.Hosts) {
		return true
	}
	return declaration.Tag == tagExclude && declaration.ExclusionCarrier
}

func declarationResolutionUncertain(owners []claimState) bool {
	for _, owner := range owners {
		for _, reference := range owner.References {
			if !reference.Healthy {
				return true
			}
		}
	}
	return false
}

// materializeEntryReference builds a population by walking an entry module's
// export graph rather than by matching paths.
//
// The entry is what a consumer can actually import, so the population is the
// public contract instead of whatever files a glob happened to sweep in. It is
// also the only selection that can reach a package symbol nothing imports,
// because such a symbol is absent from the Program by definition.
func materializeEntryReference(
	claim claimSpec,
	reference referenceSpec,
	loader *typeScriptLoader,
) (referenceState, []string) {
	state := referenceState{
		Spec:         reference,
		UnitsByScope: map[string][]*evidenceUnit{},
		Healthy:      true,
	}
	entry, problem := resolveReferenceEntry(claim, reference, loader)
	if problem != "" {
		return state, []string{problem}
	}
	state.Paths = []string{entry}
	state.Units = materializeEntryUnits(loader, entry, reference.Symbols)
	if failure := loader.failure(entry); failure != "" {
		state.Healthy = false
		return state, []string{
			claimLabel(claim) + " " + referenceLabel(reference) + " could not read TypeScript entry '" + entry + "': " + failure + ". Fix filesystem access or the package installation; coverage cannot be evaluated from a partial entry graph.",
		}
	}
	if len(state.Units) == 0 {
		return state, []string{
			claimLabel(claim) + " " + referenceLabel(reference) + " reached no selected evidence units (" + reference.Symbols.names() + ") from entry '" + entry + "'. Select symbol kinds the entry exposes, or point the entry at the module that declares them.",
		}
	}
	sortUnits(state.Units)
	for _, unit := range state.Units {
		state.Scopes = append(state.Scopes, unit)
		state.UnitsByScope[unit.ID] = append(state.UnitsByScope[unit.ID], unit)
	}
	// An entry-selected population is flat by address rather than by file, so a
	// parent type still has to cover the properties it owns. Walking addresses
	// keeps that cascade without reintroducing file-shaped hierarchy.
	for _, unit := range state.Units {
		for _, other := range state.Units {
			if other.ID == unit.ID || !addressContains(unit.Identity, other.Identity) {
				continue
			}
			state.UnitsByScope[unit.ID] = append(state.UnitsByScope[unit.ID], other)
		}
	}
	return state, nil
}

// materializePackageGlobReference narrows an installed package with globs that
// resolve against the package root.
//
// Narrowing a large SDK to one area is what makes the obligation adoptable at
// all. The globs are written as a consumer thinks of the package — `lib/api/**`
// — rather than carrying the `node_modules` prefix, which is an installation
// detail rather than part of the package's shape.
func materializePackageGlobReference(
	claim claimSpec,
	reference referenceSpec,
	loader *typeScriptLoader,
) (referenceState, []string) {
	state := referenceState{
		Spec:         reference,
		UnitsByScope: map[string][]*evidenceUnit{},
		Healthy:      true,
	}
	base := referenceBase(reference)
	available := map[string]*evidenceUnit{}
	candidates, walkProblem := loader.walk(base)
	if walkProblem != "" {
		state.Healthy = false
		return state, []string{
			claimLabel(claim) + " " + referenceLabel(reference) + " could not inspect TypeScript package '" + reference.Package + "': " + walkProblem + ". Fix filesystem access or reinstall the package; coverage cannot be evaluated from a partial population.",
		}
	}
	problems := []string{}
	for _, candidate := range candidates {
		relative := strings.TrimPrefix(strings.TrimPrefix(candidate, base), "/")
		if !reference.Files.matches(relative) {
			continue
		}
		inventory := loader.inventory(candidate)
		if inventory == nil {
			state.Healthy = false
			problems = append(
				problems,
				claimLabel(claim)+" "+referenceLabel(reference)+" could not read TypeScript source '"+candidate+"': "+loader.failure(candidate)+". Fix filesystem access or reinstall the package; coverage cannot be evaluated from a partial population.",
			)
			continue
		}
		state.Paths = append(state.Paths, candidate)
		for _, unit := range inventory.Units {
			available[unit.ID] = unit
		}
	}
	if len(state.Paths) == 0 {
		if !state.Healthy {
			return state, problems
		}
		return state, []string{
			claimLabel(claim) + " " + referenceLabel(reference) + " matched no files inside package '" + reference.Package + "' for " + describePatterns(reference.Files) + ". Fix the package-relative globs; they resolve against the package root, not the project root.",
		}
	}
	collectReferenceUnits(&state, reference, available)
	if !state.Healthy {
		return state, problems
	}
	if len(state.Units) == 0 {
		return state, []string{
			claimLabel(claim) + " " + referenceLabel(reference) + " matched " + decimal(len(state.Paths)) + " file(s) inside package '" + reference.Package + "' but materialized no selected evidence units (" + reference.Symbols.names() + "). Select symbol kinds present in those files or correct the globs.",
		}
	}
	return state, nil
}

// collectReferenceUnits selects units and rebuilds the scope hierarchy over
// them, so an ancestor target still covers the descendants it owns.
func collectReferenceUnits(
	state *referenceState,
	reference referenceSpec,
	available map[string]*evidenceUnit,
) {
	selected := map[string]bool{}
	for _, unit := range available {
		if !reference.Symbols.contains(unit.Symbol) || selected[unit.ID] {
			continue
		}
		selected[unit.ID] = true
		state.Units = append(state.Units, unit)
	}
	sortUnits(state.Units)
	scopesByID := map[string]*evidenceUnit{}
	for _, unit := range state.Units {
		for scope := unit; scope != nil; scope = available[scope.ParentID] {
			state.UnitsByScope[scope.ID] = append(state.UnitsByScope[scope.ID], unit)
			if scopesByID[scope.ID] == nil {
				scopesByID[scope.ID] = scope
				state.Scopes = append(state.Scopes, scope)
			}
			if scope.ParentID == "" {
				break
			}
		}
	}
	sortUnits(state.Scopes)
}

func resolveReferenceEntry(
	claim claimSpec,
	reference referenceSpec,
	loader *typeScriptLoader,
) (string, string) {
	base := referenceBase(reference)
	if reference.Entry != "" {
		candidate := reference.Entry
		if base != "" {
			candidate = path.Join(base, reference.Entry)
		}
		for _, option := range moduleCandidates(candidate) {
			if loader.exists(option) {
				return option, ""
			}
		}
		return "", claimLabel(claim) + " " + referenceLabel(reference) + " found no entry module at '" + candidate + "'. Correct the entry path; this obligation cannot materialize evidence units without one."
	}
	entry := loader.packageEntryModule(reference.Package)
	if entry == "" {
		return "", claimLabel(claim) + " " + referenceLabel(reference) + " could not resolve the declaration entry of package '" + reference.Package + "'. Install it, or name its entry with 'file'; the entry is read from the 'types' condition of 'exports', then 'typesVersions', then 'types'."
	}
	return entry, ""
}

// addressContains reports whether one entry-relative address encloses another.
func addressContains(owner []string, candidate []string) bool {
	if len(candidate) <= len(owner) {
		return false
	}
	for index, segment := range owner {
		if candidate[index] != segment {
			return false
		}
	}
	return true
}

// acknowledgementForm spells the citation a claim would actually have to write.
//
// A TypeScript unit is cited through an inline link resolved by the citing
// module's imports, so suggesting the bare name would name the one form the
// rule now rejects. Markdown claims keep the plain token, because Markdown has
// no import scope to resolve one against.
func acknowledgementForm(unit *evidenceUnit, claim claimSpec) string {
	if unit.Type != artifactTypeScript || claim.Type != artifactTypeScript {
		return unit.Target
	}
	return "{@link " + unit.Target + "}"
}

func scopedTargetKey(path string, target string) string {
	return path + "\x00" + target
}

// looksLikeTypeScriptTarget reports whether an unbraced target names a symbol.
//
// The migration diagnostic has to be told apart from an ordinary typo, and the
// signal is that the same spelling still materializes as a TypeScript unit
// somewhere in the configured graph. A Markdown path or a Swagger operation
// never does, so neither is mistaken for a symbol that lost its braces.
func looksLikeTypeScriptTarget(
	target string,
	targets map[string]map[string]*evidenceUnit,
	markdownTargets map[string]map[string]*evidenceUnit,
) bool {
	if len(markdownTargets[target]) != 0 {
		return false
	}
	for _, unit := range targets[target] {
		if unit.Type == artifactTypeScript {
			return true
		}
	}
	return false
}

// resolveInlineLinkDeclaration resolves a braced target through the citing
// module's imports, the way TypeScript resolves the same name.
//
// Every failure gets its own diagnostic. A single "unresolved" would leave the
// author guessing which of four independent things went wrong, and three of
// them are repaired in completely different places.
func resolveInlineLinkDeclaration(
	declaration *evidenceDeclaration,
	loader *typeScriptLoader,
	scopedTargets map[string]map[string]*evidenceUnit,
	context string,
) (string, string) {
	target := inlineLinkTarget(declaration.Target)
	if declaration.Type != artifactTypeScript {
		return "", "Inline link target '" + displayTarget(declaration.Target) + "' at " + declaration.location() + " for " + context + ": only a TypeScript declaration can cite through an inline link, because resolution runs through the citing module's imports and a " + string(declaration.Type) + " comment has none. Use a path-addressed target selected by one of the named references; a TypeScript symbol must instead be cited from a TypeScript claim."
	}
	inventory := loader.inventory(declaration.Path)
	if inventory == nil {
		return "", "Inline link target '" + displayTarget(declaration.Target) + "' at " + declaration.location() + " for " + context + ": the citing file is not part of the TypeScript program, so it has no import scope to resolve against. Include the file in the project or move the citation to a configured TypeScript claim file."
	}
	segments := strings.Split(target, ".")
	binding, imported := inventory.Imports[segments[0]]
	if !imported {
		return "", "Unimported evidence target '" + displayTarget(declaration.Target) + "' at " + declaration.location() + " for " + context + ": '" + segments[0] + "' is not imported by this module, so the citation names a symbol this file does not reference. Import it; 'import type' is enough and is erased at emit."
	}
	// Resolution goes through the same loader the population uses, so a citation
	// can reach a package entry that never entered the Program — which is the
	// only way an import of an installed SDK resolves at all.
	resolvedPath := loader.resolve(declaration.Path, binding.Specifier)
	if resolvedPath == "" {
		return "", "Unresolved module '" + binding.Specifier + "' for evidence target '" + displayTarget(declaration.Target) + "' at " + declaration.location() + " for " + context + ": the specifier resolves to no TypeScript file reachable from this project. Correct the import, or make the named reference reach the module."
	}
	remaining := segments[1:]
	if !binding.Namespace {
		remaining = append([]string{binding.Imported}, remaining...)
	}
	if len(remaining) == 0 {
		return "", "Incomplete evidence target '" + displayTarget(declaration.Target) + "' at " + declaration.location() + " for " + context + ": a namespace import names a module rather than a unit. Name a symbol inside '" + binding.Specifier + "' that the named reference selects."
	}
	name := strings.Join(remaining, ".")
	candidates := scopedTargets[scopedTargetKey(resolvedPath, name)]
	switch len(candidates) {
	case 0:
		return "", "Unreachable evidence target '" + displayTarget(declaration.Target) + "' at " + declaration.location() + " for " + context + ": '" + resolvedPath + "' declares no selected unit named '" + name + "'. Correct the target, or widen the named reference's files and symbol selection so that unit is configured evidence."
	case 1:
		for _, unit := range candidates {
			return unit.ID, ""
		}
		return "", ""
	default:
		// One module may spell one name in two declaration spaces — a type and a
		// callable, say. Resolution landed in the right file and still cannot say
		// which unit was meant, and picking one silently would acknowledge an
		// obligation the author never cited.
		descriptions := make([]string, 0, len(candidates))
		for _, unit := range candidates {
			descriptions = append(descriptions, unit.Readable+" at "+unit.location())
		}
		sort.Strings(descriptions)
		return "", "Ambiguous evidence target '" + displayTarget(declaration.Target) + "' at " + declaration.location() + " for " + context + ": '" + resolvedPath + "' declares " + strings.Join(descriptions, "; ") + " under that name. Narrow the named reference's symbol selection so the target has exactly one meaning."
	}
}

func declarationCandidates(
	target string,
	targets map[string]map[string]*evidenceUnit,
	markdownTargets map[string]map[string]*evidenceUnit,
) map[string]*evidenceUnit {
	candidates := map[string]*evidenceUnit{}
	for id, unit := range targets[target] {
		candidates[id] = unit
	}
	normalized := normalizeMarkdownTarget(target)
	if normalized != target {
		for id, unit := range markdownTargets[normalized] {
			candidates[id] = unit
		}
	}
	return candidates
}

// splitCodeCandidates separates the units a non-TypeScript claim may address
// from the ones only an inline link can reach.
//
// Both halves are returned because the caller has to tell "this target names
// something else entirely" from "this target names a symbol, and that is the
// problem". Reporting the second as an unresolved target would be true and
// useless: the unit exists, and nothing in the message would say why naming it
// here cannot work.
func splitCodeCandidates(
	candidates map[string]*evidenceUnit,
) (map[string]*evidenceUnit, map[string]*evidenceUnit) {
	addressable := map[string]*evidenceUnit{}
	code := map[string]*evidenceUnit{}
	for id, unit := range candidates {
		if unit.Type == artifactTypeScript {
			code[id] = unit
			continue
		}
		addressable[id] = unit
	}
	return addressable, code
}

func inventoriesOf(
	kind artifactKind,
	markdown map[string]*artifactInventory,
	prisma map[string]*artifactInventory,
	swagger map[string]*artifactInventory,
	typescript map[string]*artifactInventory,
) map[string]*artifactInventory {
	switch kind {
	case artifactMarkdown:
		return markdown
	case artifactPrisma:
		return prisma
	case artifactSwagger:
		return swagger
	case artifactTypeScript:
		return typescript
	default:
		return map[string]*artifactInventory{}
	}
}

func matchingReferencePaths(
	inventories map[string]*artifactInventory,
	reference referenceSpec,
) []string {
	if reference.Type != artifactSwagger {
		return matchingInventoryPaths(inventories, reference.Base, reference.Files)
	}
	if inventories[reference.Source] == nil {
		return nil
	}
	return []string{reference.Source}
}

// matchingInventoryPaths selects the files one population owns.
//
// Matching runs against the base-relative path rather than against the key,
// which is what keeps a pattern written as `requirements/**/*.md` meaning the
// same thing whether its root is the project or a directory two levels above
// it. An address composed for another base is skipped outright, so a file
// loaded for one root is never offered to a population that cannot address it.
func matchingInventoryPaths(
	inventories map[string]*artifactInventory,
	base populationBase,
	globs globSet,
) []string {
	paths := []string{}
	for key := range inventories {
		relative, owned := base.relativeOf(key)
		if !owned || !globs.matches(relative) {
			continue
		}
		paths = append(paths, key)
	}
	sort.Strings(paths)
	return paths
}

func sortUnits(units []*evidenceUnit) {
	sort.Slice(units, func(left int, right int) bool {
		if units[left].Target != units[right].Target {
			return units[left].Target < units[right].Target
		}
		return units[left].ID < units[right].ID
	})
}

func claimLabel(claim claimSpec) string {
	label := "Claim " + decimal(claim.Index+1)
	if claim.Name != "" {
		label += " ('" + claim.Name + "')"
	}
	return label
}

func referenceLabel(reference referenceSpec) string {
	if reference.Type == artifactSwagger {
		return "reference " + decimal(reference.Index+1) + " (swagger operations)"
	}
	return "reference " + decimal(reference.Index+1) + " (" + string(reference.Type) + ", symbols: " + reference.Symbols.names() + ")"
}

func declarationObligationContext(owners []claimState) string {
	groups := make([]string, 0, len(owners))
	for _, owner := range owners {
		references := make([]string, 0, len(owner.Spec.References))
		for _, reference := range owner.Spec.References {
			references = append(references, referenceLabel(reference))
		}
		if len(references) == 0 {
			groups = append(groups, claimLabel(owner.Spec))
			continue
		}
		groups = append(
			groups,
			claimLabel(owner.Spec)+" across "+strings.Join(references, ", "),
		)
	}
	if len(groups) == 0 {
		return "no matched claim"
	}
	return strings.Join(groups, "; ")
}

func appendUniqueString(values []string, candidate string) []string {
	for _, value := range values {
		if value == candidate {
			return values
		}
	}
	return append(values, candidate)
}

func reportProblems(ctx *rule.ProjectContext, problems []string) {
	sort.Strings(problems)
	previous := ""
	for _, problem := range problems {
		if problem == "" || problem == previous {
			continue
		}
		ctx.Report(problem)
		previous = problem
	}
}
