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

    /** Exact ordered phase segment containing this response completion. */
    phaseSegmentId: string;

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

    /** Exact-byte identity of the append-only semantic event ledger. */
    sourceEventLedgerSha256: string;

    /** Exact-byte identity of the runner-owned activity lifecycle ledger. */
    sourceActivityLedgerSha256: string;

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

    /** Local runner process-identity schema identity. */
    activityProcessIdentitySchemaSha256: string;

    /** Local model-execution provenance schema identity. */
    activityExecutionSchemaSha256: string;
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

    /** Exact ordered phase segment containing this item lifecycle. */
    phaseSegmentId: string;

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

  /** One exact ordered segment in the non-overlapping runner wall. */
  export interface IPhaseSegment {
    /** Globally unique segment identity assigned in runner order. */
    phaseSegmentId: string;

    /** Frozen harness phase represented by this segment. */
    phase: Phase;

    /** Exact monotonic wall for this segment. */
    wall: IWallInterval;
  }

  /** Machine-only observation artifact supplied to isolated raters. */
  export interface IObservations {
    /** Observation artifact schema revision. */
    schemaVersion: 1;

    /** Immutable run, input, ledger, registry, and core identities. */
    binding: IBinding;

    /** Complete cell wall used by interval reconciliation. */
    wall: IWallInterval;

    /** Ordered contiguous segment partition of the complete cell wall. */
    phaseSegments: readonly IPhaseSegment[];

    /** Exact usage rows, including nullable right-censored rows. */
    responses: readonly IResponseUsage[];

    /** Source-ledger completeness flag retained without reconstruction. */
    sourceExactUsageComplete: boolean;

    /** Runner assertion that every semantic event was durably captured. */
    sourceEventCaptureComplete: boolean;

    /** Runner assertion that the event chain was closed before sealing. */
    sourceEventChainClosed: boolean;

    /** Catalog-order identities of every verified event-chain member. */
    eventIds: readonly string[];

    /** Runner assertion that every activity lifecycle was durably captured. */
    sourceActivityCaptureComplete: boolean;

    /** Runner assertion that the activity ledger was closed before sealing. */
    sourceActivityLedgerClosed: boolean;

    /** Exact and censored item lifecycle observations. */
    items: readonly IItemObservation[];

    /** Canonical identity of this observation artifact without this field. */
    observationSha256: string;
  }

  /** Runner-issued sealed input assignment for one independent rater. */
  export interface IRaterAssignment {
    /** Assignment schema revision. */
    schemaVersion: 1;

    /** Fixed owner of the assignment record. */
    issuer: "runner";

    /** Globally unique assignment identity. */
    assignmentId: string;

    /** Immutable activity binding. */
    binding: IBinding;

    /** Exact observation artifact supplied to the rater. */
    observationSha256: string;

    /** Frozen codebook supplied to the rater. */
    codebookSha256: string;

    /** Stable logical rater identity. */
    raterId: string;

    /** Dedicated Codex thread identity. */
    threadId: string;

    /** Dedicated controller session identity. */
    sessionId: string;

    /** Effective model identity. */
    model: "gpt-5.6-terra";

    /** Effective reasoning effort. */
    effort: "high";

    /** Registry-admitted isolated turn class. */
    turnClass: "activity-rater-a" | "activity-rater-b";

    /** Exact catalog-order response population. */
    responseIds: readonly string[];

    /** Complete event-ID allowlist in the sealed evidence window. */
    allowedEvidenceEventIds: readonly string[];

    /** Proof that the other rater output was withheld. */
    otherRaterOutputVisible: false;

    /** Proof that arm aggregate results were withheld. */
    aggregateArmResultsVisible: false;

    /** Runner process provenance for the issued turn. */
    processProvenanceSha256: string;

    /** UTC assignment creation time retained by the runner. */
    issuedAtUtc: string;

    /** Digest of every semantic input presented to the rater. */
    sealedInputsSha256: string;

    /** Canonical assignment identity without this field. */
    assignmentSha256: string;
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

    /** Runner-issued record that seals identity, isolation, and all inputs. */
    assignment: IRaterAssignment;

    /** Exact runner-issued assignment identity. */
    assignmentSha256: string;

    /** Restricted provider-facing rating output. */
    providerOutput: IProviderRatingBlock;

    /** Canonical provider-output identity. */
    providerOutputSha256: string;

    /** Exact runner execution that produced the provider output. */
    execution: IModelExecutionProvenance;

    /** Canonical wrapper identity without this field. */
    artifactSha256: string;
  }

  /** Runner-issued sealed input assignment for the fresh adjudicator. */
  export interface IAdjudicatorAssignment {
    /** Assignment schema revision. */
    schemaVersion: 1;

    /** Fixed owner of the assignment record. */
    issuer: "runner";

    /** Globally unique assignment identity. */
    assignmentId: string;

    /** Immutable activity binding. */
    binding: IBinding;

    /** Exact observation artifact supplied to adjudication. */
    observationSha256: string;

    /** Stable adjudicator identity distinct from both raters. */
    adjudicatorId: string;

    /** Fresh Codex thread identity. */
    threadId: string;

    /** Fresh controller session identity. */
    sessionId: string;

    /** Effective model identity. */
    model: "gpt-5.6-terra";

    /** Effective reasoning effort. */
    effort: "high";

    /** Ordered identities of both sealed rater artifacts. */
    raterArtifactSha256: readonly [string, string];

    /** Canonical deterministic queue identity. */
    queueSha256: string;

    /** Complete event-ID allowlist in the sealed evidence window. */
    allowedEvidenceEventIds: readonly string[];

    /** Runner process provenance for the issued turn. */
    processProvenanceSha256: string;

    /** UTC assignment creation time retained by the runner. */
    issuedAtUtc: string;

    /** Digest of observations, raters, queue, codebook, and parent core. */
    sealedInputsSha256: string;

    /** Canonical assignment identity without this field. */
    assignmentSha256: string;
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

    /** Runner-issued record that seals fresh identity and all inputs. */
    assignment: IAdjudicatorAssignment;

    /** Exact runner-issued assignment identity. */
    assignmentSha256: string;

    /** Restricted provider-facing adjudication output. */
    providerOutput: IProviderAdjudication;

    /** Canonical provider-output identity. */
    providerOutputSha256: string;

    /** Exact runner execution that produced the provider output. */
    execution: IModelExecutionProvenance;

    /** Canonical wrapper identity without this field. */
    artifactSha256: string;
  }

  /** Exact process identity serialized under the pinned local schema. */
  export interface IProcessIdentityArtifact {
    /** Identity schema revision. */
    schemaVersion: 1;

    /** Fixed model provider. */
    provider: "openai";

    /** Fixed ChatGPT authorization class. */
    authenticationClass: "chatgpt";

    /** Frozen Codex CLI release. */
    codexCliVersion: "0.145.0";

    /** Frozen Codex executable identity. */
    codexExecutableSha256: string;

    /** Effective model identity. */
    model: "gpt-5.6-terra";

    /** Effective reasoning effort. */
    effort: "high";

    /** Proof that no service tier was sent on the wire. */
    requestedServiceTierMode: "omitted";

    /** Literal omitted wire value retained locally. */
    requestedServiceTier: null;

    /** Required standard-tier thread-start response value. */
    effectiveServiceTier: null;

    /** Runner-generated process-instance nonce. */
    processInstanceId: string;

    /** Operating-system process identifier. */
    processId: number;

    /** UTC process spawn time. */
    startedAtUtc: string;

    /** Monotonic process spawn time in nanoseconds. */
    startedMonotonicNs: string;

    /** Exact app-server invocation vector. */
    invocation: readonly string[];

    /** Canonical identity without this field. */
    identitySha256: string;
  }

  /** Exact runner-owned model execution linked to retained raw events. */
  export interface IModelExecutionProvenance {
    /** Execution schema revision. */
    schemaVersion: 1;

    /** Fixed provenance owner. */
    issuer: "runner";

    /** Pinned local execution schema path. */
    executionSchemaPath: "benchmark/protocol/schema/activity-execution.schema.json";

    /** Pinned local execution schema digest. */
    executionSchemaSha256: string;

    /** Runner assignment executed by this turn. */
    assignmentSha256: string;

    /** Activity role executed by this turn. */
    agentRole: "activity-rater-a" | "activity-rater-b" | "activity-adjudicator";

    /** App-server thread identity. */
    threadId: string;

    /** Controller session identity. */
    sessionId: string;

    /** App-server turn identity. */
    turnId: string;

    /** Unique upstream response identity. */
    responseId: string;

    /** Raw response-completed event hash. */
    rawEventId: string;

    /** Assignment-issued runner event hash. */
    assignmentEventId: string;

    /** App-server process-start runner event hash. */
    processStartedEventId: string;

    /** Turn-started runner event hash. */
    turnStartedEventId: string;

    /** Assignment creation time in monotonic nanoseconds. */
    assignmentMonotonicNs: string;

    /** Turn-start receipt time in monotonic nanoseconds. */
    turnStartedMonotonicNs: string;

    /** Response receipt time in monotonic nanoseconds. */
    responseReceivedMonotonicNs: string;

    /** Response receipt UTC retained from the runner. */
    responseReceivedAtUtc: string;

    /** Exact non-null provider counters for this rating request. */
    responseUsage: Omit<ITokenVector, "normalizedNonCachedInputTokens">;

    /** Exact provider output produced by this response. */
    providerOutputSha256: string;

    /** Exact item-completed event carrying the structured output text. */
    itemCompletedEventId: string;

    /** Terminal agent-message item identity. */
    structuredOutputItemId: string;

    /** Exact retained item-completed envelope ledger path. */
    structuredOutputEnvelopePath: "logs/server.raw.jsonl";

    /** Byte offset of the item-completed envelope in the raw ledger. */
    structuredOutputEnvelopeByteOffset: number;

    /** Exact retained item-completed envelope byte length. */
    structuredOutputEnvelopeBytes: number;

    /** Exact retained item-completed envelope digest. */
    structuredOutputEnvelopeSha256: string;

    /** Exact retained raw app-server envelope byte length. */
    rawResponseEnvelopeBytes: number;

    /** Retained raw app-server envelope ledger path. */
    rawResponseEnvelopePath: "logs/server.raw.jsonl";

    /** Byte offset of the retained envelope in the raw ledger. */
    rawResponseEnvelopeByteOffset: number;

    /** Exact retained raw app-server envelope digest. */
    rawResponseEnvelopeSha256: string;

    /** Pinned local identity schema path. */
    processIdentitySchemaPath: "benchmark/protocol/schema/activity-process-identity.schema.json";

    /** Pinned local identity schema digest. */
    processIdentitySchemaSha256: string;

    /** Portable retained process-identity artifact path. */
    processIdentityArtifactPath: string;

    /** Exact retained process-identity artifact byte length. */
    processIdentityArtifactBytes: number;

    /** Exact retained process-identity artifact digest. */
    processIdentityArtifactSha256: string;

    /** Exact retained evaluation event-ledger digest. */
    eventLedgerSha256: string;

    /** Terminal evaluation event-chain identity. */
    eventChainHeadSha256: string;

    /** Exact retained evaluation usage-ledger digest. */
    usageLedgerSha256: string;

    /** Canonical execution identity without this field. */
    executionSha256: string;
  }

  /** Exact retained bytes needed to admit one model execution. */
  export interface IModelExecutionEvidence {
    /** Exact frozen Codex RawResponseCompletedNotification schema bytes. */
    rawResponseCompletedSchemaBytes: Uint8Array;

    /** Exact frozen Codex ItemCompletedNotification schema bytes. */
    itemCompletedSchemaBytes: Uint8Array;

    /** Exact evaluation event-ledger JSONL bytes. */
    eventLedgerBytes: Uint8Array;

    /** Exact evaluation usage-ledger JSON bytes. */
    usageLedgerBytes: Uint8Array;

    /** Exact process-identity artifact JSON bytes. */
    processIdentityArtifactBytes: Uint8Array;

    /** Exact raw app-server response-completed envelope bytes. */
    rawResponseEnvelopeBytes: Uint8Array;

    /** Exact item-completed envelope containing structured output text. */
    structuredOutputEnvelopeBytes: Uint8Array;
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

  /** Inter-rater agreement over the complete exact response population. */
  export interface IAgreement {
    /** Number of response units independently rated by both raters. */
    responseCount: number;

    /** Fraction of identical maximum-probability primary codes. */
    primaryObservedAgreement: number;

    /** Cohen kappa, or null when the marginal denominator degenerates. */
    primaryCohenKappa: number | null;

    /** Fraction of identical causal-role choices. */
    causalRoleAgreement: number;

    /** Mean Jaccard similarity of secondary mechanism sets. */
    meanSecondaryMechanismJaccard: number;

    /** Mean Jensen-Shannon divergence of primary distributions in bits. */
    meanProbabilityJensenShannonBits: number;
  }

  /** Phase-specific semantic allocations aggregated across exact segments. */
  export interface IPhaseAllocation {
    /** Frozen phase label represented by this aggregate row. */
    phase: Phase;

    /** Ordered exact segments included in this phase aggregate. */
    phaseSegmentIds: readonly string[];

    /** Sum of exact segment wall durations in nanoseconds. */
    wallTimeNs: string;

    /** Exact sum of non-null response usage observed in this phase. */
    exactTotal: ITokenVector;

    /** Exact-under-label and weighted token rows for this phase. */
    tokenAllocations: readonly ITokenAllocation[];

    /** Union, activity, exclusive, and weighted timing rows for this phase. */
    timeAllocations: readonly ITimeAllocation[];

    /** Pairwise point-category lifecycle overlap within this phase. */
    pairwiseOverlap: readonly ITimeOverlap[];

    /** Separate causal burden rows within this phase. */
    burdenAllocations: readonly IBurdenAllocation[];

    /** Union of complete observed item lifecycles in this phase. */
    coveredUnionWallNs: string;

    /** Residual point and uncovered wall within this phase. */
    residualWallNs: string;

    /** Item observations censored within this phase. */
    censoredObservationIds: readonly string[];

    /** Proof that exact and point phase token tables reconcile. */
    exactTokenReconciled: boolean;

    /** Proof that phase exclusive rows reconcile to the phase wall. */
    exclusiveWallReconciled: boolean;

    /** Explicit boundary preventing phase allocations from reading as facts. */
    semanticQuantitiesAreEstimates: true;
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

    /** Complete semantic allocation aggregated by frozen phase label. */
    phaseAllocations: readonly IPhaseAllocation[];

    /** Agreement statistics computed before fresh adjudication. */
    raterAgreement: IAgreement;

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
