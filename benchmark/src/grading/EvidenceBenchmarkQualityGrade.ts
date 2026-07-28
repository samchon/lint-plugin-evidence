import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGrade } from "../structures/IEvidenceBenchmarkQualityGrade.ts";
import { EvidenceBenchmarkBlindBundle } from "./EvidenceBenchmarkBlindBundle.ts";
import { EvidenceBenchmarkGradingPlan } from "./EvidenceBenchmarkGradingPlan.ts";

/** Validates block outputs, assembles grades, and compares independent raters. */
export namespace EvidenceBenchmarkQualityGrade {
  const STATUSES: IEvidenceBenchmarkQualityGrade.Status[] = [
    "implemented_correctly",
    "partial",
    "omitted",
    "contradicted",
    "unverifiable",
    "not_applicable",
  ];
  const SURFACES: ReadonlySet<string> = new Set([
    "database",
    "api",
    "backend",
    "frontend",
    "integration",
    "test",
    "operations",
    "documentation",
  ]);
  const SURFACE_STATUSES: ReadonlySet<string> = new Set([
    "correct",
    "partial",
    "missing",
    "wrong",
    "not_applicable",
  ]);
  const SEVERITIES: ReadonlySet<string> = new Set([
    "none",
    "low",
    "medium",
    "high",
    "critical",
  ]);
  const SHA256 = /^[a-f0-9]{64}$/;

  /** Assembles one complete grade from an exact block-plan submission set. */
  export function assemble(
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog,
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
    submissions: IEvidenceBenchmarkQualityGrade.IBlockSubmission[],
    armGuess: IEvidenceBenchmarkQualityGrade.IArmGuessSubmission,
    bundle: EvidenceBenchmarkBlindBundle.IResult,
  ): IEvidenceBenchmarkQualityGrade.IGrade {
    EvidenceBenchmarkGradingPlan.verify(catalog, plan);
    const bundleFiles: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(bundle.bundleRoot);
    const bundleRawTreeSha256: string =
      EvidenceBenchmarkBlindBundle.rawTreeSha256(bundle.bundleRoot);
    if (
      bundle.treeAlgorithm !== plan.bindings.treeAlgorithm ||
      bundle.runManifestSha256 !== plan.bindings.runManifestSha256 ||
      bundle.requirementsRawTreeSha256 !==
        plan.bindings.requirementsRawTreeSha256 ||
      bundleRawTreeSha256 !== plan.bindings.bundleRawTreeSha256 ||
      bundle.bundleId !== plan.bindings.bundleId ||
      bundle.manifestSha256 !== plan.bindings.gradingInputManifestSha256 ||
      bundle.sourceSnapshotRawTreeSha256 !==
        plan.bindings.sourceSnapshotRawTreeSha256 ||
      bundle.phase !== plan.phase
    )
      throw new Error(
        "Blind grading bundle bytes drifted from the block plan.",
      );
    if (submissions.length !== plan.blocks.length)
      throw new Error(
        `Grade assembly requires ${plan.blocks.length} blocks, found ${submissions.length}.`,
      );
    const byBlock: Map<
      string,
      IEvidenceBenchmarkQualityGrade.IBlockSubmission
    > = new Map();
    for (const submission of submissions) {
      if (byBlock.has(submission.output.blockId))
        throw new Error(
          `Grade block submission is duplicated: ${submission.output.blockId}.`,
        );
      byBlock.set(submission.output.blockId, submission);
    }
    const ordered: IEvidenceBenchmarkQualityGrade.IBlockSubmission[] =
      plan.blocks.map((block) => {
        const submission = byBlock.get(block.blockId);
        if (submission === undefined)
          throw new Error(
            `Grade block submission is missing: ${block.blockId}.`,
          );
        validateSubmission(catalog, plan, block, submission, bundleFiles);
        return submission;
      });
    requireConsistentProvenance(plan, ordered);
    const first: IEvidenceBenchmarkQualityGrade.IBlockSubmission = ordered[0]!;
    validateArmGuess(plan, ordered, armGuess);
    const acceptanceRatings: IEvidenceBenchmarkQualityGrade.IRating[] = ratings(
      ordered,
      "acceptance",
    );
    const contextRatings: IEvidenceBenchmarkQualityGrade.IRating[] = ratings(
      ordered,
      "context",
    );
    requireExactIds(
      acceptanceRatings,
      catalog.acceptance.map((clause) => clause.id),
      "acceptance",
    );
    requireExactIds(
      contextRatings,
      catalog.context.map((clause) => clause.id),
      "context",
    );
    const value: Omit<IEvidenceBenchmarkQualityGrade.IGrade, "gradeId"> = {
      schemaVersion: 1,
      bundleId: first.bundleId,
      subject: plan.subject,
      phase: plan.phase,
      grader: structuredClone(first.grader),
      blind: true,
      planSha256: plan.planSha256,
      generationCoreSealSha256: plan.bindings.generationCoreSealSha256,
      acceptanceCatalogSha256: catalog.acceptanceCatalogSha256,
      contextCatalogSha256: catalog.contextCatalogSha256,
      acceptanceRatings,
      contextRatings,
      acceptanceSummary: summarize(acceptanceRatings),
      contextSummary:
        contextRatings.length === 0 ? null : summarize(contextRatings),
      denominatorsSummed: false,
      armGuess: structuredClone(armGuess.output),
      sourceBlocks: ordered.map((submission) => submission.output.blockId),
      sourceThreadIds: [
        ...new Set(ordered.map((submission) => submission.provenance.threadId)),
      ],
      sourceResponseIds: ordered
        .flatMap((submission) => submission.provenance.responseIds)
        .concat(armGuess.provenance.responseIds),
    };
    const grade: IEvidenceBenchmarkQualityGrade.IGrade = {
      ...value,
      gradeId: `grade-${EvidenceBenchmarkHash.object(value).slice(0, 32)}`,
    };
    EvidenceBenchmarkBlindBundle.verifyAfterGrade(bundle);
    return grade;
  }

  /**
   * Compares two independent grades without pooling acceptance and context.
   *
   * The sample seed is frozen outside the grader contexts. Hidden disagreement
   * IDs are harness-owned and never appear in the blind input.
   */
  export function compare(
    first: IEvidenceBenchmarkQualityGrade.IGrade,
    second: IEvidenceBenchmarkQualityGrade.IGrade,
    sampleSeed: string,
    hiddenDisagreements: ReadonlySet<string> = new Set(),
  ): IEvidenceBenchmarkQualityGrade.IComparison {
    requireComparable(first, second);
    if (sampleSeed.trim().length < 16)
      throw new Error(
        "Human-audit sample seed must contain at least 16 bytes.",
      );
    const acceptance = comparePopulation(
      "acceptance",
      first.acceptanceRatings,
      second.acceptanceRatings,
    );
    const context =
      first.contextRatings.length === 0
        ? null
        : comparePopulation(
            "context",
            first.contextRatings,
            second.contextRatings,
          );
    const sample: Set<string> = new Set([
      ...stratified(first.acceptanceRatings, sampleSeed, "acceptance"),
      ...stratified(first.contextRatings, sampleSeed, "context"),
    ]);
    const humanAuditQueue: IEvidenceBenchmarkQualityGrade.IAuditItem[] = [
      ...auditPopulation(
        "acceptance",
        first.acceptanceRatings,
        second.acceptanceRatings,
        sample,
        hiddenDisagreements,
      ),
      ...auditPopulation(
        "context",
        first.contextRatings,
        second.contextRatings,
        sample,
        hiddenDisagreements,
      ),
    ];
    const value: Omit<
      IEvidenceBenchmarkQualityGrade.IComparison,
      "comparisonSha256"
    > = {
      schemaVersion: 1,
      firstGradeId: first.gradeId,
      secondGradeId: second.gradeId,
      acceptance,
      context,
      humanAuditQueue,
      reliabilityThresholdMet:
        acceptance.weightedKappa !== null &&
        acceptance.weightedKappa >= 0.67 &&
        (context === null ||
          (context.weightedKappa !== null && context.weightedKappa >= 0.67)),
    };
    return {
      ...value,
      comparisonSha256: EvidenceBenchmarkHash.object(value),
    };
  }

  /** Applies a fresh third LLM to the complete queue without replacing grades. */
  export function adjudicate(
    first: IEvidenceBenchmarkQualityGrade.IGrade,
    second: IEvidenceBenchmarkQualityGrade.IGrade,
    comparison: IEvidenceBenchmarkQualityGrade.IComparison,
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
    submission: IEvidenceBenchmarkQualityGrade.IAdjudicationSubmission,
    bundle: EvidenceBenchmarkBlindBundle.IResult,
  ): IEvidenceBenchmarkQualityGrade.IAdjudication {
    requireComparable(first, second);
    const { comparisonSha256: _comparisonSha256, ...comparisonValue } =
      comparison;
    if (
      comparison.firstGradeId !== first.gradeId ||
      comparison.secondGradeId !== second.gradeId ||
      comparison.comparisonSha256 !==
        EvidenceBenchmarkHash.object(comparisonValue) ||
      plan.planSha256 !== first.planSha256 ||
      plan.planSha256 !== second.planSha256 ||
      submission.schemaVersion !== 1 ||
      submission.bundleId !== first.bundleId ||
      submission.output.schemaVersion !== 1 ||
      submission.output.firstGradeId !== first.gradeId ||
      submission.output.secondGradeId !== second.gradeId ||
      submission.output.comparisonSha256 !== comparison.comparisonSha256 ||
      JSON.stringify(submission.adjudicator) !==
        JSON.stringify(plan.bindings.adjudicatorAssignment)
    )
      throw new Error("Third-LLM adjudication does not match its frozen plan.");
    requireAdjudicator(submission.adjudicator);
    requireProvenance(
      submission.provenance,
      "third-LLM adjudication",
      plan.bindings.adjudicationProviderSchemaSha256,
      plan.bindings.adjudicationLocalSchemaSha256,
      plan.bindings.registrySha256,
    );
    const priorThreads: Set<string> = new Set([
      ...first.sourceThreadIds,
      ...second.sourceThreadIds,
    ]);
    const priorResponses: Set<string> = new Set([
      ...first.sourceResponseIds,
      ...second.sourceResponseIds,
    ]);
    if (
      priorThreads.has(submission.provenance.threadId) ||
      submission.provenance.responseIds.some((responseId) =>
        priorResponses.has(responseId),
      )
    )
      throw new Error(
        "Third-LLM adjudication reused a source grader context or response.",
      );
    const decisions = submission.output.decisions;
    const expected: string[] = comparison.humanAuditQueue.map(
      (item) => `${item.population}\0${item.criterionId}`,
    );
    const actual: string[] = decisions.map(
      (decision) => `${decision.population}\0${decision.criterionId}`,
    );
    if (
      JSON.stringify(actual) !== JSON.stringify(expected) ||
      new Set(actual).size !== actual.length
    )
      throw new Error(
        "Third-LLM decisions must exactly follow the mandatory audit queue.",
      );
    const files: Map<string, Uint8Array> = EvidenceBenchmarkHash.directory(
      bundle.bundleRoot,
    );
    for (const decision of decisions) {
      if (
        decision.rating.criterionId !== decision.criterionId ||
        !trimmed(decision.rationale)
      )
        throw new Error(
          `Third-LLM decision is malformed: ${decision.criterionId}.`,
        );
      validateRating(decision.rating, files);
    }
    const byId: Map<
      string,
      IEvidenceBenchmarkQualityGrade.IAdjudicationDecision
    > = new Map(
      decisions.map((decision) => [
        `${decision.population}\0${decision.criterionId}`,
        decision,
      ]),
    );
    const value: Omit<
      IEvidenceBenchmarkQualityGrade.IAdjudication,
      "adjudicationSha256"
    > = {
      schemaVersion: 1,
      firstGradeId: first.gradeId,
      secondGradeId: second.gradeId,
      adjudicator: structuredClone(submission.adjudicator),
      decisions: structuredClone(decisions),
      provenance: structuredClone(submission.provenance),
      acceptance: consensus(
        "acceptance",
        first.acceptanceRatings,
        second.acceptanceRatings,
        byId,
      ),
      context: consensus(
        "context",
        first.contextRatings,
        second.contextRatings,
        byId,
      ),
      denominatorsSummed: false,
      humanValidationStatus: "pending",
      pendingHumanValidationQueue: structuredClone(comparison.humanAuditQueue),
      humanValidatedCompositeClaim: false,
      completedAtUtc: submission.provenance.submittedAtUtc,
    };
    const adjudication: IEvidenceBenchmarkQualityGrade.IAdjudication = {
      ...value,
      adjudicationSha256: EvidenceBenchmarkHash.object(value),
    };
    EvidenceBenchmarkBlindBundle.verifyAfterGrade(bundle);
    return adjudication;
  }

  function validateSubmission(
    catalog: IEvidenceBenchmarkQualityGrade.ICatalog,
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
    block: IEvidenceBenchmarkQualityGrade.IBlock,
    submission: IEvidenceBenchmarkQualityGrade.IBlockSubmission,
    bundleFiles: ReadonlyMap<string, Uint8Array>,
  ): void {
    if (
      submission.schemaVersion !== 1 ||
      submission.subject !== catalog.subject ||
      submission.phase !== plan.phase ||
      submission.population !== block.population ||
      submission.blind !== true ||
      submission.output.schemaVersion !== 1 ||
      submission.output.blockId !== block.blockId ||
      submission.bundleId !== plan.bindings.bundleId
    )
      throw new Error(`${block.blockId} submission identity is invalid.`);
    if (
      !plan.bindings.graderAssignments.some(
        (grader) =>
          JSON.stringify(grader) === JSON.stringify(submission.grader),
      )
    )
      throw new Error(
        `${block.blockId} uses an unregistered grader assignment.`,
      );
    requireGrader(submission.grader, block.blockId);
    requireProvenance(
      submission.provenance,
      block.blockId,
      plan.bindings.providerSchemaSha256,
      plan.bindings.localSchemaSha256,
      plan.bindings.registrySha256,
    );
    const ids: string[] = submission.output.ratings.map(
      (rating) => rating.criterionId,
    );
    if (JSON.stringify(ids) !== JSON.stringify(block.criterionIds))
      throw new Error(
        `${block.blockId} ratings do not match their exact assigned ID order.`,
      );
    for (const rating of submission.output.ratings)
      validateRating(rating, bundleFiles);
  }

  function requireGrader(
    grader: IEvidenceBenchmarkQualityGrade.IGrader,
    label: string,
  ): void {
    if (
      !trimmed(grader.pseudonym) ||
      grader.kind !== "llm" ||
      (grader.model !== null && !trimmed(grader.model)) ||
      (grader.version !== null && !trimmed(grader.version)) ||
      (grader.reasoningEffort !== null && !trimmed(grader.reasoningEffort)) ||
      (grader.authMode !== null && !trimmed(grader.authMode)) ||
      (grader.serviceTier !== null && !trimmed(grader.serviceTier)) ||
      (grader.agentVersion !== null && !trimmed(grader.agentVersion))
    )
      throw new Error(`${label} has invalid grader identity.`);
  }

  function requireAdjudicator(
    grader: IEvidenceBenchmarkQualityGrade.IGrader,
  ): void {
    if (
      !trimmed(grader.pseudonym) ||
      grader.kind !== "llm_adjudicator" ||
      grader.model === null ||
      !trimmed(grader.model) ||
      grader.version === null ||
      !trimmed(grader.version) ||
      grader.reasoningEffort === null ||
      !trimmed(grader.reasoningEffort) ||
      grader.authMode === null ||
      !trimmed(grader.authMode) ||
      grader.serviceTier === null ||
      !trimmed(grader.serviceTier) ||
      grader.agentVersion === null ||
      !trimmed(grader.agentVersion)
    )
      throw new Error("Third LLM adjudicator identity is invalid.");
  }

  function validateArmGuess(
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
    submissions: IEvidenceBenchmarkQualityGrade.IBlockSubmission[],
    armGuess: IEvidenceBenchmarkQualityGrade.IArmGuessSubmission,
  ): void {
    const first = submissions[0]!;
    if (
      armGuess.schemaVersion !== 1 ||
      armGuess.bundleId !== first.bundleId ||
      JSON.stringify(armGuess.grader) !== JSON.stringify(first.grader) ||
      armGuess.output.schemaVersion !== 1 ||
      armGuess.output.planSha256 !== plan.planSha256 ||
      !["plain", "evidence", "unknown"].includes(armGuess.output.arm) ||
      !unit(armGuess.output.confidence) ||
      !Array.isArray(armGuess.output.clues) ||
      armGuess.output.clues.some((clue) => !trimmed(clue))
    )
      throw new Error("Post-grade blind arm guess is invalid.");
    requireProvenance(
      armGuess.provenance,
      "post-grade arm guess",
      plan.bindings.armGuessProviderSchemaSha256,
      plan.bindings.armGuessLocalSchemaSha256,
      plan.bindings.registrySha256,
    );
    const blockResponses: Set<string> = new Set(
      submissions.flatMap((submission) => submission.provenance.responseIds),
    );
    if (
      armGuess.provenance.responseIds.some((responseId) =>
        blockResponses.has(responseId),
      )
    )
      throw new Error("Post-grade arm guess reused a semantic response.");
    const latestBlockAt: number = Math.max(
      ...submissions.map((submission) =>
        Date.parse(submission.provenance.submittedAtUtc),
      ),
    );
    if (Date.parse(armGuess.provenance.submittedAtUtc) < latestBlockAt)
      throw new Error("Arm guess occurred before semantic grade sealing.");
    const semanticThreads: Set<string> = new Set(
      submissions.map((submission) => submission.provenance.threadId),
    );
    if (
      (plan.bindings.contextPolicy === "continuous" &&
        (semanticThreads.size !== 1 ||
          !semanticThreads.has(armGuess.provenance.threadId))) ||
      (plan.bindings.contextPolicy === "fresh_per_block" &&
        semanticThreads.has(armGuess.provenance.threadId))
    )
      throw new Error("Arm guess violates the frozen grader context policy.");
  }

  function requireProvenance(
    provenance: IEvidenceBenchmarkQualityGrade.IBlockSubmission["provenance"],
    label: string,
    providerSchemaSha256: string,
    localSchemaSha256: string,
    registrySha256: string,
  ): void {
    if (
      !trimmed(provenance.threadId) ||
      !trimmed(provenance.turnId) ||
      provenance.responseIds.length === 0 ||
      new Set(provenance.responseIds).size !== provenance.responseIds.length ||
      provenance.responseIds.some((id) => !trimmed(id)) ||
      provenance.providerSchemaSha256 !== providerSchemaSha256 ||
      provenance.localSchemaSha256 !== localSchemaSha256 ||
      provenance.registrySha256 !== registrySha256 ||
      !date(provenance.submittedAtUtc)
    )
      throw new Error(`${label} has invalid harness-owned provenance.`);
  }

  function requireConsistentProvenance(
    plan: IEvidenceBenchmarkQualityGrade.IBlockPlan,
    submissions: IEvidenceBenchmarkQualityGrade.IBlockSubmission[],
  ): void {
    const first = submissions[0]!;
    const grader: string = JSON.stringify(first.grader);
    const fields: Array<
      keyof Pick<
        IEvidenceBenchmarkQualityGrade.IBlockSubmission["provenance"],
        "providerSchemaSha256" | "localSchemaSha256" | "registrySha256"
      >
    > = ["providerSchemaSha256", "localSchemaSha256", "registrySha256"];
    const responseIds: Set<string> = new Set();
    const threadIds: Set<string> = new Set();
    for (const submission of submissions) {
      if (
        submission.bundleId !== first.bundleId ||
        JSON.stringify(submission.grader) !== grader
      )
        throw new Error(
          "Grade assembly cannot combine bundles or grader identities.",
        );
      for (const field of fields)
        if (submission.provenance[field] !== first.provenance[field])
          throw new Error(`Grade assembly changed frozen ${field}.`);
      for (const responseId of submission.provenance.responseIds) {
        if (responseIds.has(responseId))
          throw new Error(
            `Grade assembly repeats upstream response ${responseId}.`,
          );
        responseIds.add(responseId);
      }
      threadIds.add(submission.provenance.threadId);
    }
    if (
      (plan.bindings.contextPolicy === "continuous" && threadIds.size !== 1) ||
      (plan.bindings.contextPolicy === "fresh_per_block" &&
        threadIds.size !== submissions.length)
    )
      throw new Error(
        `Grade submissions violate ${plan.bindings.contextPolicy} context policy.`,
      );
  }

  function validateRating(
    rating: IEvidenceBenchmarkQualityGrade.IRating,
    files: ReadonlyMap<string, Uint8Array>,
  ): void {
    if (
      !trimmed(rating.criterionId) ||
      !STATUSES.includes(rating.status) ||
      !unit(rating.confidence) ||
      !trimmed(rating.rationale) ||
      !SEVERITIES.has(rating.severity)
    )
      throw new Error(`Criterion ${rating.criterionId} has invalid semantics.`);
    const surfaces = rating.surfaces;
    const expectedSurfaces: string[] = [...SURFACES];
    if (
      JSON.stringify(surfaces.map((surface) => surface.surface)) !==
        JSON.stringify(expectedSurfaces) ||
      surfaces.some((surface) => !SURFACE_STATUSES.has(surface.status))
    )
      throw new Error(
        `Criterion ${rating.criterionId} has invalid product surfaces.`,
      );
    if (
      rating.evidence.length === 0 ||
      rating.evidence.some(
        (item) =>
          !portable(item.path) ||
          !files.has(item.path) ||
          !Number.isInteger(item.line) ||
          item.line < 1 ||
          item.line > countLines(files.get(item.path)!, item.path) ||
          !trimmed(item.observation),
      )
    )
      throw new Error(
        `Criterion ${rating.criterionId} lacks file-backed evidence.`,
      );
    validateTest(rating.criterionId, rating.test);
    if (
      (rating.status === "implemented_correctly" ||
        rating.status === "not_applicable") &&
      rating.severity !== "none"
    )
      throw new Error(
        `Criterion ${rating.criterionId} cannot attach a defect to ${rating.status}.`,
      );
    if (
      rating.status === "not_applicable" &&
      (rating.test.testable ||
        rating.test.exists ||
        rating.surfaces.some((surface) => surface.status !== "not_applicable"))
    )
      throw new Error(
        `Criterion ${rating.criterionId} not-applicable judgment contradicts its surfaces or test.`,
      );
  }

  function validateTest(
    criterionId: string,
    test: IEvidenceBenchmarkQualityGrade.ITestAssessment,
  ): void {
    if (
      [
        test.testable,
        test.exists,
        test.executed,
        test.passes,
        test.nonVacuous,
        test.positive,
        test.negative,
        test.boundary,
      ].some((value) => typeof value !== "boolean")
    )
      throw new Error(`${criterionId} test assessment is not boolean.`);
    if (!trimmed(test.counterfactual))
      throw new Error(`${criterionId} test counterfactual is empty.`);
    if (!test.exists && (test.executed || test.passes || test.nonVacuous))
      throw new Error(`${criterionId} claims results for an absent test.`);
    if (!test.executed && (test.passes || test.nonVacuous))
      throw new Error(`${criterionId} claims results for an unexecuted test.`);
    if (!test.testable && test.nonVacuous)
      throw new Error(`${criterionId} marks an untestable clause non-vacuous.`);
    if (
      test.nonVacuous &&
      (!test.exists ||
        !test.executed ||
        !test.passes ||
        ![test.positive, test.negative, test.boundary].some(Boolean))
    )
      throw new Error(
        `${criterionId} non-vacuous test does not reach a passing discriminating assertion.`,
      );
  }

  function ratings(
    submissions: IEvidenceBenchmarkQualityGrade.IBlockSubmission[],
    population: IEvidenceBenchmarkQualityGrade.Population,
  ): IEvidenceBenchmarkQualityGrade.IRating[] {
    return submissions
      .filter((submission) => submission.population === population)
      .flatMap((submission) => structuredClone(submission.output.ratings));
  }

  function requireExactIds(
    ratings: IEvidenceBenchmarkQualityGrade.IRating[],
    expected: string[],
    population: IEvidenceBenchmarkQualityGrade.Population,
  ): void {
    const actual: string[] = ratings.map((rating) => rating.criterionId);
    if (
      JSON.stringify(actual) !== JSON.stringify(expected) ||
      new Set(actual).size !== actual.length
    )
      throw new Error(
        `${population} grade does not equal its exact frozen catalog ID set.`,
      );
  }

  function summarize(
    ratings: IEvidenceBenchmarkQualityGrade.IRating[],
  ): IEvidenceBenchmarkQualityGrade.ISummary {
    const count = (status: IEvidenceBenchmarkQualityGrade.Status): number =>
      ratings.filter((rating) => rating.status === status).length;
    const notApplicable: number = count("not_applicable");
    return {
      populationCount: ratings.length,
      applicable: ratings.length - notApplicable,
      implementedCorrectly: count("implemented_correctly"),
      partial: count("partial"),
      omitted: count("omitted"),
      contradicted: count("contradicted"),
      unverifiable: count("unverifiable"),
      notApplicable,
      testable: ratings.filter((rating) => rating.test.testable).length,
      nonVacuousTested: ratings.filter((rating) => rating.test.nonVacuous)
        .length,
      criticalDefects: ratings.filter(
        (rating) => rating.severity === "critical",
      ).length,
    };
  }

  function requireComparable(
    first: IEvidenceBenchmarkQualityGrade.IGrade,
    second: IEvidenceBenchmarkQualityGrade.IGrade,
  ): void {
    if (
      first.gradeId === second.gradeId ||
      first.grader.pseudonym === second.grader.pseudonym ||
      first.bundleId !== second.bundleId ||
      first.subject !== second.subject ||
      first.phase !== second.phase ||
      first.planSha256 !== second.planSha256 ||
      first.acceptanceCatalogSha256 !== second.acceptanceCatalogSha256 ||
      first.contextCatalogSha256 !== second.contextCatalogSha256
    )
      throw new Error(
        "Quality comparison requires two distinct blind grades over one exact artifact and plan.",
      );
    const firstThreads: Set<string> = new Set(first.sourceThreadIds);
    if (second.sourceThreadIds.some((threadId) => firstThreads.has(threadId)))
      throw new Error("Independent blind graders reused a thread context.");
    const firstResponses: Set<string> = new Set(first.sourceResponseIds);
    if (
      second.sourceResponseIds.some((responseId) =>
        firstResponses.has(responseId),
      )
    )
      throw new Error("Independent blind graders reused an upstream response.");
    requireAligned(first.acceptanceRatings, second.acceptanceRatings);
    requireAligned(first.contextRatings, second.contextRatings);
  }

  function requireAligned(
    first: IEvidenceBenchmarkQualityGrade.IRating[],
    second: IEvidenceBenchmarkQualityGrade.IRating[],
  ): void {
    if (
      JSON.stringify(first.map((rating) => rating.criterionId)) !==
      JSON.stringify(second.map((rating) => rating.criterionId))
    )
      throw new Error(
        "Independent grades do not cover the same criterion order.",
      );
  }

  function comparePopulation(
    population: IEvidenceBenchmarkQualityGrade.Population,
    first: IEvidenceBenchmarkQualityGrade.IRating[],
    second: IEvidenceBenchmarkQualityGrade.IRating[],
  ): IEvidenceBenchmarkQualityGrade.IPopulationComparison {
    const matrix = statusMatrix();
    let exactAgreement: number = 0;
    for (const [index, rating] of first.entries()) {
      const counterpart = second[index]!;
      ++matrix[rating.status][counterpart.status];
      if (rating.status === counterpart.status) ++exactAgreement;
    }
    return {
      population,
      exactAgreement,
      compared: first.length,
      exactAgreementRate:
        first.length === 0 ? 1 : exactAgreement / first.length,
      weightedKappa: weightedKappa(first, second),
      disagreementMatrix: matrix,
    };
  }

  function statusMatrix(): Record<
    IEvidenceBenchmarkQualityGrade.Status,
    Record<IEvidenceBenchmarkQualityGrade.Status, number>
  > {
    return Object.fromEntries(
      STATUSES.map((left) => [
        left,
        Object.fromEntries(STATUSES.map((right) => [right, 0])),
      ]),
    ) as Record<
      IEvidenceBenchmarkQualityGrade.Status,
      Record<IEvidenceBenchmarkQualityGrade.Status, number>
    >;
  }

  function weightedKappa(
    first: IEvidenceBenchmarkQualityGrade.IRating[],
    second: IEvidenceBenchmarkQualityGrade.IRating[],
  ): number | null {
    const ordinal: IEvidenceBenchmarkQualityGrade.Status[] = [
      "contradicted",
      "omitted",
      "unverifiable",
      "partial",
      "implemented_correctly",
    ];
    const pairs: Array<[number, number]> = first.flatMap((rating, index) => {
      const counterpart = second[index]!;
      if (
        rating.status === "not_applicable" ||
        counterpart.status === "not_applicable"
      )
        return [];
      return [
        [ordinal.indexOf(rating.status), ordinal.indexOf(counterpart.status)],
      ];
    });
    if (pairs.length === 0) return null;
    const left: number[] = Array(ordinal.length).fill(0) as number[];
    const right: number[] = Array(ordinal.length).fill(0) as number[];
    let observed: number = 0;
    const denominator: number = (ordinal.length - 1) ** 2;
    for (const [a, b] of pairs) {
      ++left[a]!;
      ++right[b]!;
      observed += (a - b) ** 2 / denominator;
    }
    observed /= pairs.length;
    let expected: number = 0;
    for (const [a, leftCount] of left.entries())
      for (const [b, rightCount] of right.entries())
        expected +=
          (leftCount / pairs.length) *
          (rightCount / pairs.length) *
          ((a - b) ** 2 / denominator);
    if (expected === 0) return observed === 0 ? 1 : null;
    return 1 - observed / expected;
  }

  function stratified(
    ratings: IEvidenceBenchmarkQualityGrade.IRating[],
    seed: string,
    population: IEvidenceBenchmarkQualityGrade.Population,
  ): string[] {
    if (ratings.length === 0) return [];
    return ratings
      .map((rating) => ({
        id: rating.criterionId,
        rank: EvidenceBenchmarkHash.bytes(
          `${seed}\0${population}\0${rating.criterionId}`,
        ),
      }))
      .sort((left, right) => left.rank.localeCompare(right.rank, "en"))
      .slice(0, Math.ceil(ratings.length * 0.2))
      .map((entry) => entry.id);
  }

  function auditPopulation(
    population: IEvidenceBenchmarkQualityGrade.Population,
    first: IEvidenceBenchmarkQualityGrade.IRating[],
    second: IEvidenceBenchmarkQualityGrade.IRating[],
    sample: ReadonlySet<string>,
    hiddenDisagreements: ReadonlySet<string>,
  ): IEvidenceBenchmarkQualityGrade.IAuditItem[] {
    return first.flatMap((rating, index) => {
      const counterpart = second[index]!;
      const reasons: Set<IEvidenceBenchmarkQualityGrade.AuditReason> =
        new Set();
      if (sample.has(rating.criterionId)) reasons.add("stratified_sample");
      if (rating.status !== counterpart.status)
        reasons.add("primary_status_disagreement");
      if (
        ["high", "critical"].includes(rating.severity) ||
        ["high", "critical"].includes(counterpart.severity)
      )
        reasons.add("high_or_critical");
      if (
        rating.status === "not_applicable" ||
        counterpart.status === "not_applicable"
      )
        reasons.add("not_applicable");
      if (
        rating.status === "unverifiable" ||
        counterpart.status === "unverifiable"
      )
        reasons.add("unverifiable");
      if (hiddenDisagreements.has(rating.criterionId))
        reasons.add("hidden_acceptance_disagreement");
      if (reasons.size === 0) return [];
      return [
        {
          population,
          criterionId: rating.criterionId,
          reasons: [...reasons].sort(),
          firstStatus: rating.status,
          secondStatus: counterpart.status,
        },
      ];
    });
  }

  function consensus(
    population: IEvidenceBenchmarkQualityGrade.Population,
    first: IEvidenceBenchmarkQualityGrade.IRating[],
    second: IEvidenceBenchmarkQualityGrade.IRating[],
    decisions: ReadonlyMap<
      string,
      IEvidenceBenchmarkQualityGrade.IAdjudicationDecision
    >,
  ): IEvidenceBenchmarkQualityGrade.IConsensusRating[] {
    const severityOrder: IEvidenceBenchmarkQualityGrade.Severity[] = [
      "none",
      "low",
      "medium",
      "high",
      "critical",
    ];
    return first.map((rating, index) => {
      const counterpart = second[index]!;
      const decision = decisions.get(`${population}\0${rating.criterionId}`);
      if (decision !== undefined)
        return {
          criterionId: rating.criterionId,
          status: decision.rating.status,
          testable: decision.rating.test.testable,
          nonVacuous: decision.rating.test.nonVacuous,
          severity: decision.rating.severity,
          source: "llm_adjudication",
        };
      if (rating.status !== counterpart.status)
        throw new Error(
          `Unaudited status disagreement survived: ${rating.criterionId}.`,
        );
      const severity =
        severityOrder[
          Math.max(
            severityOrder.indexOf(rating.severity),
            severityOrder.indexOf(counterpart.severity),
          )
        ]!;
      return {
        criterionId: rating.criterionId,
        status: rating.status,
        testable: rating.test.testable && counterpart.test.testable,
        nonVacuous: rating.test.nonVacuous && counterpart.test.nonVacuous,
        severity,
        source: "grader_agreement",
      };
    });
  }

  function portable(input: string): boolean {
    return (
      trimmed(input) &&
      !input.includes("\\") &&
      !path.posix.isAbsolute(input) &&
      input
        .split("/")
        .every(
          (segment) => segment !== "" && segment !== "." && segment !== "..",
        )
    );
  }

  function countLines(bytes: Uint8Array, label: string): number {
    let source: string;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(`Grade evidence path is not UTF-8 text: ${label}.`);
    }
    if (source.includes("\r"))
      throw new Error(`Blind bundle text is not frozen LF-only: ${label}.`);
    if (source.length === 0) return 0;
    const lines: string[] = source.split("\n");
    return lines.at(-1) === "" ? lines.length - 1 : lines.length;
  }

  function unit(input: number): boolean {
    return Number.isFinite(input) && input >= 0 && input <= 1;
  }

  function trimmed(input: unknown): input is string {
    return (
      typeof input === "string" && input.length !== 0 && input === input.trim()
    );
  }

  function date(input: string): boolean {
    return trimmed(input) && !Number.isNaN(Date.parse(input));
  }
}
