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
    /** Upstream response ID used as the global deduplication key. */
    responseId: string;

    /** Primary or descendant thread charged for this response. */
    threadId: string;

    /** Turn that issued this upstream response. */
    turnId: string;

    /** Frozen harness phase at response completion. */
    phase: Phase;

    /** UTC receipt timestamp preserved from the runner. */
    receivedAtUtc: string;

    /** Monotonic runner receipt time encoded as integer nanoseconds. */
    receivedMonotonicNs: string;

    /** Exact semantic-event identity pointing to retained raw bytes. */
    rawEventId: string;

    /** Provider counters, or null when exact measurement was censored. */
    usage: Omit<ITokenVector, "normalizedNonCachedInputTokens"> | null;
  }

  /** Immutable identity shared by every artifact from one retained run. */
  export interface IBinding {
    /** Activity artifact schema revision. */
    schemaVersion: 1;

    /** Algorithm applied to retained ledger and seal bytes. */
    exactByteDigestAlgorithm: "sha256(exact-bytes)";

    /** Algorithm applied to activity-owned canonical JSON artifacts. */
    canonicalObjectDigestAlgorithm: "sha256(utf8-bytewise-key-order-json-lf)";

    /** Versioned materialization tree algorithm from the frozen input. */
    frozenInputTreeAlgorithm: "sha256-posix-path-nul-bytes-v1";

    /** Globally unique retained run identity. */
    runId: string;

    /** Concurrent campaign block identity. */
    blockId: string;

    /** Frozen benchmark subject. */
    subject: "todo" | "reddit" | "shopping" | "erp";

    /** Frozen mechanism arm. */
    arm: "plain" | "evidence";

    /** Frozen replicate number. */
    replicate: number;

    /** Snapshot milestone whose activity is being attributed. */
    milestone: "t_done" | "t_dry";

    /** Frozen shared-template tree identity. */
    baseTreeSha256: string;

    /** Frozen arm-overlay tree identity. */
    armTreeSha256: string;

    /** Frozen requirements tree identity. */
    requirementsTreeSha256: string;

    /** Materialized workspace tree identity before agent work. */
    workspaceTreeSha256: string;

    /** Aggregate materialization input identity. */
    materializationInputSha256: string;

    /** Exact-byte identity of the materialization manifest. */
    materializationManifestSha256: string;

    /** Exact-byte identity of the immutable outer run manifest. */
    runManifestSha256: string;

    /** Exact-byte identity of the immutable terminal core seal. */
    parentCoreSealSha256: string;

    /** Frozen benchmark protocol revision identity. */
    protocolRevisionSha256: string;

    /** Frozen activity codebook identity. */
    codebookSha256: string;

    /** Exact-byte identity of the source usage ledger. */
    sourceUsageLedgerSha256: string;

    /** Terminal identity of the append-only semantic event chain. */
    eventChainTerminalSha256: string;

    /** Exact-byte identity of the provider output registry. */
    providerOutputRegistrySha256: string;

    /** Provider-facing activity rating schema identity. */
    activityRatingProviderSchemaSha256: string;

    /** Local activity rating schema identity. */
    activityRatingLocalSchemaSha256: string;

    /** Provider-facing fresh adjudication schema identity. */
    adjudicationProviderSchemaSha256: string;

    /** Local fresh adjudication schema identity. */
    adjudicationLocalSchemaSha256: string;
  }

  /** Link quality between an item lifecycle and an upstream response. */
  export type Linkage = "ordered_epoch" | "ambiguous" | "unlinked";

  /** Exact item lifecycle evidence; nullable endpoints preserve censoring. */
  export interface IItemObservation {
    /** Globally unique activity observation identity. */
    observationId: string;

    /** Thread that emitted the item lifecycle. */
    threadId: string;

    /** Turn that emitted the item lifecycle. */
    turnId: string;

    /** App-server item identity. */
    itemId: string;

    /** App-server item discriminator retained without semantic inference. */
    itemType: string;

    /** Frozen harness phase at item observation. */
    phase: Phase;

    /** Source-provided epoch start milliseconds, when present. */
    startedAtSourceMs: number | null;

    /** Source-provided epoch completion milliseconds, when present. */
    completedAtSourceMs: number | null;

    /** Runner receipt start in monotonic nanoseconds, when observed. */
    startedReceiptMonotonicNs: string | null;

    /** Runner receipt completion in monotonic nanoseconds, when observed. */
    completedReceiptMonotonicNs: string | null;

    /** Source-reported activity duration, kept apart from lifecycle wall. */
    sourceDurationMs: number | null;

    /** Ordered-epoch response candidate, never asserted as an exact join. */
    linkedResponseId: string | null;

    /** Mechanical quality of the response candidate linkage. */
    linkage: Linkage;

    /** Exact event identities backing both lifecycle endpoints. */
    rawEventIds: readonly string[];
  }

  /** Exact wall interval within which item observations are reconciled. */
  export interface IWallInterval {
    /** Cell wall start in monotonic nanoseconds. */
    startedMonotonicNs: string;

    /** Cell wall completion in monotonic nanoseconds. */
    completedMonotonicNs: string;
  }

  /** Machine-only observation artifact supplied to isolated raters. */
  export interface IObservations {
    /** Observation artifact schema revision. */
    schemaVersion: 1;

    /** Immutable run, input, ledger, registry, and core identities. */
    binding: IBinding;

    /** Complete cell wall used by interval reconciliation. */
    wall: IWallInterval;

    /** Exact usage rows, including nullable right-censored rows. */
    responses: readonly IResponseUsage[];

    /** Source-ledger completeness flag retained without reconstruction. */
    sourceExactUsageComplete: boolean;

    /** Exact and censored item lifecycle observations. */
    items: readonly IItemObservation[];

    /** Canonical identity of this observation artifact without this field. */
    observationSha256: string;
  }

  /** Fixed probability map. Every code must occur and sum to 10,000. */
  export type ProbabilityBasisPoints = Readonly<
    Record<PrimaryActivity, number>
  >;

  /** Provider-facing rating row before local semantic admission. */
  export interface IProviderRating {
    /** Exact response unit being rated. */
    responseId: string;

    /** Full frozen-code probability vector summing to 10,000. */
    probabilityBasisPoints: ProbabilityBasisPoints;

    /** Non-primary method mechanisms supported by event evidence. */
    secondaryMechanisms: readonly SecondaryMechanism[];

    /** Causal role separating direct procedure from quality work. */
    causalRole: CausalRole;

    /** Semantic confidence in the half-open interval from zero to one. */
    confidence: number;

    /** Short explanation with sealed `[[event:...]]` citations. */
    rationale: string;
  }

  /** Provider-facing output of one isolated activity rater turn. */
  export interface IProviderRatingBlock {
    /** Provider output schema revision. */
    schemaVersion: 1;

    /** Fixed model-facing role discriminator. */
    role: "activity_rater";

    /** Bound retained run identity. */
    runId: string;

    /** Bound concurrent campaign block identity. */
    blockId: string;

    /** Exact response population assigned to this rater. */
    responseIds: readonly string[];

    /** One rating per exact response. */
    ratings: readonly IProviderRating[];

    /** Provider turn outcome retained without silent retry. */
    status: "completed" | "interrupted" | "failed";
  }

  /** Provenance wrapper kept outside the restricted provider schema. */
  export interface IRaterArtifact {
    /** Rater wrapper schema revision. */
    schemaVersion: 1;

    /** Immutable activity binding. */
    binding: IBinding;

    /** Stable logical rater identity. */
    raterId: string;

    /** Dedicated Codex thread identity. */
    threadId: string;

    /** Dedicated controller session identity. */
    sessionId: string;

    /** Effective model identity. */
    model: string;

    /** Effective reasoning effort. */
    effort: string;

    /** Registry-admitted isolated turn class. */
    turnClass: "activity-rater-a" | "activity-rater-b";

    /** Proof that the other rater output was withheld. */
    otherRaterOutputVisible: false;

    /** Proof that arm aggregate results were withheld. */
    aggregateArmResultsVisible: false;

    /** Complete event-ID allowlist in the sealed evidence window. */
    allowedEvidenceEventIds: readonly string[];

    /** Restricted provider-facing rating output. */
    providerOutput: IProviderRatingBlock;

    /** Canonical provider-output identity. */
    providerOutputSha256: string;

    /** Canonical wrapper identity without this field. */
    artifactSha256: string;
  }

  /** Generic fresh-adjudicator decision admitted by local activity rules. */
  export interface IProviderAdjudicationDecision {
    /** Queued response identity. */
    itemId: string;

    /** Selected independent rating or honest unresolved outcome. */
    decision: "rater_a" | "rater_b" | "unresolved";

    /** Semantic confidence in the half-open interval from zero to one. */
    confidence: number;

    /** Short explanation with sealed `[[event:...]]` citations. */
    rationale: string;
  }

  /** Provider-facing output of the fresh AI adjudicator. */
  export interface IProviderAdjudication {
    /** Generic adjudication provider schema revision. */
    schemaVersion: 1;

    /** Fixed fresh-adjudicator role discriminator. */
    role: "llm_adjudicator";

    /** Unique adjudication operation identity. */
    adjudicationId: string;

    /** Sealed activity input bundle identity. */
    bundleId: string;

    /** Benchmark subject owning the rated responses. */
    subject: "todo" | "reddit" | "shopping" | "erp";

    /** Grading milestone at which attribution is reported. */
    phase: "t_done" | "t_dry";

    /** Fixed activity population discriminator. */
    population: "activity";

    /** Digest binding observations, raters, queue, codebook, and core. */
    sealedInputsSha256: string;

    /** Canonical deterministic queue identity. */
    queueSha256: string;

    /** One fresh decision per queued response. */
    decisions: readonly IProviderAdjudicationDecision[];

    /** Provider turn outcome retained without silent retry. */
    status: "completed" | "interrupted" | "failed";
  }

  /** Provenance wrapper proving the adjudicator is fresh and input-bound. */
  export interface IAdjudicatorArtifact {
    /** Adjudicator wrapper schema revision. */
    schemaVersion: 1;

    /** Immutable activity binding. */
    binding: IBinding;

    /** Stable adjudicator identity distinct from both raters. */
    adjudicatorId: string;

    /** Fresh Codex thread identity. */
    threadId: string;

    /** Fresh controller session identity. */
    sessionId: string;

    /** Effective model identity. */
    model: string;

    /** Effective reasoning effort. */
    effort: string;

    /** Ordered identities of both sealed rater artifacts. */
    raterArtifactSha256: readonly [string, string];

    /** Restricted provider-facing adjudication output. */
    providerOutput: IProviderAdjudication;

    /** Canonical provider-output identity. */
    providerOutputSha256: string;

    /** Canonical wrapper identity without this field. */
    artifactSha256: string;
  }

  /** One queued unit and every deterministic reason it needs fresh review. */
  export interface IAdjudicationQueueEntry {
    /** Exact response requiring fresh adjudication. */
    responseId: string;

    /** Complete set of deterministic queue triggers. */
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
    /** Frozen basis-point denominator. */
    denominator: 10000;

    /** Inclusive input token numerator. */
    inputTokensNumerator: string;

    /** Cache-read input token numerator. */
    cachedInputTokensNumerator: string;

    /** Cache-write input token numerator. */
    cacheWriteInputTokensNumerator: string;

    /** Normalized non-cached input token numerator. */
    normalizedNonCachedInputTokensNumerator: string;

    /** Inclusive output token numerator. */
    outputTokensNumerator: string;

    /** Reasoning-output subset numerator. */
    reasoningOutputTokensNumerator: string;

    /** Provider total token numerator. */
    totalTokensNumerator: string;
  }

  /** Point, lower, and upper semantic allocations for one category. */
  export interface ITokenAllocation {
    /** Frozen primary category represented by this row. */
    primary: PrimaryActivity;

    /** Exact response counters grouped under estimated point labels. */
    wholeResponseExact: ITokenVector;

    /** Probability-weighted point estimate. */
    estimatedPoint: IWeightedTokenVector;

    /** Inter-rater probability lower bound. */
    estimatedLower: IWeightedTokenVector;

    /** Inter-rater probability upper bound. */
    estimatedUpper: IWeightedTokenVector;
  }

  /** Point and uncertainty timing with exact observed interval provenance. */
  export interface ITimeAllocation {
    /** Frozen primary category represented by this row. */
    primary: PrimaryActivity;

    /** Point-category lifecycle union in nanoseconds. */
    categoryUnionWallNs: string;

    /** Sum of source-reported item durations in milliseconds. */
    sourceActivityTimeMs: number;

    /** Deterministically reconciled share of complete cell wall. */
    exclusiveEquivalentWallNs: string;

    /** Probability-weighted lifecycle point numerator. */
    estimatedPointActivityNsNumerator: string;

    /** Inter-rater lifecycle lower-bound numerator. */
    estimatedLowerActivityNsNumerator: string;

    /** Inter-rater lifecycle upper-bound numerator. */
    estimatedUpperActivityNsNumerator: string;

    /** Frozen basis-point denominator for all lifecycle estimates. */
    estimatedDenominator: 10000;
  }

  /** Pairwise overlap between two point-classified activity categories. */
  export interface ITimeOverlap {
    /** Earlier category in frozen codebook order. */
    left: PrimaryActivity;

    /** Later category in frozen codebook order. */
    right: PrimaryActivity;

    /** Lifecycle union overlap in nanoseconds. */
    overlapWallNs: string;
  }

  /** Direct and induced method burdens remain separate report rows. */
  export interface IBurdenAllocation {
    /** Frozen causal role represented by this row. */
    causalRole: CausalRole;

    /** Exact response counters grouped under estimated causal roles. */
    exactWholeResponseTokens: ITokenVector;

    /** Estimated role allocation of exact response counters. */
    estimatedPointTokens: IWeightedTokenVector;

    /** Point-role lifecycle activity numerator. */
    estimatedPointActivityNsNumerator: string;

    /** Frozen basis-point denominator. */
    estimatedDenominator: 10000;
  }

  /** Deterministic output derived from exact observations and semantic ratings. */
  export interface IReport {
    /** Activity report schema revision. */
    schemaVersion: 1;

    /** Immutable run, input, registry, ledger, and core binding. */
    binding: IBinding;

    /** Exact source observation artifact identity. */
    observationSha256: string;

    /** Ordered independent rater artifact identities. */
    raterArtifactSha256: readonly [string, string];

    /** Fresh adjudicator identity, or null when unavailable. */
    adjudicationArtifactSha256: string | null;

    /** Completeness of exact response and item observations. */
    exactMeasurementStatus: "complete" | "right_censored";

    /** Completeness of semantic classification and adjudication. */
    semanticAttributionStatus: "complete" | "incomplete";

    /** Explicit boundary preventing semantic allocations from reading as facts. */
    semanticQuantitiesAreEstimates: true;

    /** Exact sum of every non-null unique response row. */
    exactTotal: ITokenVector;

    /** Exact-under-label and probability-weighted token tables. */
    tokenAllocations: readonly ITokenAllocation[];

    /** Union, activity, exclusive, and probability timing rows. */
    timeAllocations: readonly ITimeAllocation[];

    /** Pairwise point-category lifecycle overlap rows. */
    pairwiseOverlap: readonly ITimeOverlap[];

    /** Separate shared, direct, induced, quality, and residual burden rows. */
    burdenAllocations: readonly IBurdenAllocation[];

    /** Deterministic fresh-adjudication queue. */
    adjudicationQueue: readonly IAdjudicationQueueEntry[];

    /** Responses still semantically unresolved after available judgment. */
    unresolvedResponseIds: readonly string[];

    /** Item observations with one or both lifecycle endpoints absent. */
    censoredObservationIds: readonly string[];

    /** Complete cell wall in monotonic nanoseconds. */
    wallTimeNs: string;

    /** Union of all complete observed item lifecycles. */
    coveredUnionWallNs: string;

    /** Union of residual point segments and uncovered wall. */
    residualWallNs: string;

    /** Proof that exact and point token tables reconcile. */
    exactTokenReconciled: boolean;

    /** Proof that exclusive-equivalent rows reconcile to cell wall. */
    exclusiveWallReconciled: boolean;

    /** Canonical report identity without this field. */
    reportSha256: string;
  }
}
