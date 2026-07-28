/** Exact observations, semantic judgments, and derived activity attribution. */
export namespace IEvidenceBenchmarkActivity {
  /** Pre-registered response-purpose codes, including the honest residual. */
  export type PrimaryActivity =
    | "requirements_reading"
    | "method_reading"
    | "planning_inventory"
    | "implementation"
    | "deterministic_feedback"
    | "ordinary_remediation"
    | "completion_audit"
    | "phase2_discovery"
    | "phase2_fix"
    | "grading"
    | "residual_unclassified";

  /** Method mechanisms retained independently of the primary activity. */
  export type SecondaryMechanism =
    | "direct_method_campaign"
    | "induced_method_campaign"
    | "quality_producing_fix"
    | "shared_product_work";

  /** Causal role used to keep administration separate from quality work. */
  export type CausalRole =
    | "shared"
    | "direct_method_burden"
    | "induced_method_burden"
    | "quality_producing_fix"
    | "residual";

  /** Generation and post-generation phases used by the attribution ledger. */
  export type Phase =
    | "setup"
    | "phase1"
    | "completion_challenge"
    | "phase2_discovery"
    | "phase2_fix"
    | "grading"
    | "terminal";

  /** Exact Codex counters plus one deterministic non-cached derivation. */
  export interface ITokenVector {
    /** Inclusive input count emitted by Codex. */
    inputTokens: number;

    /** Cache-read subset of inclusive input. */
    cachedInputTokens: number;

    /** Cache-write subset of inclusive input. */
    cacheWriteInputTokens: number;

    /** Inclusive input minus both cache subsets. */
    normalizedNonCachedInputTokens: number;

    /** Inclusive output count emitted by Codex. */
    outputTokens: number;

    /** Diagnostic subset of output, never added to total again. */
    reasoningOutputTokens: number;

    /** Provider total emitted by Codex. */
    totalTokens: number;
  }

  /** One exact, unique rawResponse/completed usage row. */
  export interface IResponseUsage {
    responseId: string;
    threadId: string;
    turnId: string;
    phase: Phase;
    receivedAtUtc: string;
    receivedMonotonicNs: string;
    rawEventId: string;
    usage: Omit<ITokenVector, "normalizedNonCachedInputTokens"> | null;
  }

  /** Immutable identity shared by every artifact from one retained run. */
  export interface IBinding {
    schemaVersion: 1;
    exactByteDigestAlgorithm: "sha256(exact-bytes)";
    canonicalObjectDigestAlgorithm: "sha256(utf8-bytewise-key-order-json-lf)";
    runId: string;
    blockId: string;
    parentCoreSealSha256: string;
    protocolRevisionSha256: string;
    codebookSha256: string;
    sourceUsageLedgerSha256: string;
    eventChainTerminalSha256: string;
    providerOutputRegistrySha256: string;
    activityRatingProviderSchemaSha256: string;
    activityRatingLocalSchemaSha256: string;
    adjudicationProviderSchemaSha256: string;
    adjudicationLocalSchemaSha256: string;
  }

  /** Link quality between an item lifecycle and an upstream response. */
  export type Linkage = "ordered_epoch" | "ambiguous" | "unlinked";

  /** Exact item lifecycle evidence; nullable endpoints preserve censoring. */
  export interface IItemObservation {
    observationId: string;
    threadId: string;
    turnId: string;
    itemId: string;
    itemType: string;
    phase: Phase;
    startedAtSourceMs: number | null;
    completedAtSourceMs: number | null;
    startedReceiptMonotonicNs: string | null;
    completedReceiptMonotonicNs: string | null;
    sourceDurationMs: number | null;
    linkedResponseId: string | null;
    linkage: Linkage;
    rawEventIds: readonly string[];
  }

  /** Exact wall interval within which item observations are reconciled. */
  export interface IWallInterval {
    startedMonotonicNs: string;
    completedMonotonicNs: string;
  }

  /** Machine-only observation artifact supplied to isolated raters. */
  export interface IObservations {
    schemaVersion: 1;
    binding: IBinding;
    wall: IWallInterval;
    responses: readonly IResponseUsage[];
    items: readonly IItemObservation[];
    observationSha256: string;
  }

  /** Fixed probability map. Every code must occur and sum to 10,000. */
  export type ProbabilityBasisPoints = Readonly<
    Record<PrimaryActivity, number>
  >;

  /** Provider-facing rating row before local semantic admission. */
  export interface IProviderRating {
    responseId: string;
    probabilityBasisPoints: ProbabilityBasisPoints;
    secondaryMechanisms: readonly SecondaryMechanism[];
    causalRole: CausalRole;
    confidence: number;
    rationale: string;
  }

  /** Provider-facing output of one isolated activity rater turn. */
  export interface IProviderRatingBlock {
    schemaVersion: 1;
    role: "activity_rater";
    runId: string;
    blockId: string;
    responseIds: readonly string[];
    ratings: readonly IProviderRating[];
    status: "completed" | "interrupted" | "failed";
  }

  /** Provenance wrapper kept outside the restricted provider schema. */
  export interface IRaterArtifact {
    schemaVersion: 1;
    binding: IBinding;
    raterId: string;
    threadId: string;
    sessionId: string;
    model: string;
    effort: string;
    turnClass: "activity-rater-a" | "activity-rater-b";
    otherRaterOutputVisible: false;
    aggregateArmResultsVisible: false;
    allowedEvidenceEventIds: readonly string[];
    providerOutput: IProviderRatingBlock;
    providerOutputSha256: string;
    artifactSha256: string;
  }

  /** Generic fresh-adjudicator decision admitted by local activity rules. */
  export interface IProviderAdjudicationDecision {
    itemId: string;
    decision: "rater_a" | "rater_b" | "unresolved";
    confidence: number;
    rationale: string;
  }

  /** Provider-facing output of the fresh AI adjudicator. */
  export interface IProviderAdjudication {
    schemaVersion: 1;
    role: "llm_adjudicator";
    adjudicationId: string;
    bundleId: string;
    subject: "todo" | "reddit" | "shopping" | "erp";
    phase: "t_done" | "t_dry";
    population: "activity";
    sealedInputsSha256: string;
    queueSha256: string;
    decisions: readonly IProviderAdjudicationDecision[];
    status: "completed" | "interrupted" | "failed";
  }

  /** Provenance wrapper proving the adjudicator is fresh and input-bound. */
  export interface IAdjudicatorArtifact {
    schemaVersion: 1;
    binding: IBinding;
    adjudicatorId: string;
    threadId: string;
    sessionId: string;
    model: string;
    effort: string;
    raterArtifactSha256: readonly [string, string];
    providerOutput: IProviderAdjudication;
    providerOutputSha256: string;
    artifactSha256: string;
  }

  /** One queued unit and every deterministic reason it needs fresh review. */
  export interface IAdjudicationQueueEntry {
    responseId: string;
    reasons: readonly (
      | "primary_disagreement"
      | "causal_role_disagreement"
      | "mechanism_disagreement"
      | "low_confidence"
      | "low_peak_probability"
      | "residual_probability"
      | "missing_evidence_reference"
      | "high_token_influence"
    )[];
  }

  /** Exact integers divided by 10,000, represented without floating drift. */
  export interface IWeightedTokenVector {
    denominator: 10000;
    inputTokensNumerator: string;
    cachedInputTokensNumerator: string;
    cacheWriteInputTokensNumerator: string;
    normalizedNonCachedInputTokensNumerator: string;
    outputTokensNumerator: string;
    reasoningOutputTokensNumerator: string;
    totalTokensNumerator: string;
  }

  /** Point, lower, and upper semantic allocations for one category. */
  export interface ITokenAllocation {
    primary: PrimaryActivity;
    wholeResponseExact: ITokenVector;
    estimatedPoint: IWeightedTokenVector;
    estimatedLower: IWeightedTokenVector;
    estimatedUpper: IWeightedTokenVector;
  }

  /** Point and uncertainty timing with exact observed interval provenance. */
  export interface ITimeAllocation {
    primary: PrimaryActivity;
    categoryUnionWallNs: string;
    sourceActivityTimeMs: number;
    exclusiveEquivalentWallNs: string;
    estimatedPointActivityNsNumerator: string;
    estimatedLowerActivityNsNumerator: string;
    estimatedUpperActivityNsNumerator: string;
    estimatedDenominator: 10000;
  }

  /** Pairwise overlap between two point-classified activity categories. */
  export interface ITimeOverlap {
    left: PrimaryActivity;
    right: PrimaryActivity;
    overlapWallNs: string;
  }

  /** Direct and induced method burdens remain separate report rows. */
  export interface IBurdenAllocation {
    causalRole: CausalRole;
    exactWholeResponseTokens: ITokenVector;
    estimatedPointTokens: IWeightedTokenVector;
    estimatedPointActivityNsNumerator: string;
    estimatedDenominator: 10000;
  }

  /** Deterministic output derived from exact observations and semantic ratings. */
  export interface IReport {
    schemaVersion: 1;
    binding: IBinding;
    observationSha256: string;
    raterArtifactSha256: readonly [string, string];
    adjudicationArtifactSha256: string | null;
    exactMeasurementStatus: "complete" | "right_censored";
    semanticAttributionStatus: "complete" | "incomplete";
    semanticQuantitiesAreEstimates: true;
    exactTotal: ITokenVector;
    tokenAllocations: readonly ITokenAllocation[];
    timeAllocations: readonly ITimeAllocation[];
    pairwiseOverlap: readonly ITimeOverlap[];
    burdenAllocations: readonly IBurdenAllocation[];
    adjudicationQueue: readonly IAdjudicationQueueEntry[];
    unresolvedResponseIds: readonly string[];
    censoredObservationIds: readonly string[];
    wallTimeNs: string;
    coveredUnionWallNs: string;
    residualWallNs: string;
    exactTokenReconciled: boolean;
    exclusiveWallReconciled: boolean;
    reportSha256: string;
  }
}
