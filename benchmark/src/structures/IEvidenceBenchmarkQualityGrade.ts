/** Contracts shared by deterministic quality grading and report production. */
export namespace IEvidenceBenchmarkQualityGrade {
  /** Benchmark application subject. */
  export type Subject = "todo" | "reddit" | "shopping" | "erp";

  /** Immutable source milestone presented to blind graders. */
  export type Phase = "t_done" | "t_dry";

  /** Independently scored requirement population. */
  export type Population = "acceptance" | "context";

  /** Primary semantic judgment for one frozen criterion. */
  export type Status =
    | "implemented_correctly"
    | "partial"
    | "omitted"
    | "contradicted"
    | "unverifiable"
    | "not_applicable";

  /** Judgment for one product surface required by a criterion. */
  export type SurfaceStatus =
    "correct" | "partial" | "missing" | "wrong" | "not_applicable";

  /** Defect class kept separate from severity and semantic status. */
  export type DefectClass =
    | "unacknowledged_in_denominator"
    | "configuration_coverage"
    | "false_acknowledgement"
    | "partial_implementation"
    | "semantic_defect"
    | "test_oracle_gap"
    | "non_defect";

  /** Impact assigned to one criterion judgment. */
  export type Severity = "none" | "low" | "medium" | "high" | "critical";

  /** Arm guess recorded only after blind semantic grading. */
  export type ArmGuess = "plain" | "evidence" | "unknown";

  /** One frozen catalog row and its heading ownership. */
  export interface IClause {
    /** Exact immutable criterion identifier. */
    id: string;

    /** Exact H2 or H3 requirement identifier that owns the criterion. */
    requirement: string;

    /** Numbered Markdown source path inside the requirement corpus. */
    source: string;

    /** Observable frozen acceptance or context statement. */
    criterion: string;

    /** Independently scored population selected by the source catalog. */
    population: Population;

    /** Owning H2 requirement group resolved from Markdown order. */
    h2: string;

    /** Owning H3 leaf, absent for an H2 context criterion. */
    h3: string | null;
  }

  /** Validated immutable requirement catalog for one subject. */
  export interface ICatalog {
    /** Catalog format version. */
    schemaVersion: 1;

    /** Subject whose requirements were read. */
    subject: Subject;

    /** Versioned algorithm used by every aggregate raw-tree identity. */
    treeAlgorithm: "sha256-posix-path-nul-bytes-v1";

    /** SHA-256 of exact raw requirement paths and bytes. */
    requirementsRawTreeSha256: string;

    /** SHA-256 of exact acceptance JSONL bytes. */
    acceptanceCatalogSha256: string;

    /** Exact acceptance rows in frozen file order. */
    acceptance: IClause[];

    /**
     * SHA-256 of exact context JSONL bytes, absent when no context catalog
     * exists.
     */
    contextCatalogSha256: string | null;

    /** Exact context rows in frozen file order. */
    context: IClause[];

    /** Explicit proof that the two populations were not added together. */
    denominatorsSummed: false;
  }

  /** Deterministic block assigned to one blind grader turn. */
  export interface IBlock {
    /**
     * Stable block identifier derived from subject, phase, population, and
     * index.
     */
    blockId: string;

    /** Population this block partitions. */
    population: Population;

    /** One-based index within the selected population. */
    index: number;

    /** Number of blocks in the selected population. */
    count: number;

    /** Exact ordered criterion identifiers assigned to the block. */
    criterionIds: string[];
  }

  /** Complete deterministic grade-block plan for one phase. */
  export interface IBlockPlan {
    /** Plan format version. */
    schemaVersion: 1;

    /** Subject being graded. */
    subject: Subject;

    /** Immutable artifact milestone being graded. */
    phase: Phase;

    /** Run and frozen input identities that make the plan non-reusable. */
    bindings: {
      /** Globally unique measured run identifier. */
      runId: string;

      /** Blind bundle identifier. */
      bundleId: string;

      /** Exact neutral bundle-transform manifest byte digest. */
      bundleManifestSha256: string;

      /** Versioned algorithm used by every aggregate raw-tree identity. */
      treeAlgorithm: "sha256-posix-path-nul-bytes-v1";

      /** Exact neutral bundle raw-tree digest. */
      bundleRawTreeSha256: string;

      /** Exact runner-owned grading-input manifest digest. */
      gradingInputManifestSha256: string;

      /** Exact pre-strip source snapshot raw-tree digest. */
      sourceSnapshotRawTreeSha256: string;

      /** Exact selected-subject requirement raw-tree digest. */
      requirementsRawTreeSha256: string;

      /** Exact all-subject freeze manifest byte digest. */
      subjectFreezeManifestSha256: string;

      /** Exact docs/analysis requirement raw-tree visible to the generator. */
      materializedRequirementsRawTreeSha256: string;

      /** Exact pre-run materialization/run manifest byte digest. */
      runManifestSha256: string;

      /** Immutable generation core seal binding all grading inputs. */
      generationCoreSealSha256: string;

      /** Hidden acceptance catalog digest unavailable to the generator. */
      hiddenAcceptanceCatalogSha256: string;

      /** Frozen deterministic grade-input result manifest digest. */
      deterministicInputsSha256: string;

      /** Frozen grading rubric digest. */
      rubricSha256: string;

      /** Frozen semantic grader prompt digest. */
      promptSha256: string;

      /** Frozen provider-facing grade-block schema digest. */
      providerSchemaSha256: string;

      /** Frozen local grade-block schema digest. */
      localSchemaSha256: string;

      /** Frozen provider-facing post-grade arm-guess schema digest. */
      armGuessProviderSchemaSha256: string;

      /** Frozen local post-grade arm-guess schema digest. */
      armGuessLocalSchemaSha256: string;

      /** Frozen provider-facing third-grader adjudication schema digest. */
      adjudicationProviderSchemaSha256: string;

      /** Frozen local third-grader adjudication schema digest. */
      adjudicationLocalSchemaSha256: string;

      /** Frozen provider-output registry digest. */
      registrySha256: string;

      /** Frozen protocol revision. */
      protocolRevision: string;

      /** Exact frozen protocol-revision digest. */
      protocolRevisionSha256: string;

      /** Two pre-registered independent grader identities. */
      graderAssignments: [IGrader, IGrader];

      /** Pre-registered fresh third LLM adjudicator identity. */
      adjudicatorAssignment: IGrader;

      /** Frozen grader context lifetime across deterministic blocks. */
      contextPolicy: "continuous" | "fresh_per_block";
    };

    /** Maximum criteria placed into one model output. */
    maximumCriteriaPerBlock: number;

    /** Conservative output-size admission inputs. */
    sizing: {
      /** Estimated maximum output tokens per criterion. */
      estimatedTokensPerCriterion: number;

      /** Fixed output envelope tokens per block. */
      envelopeTokens: number;

      /** Provider output-token ceiling admitted for one turn. */
      maximumOutputTokens: number;
    };

    /** Acceptance and optional context blocks in canonical order. */
    blocks: IBlock[];

    /** Exact acceptance catalog digest bound into the plan. */
    acceptanceCatalogSha256: string;

    /** Exact context catalog digest bound into the plan. */
    contextCatalogSha256: string | null;

    /** SHA-256 of the canonical plan without this field. */
    planSha256: string;
  }

  /** Counterfactual test assessment for one criterion. */
  export interface ITestAssessment {
    /** Whether the criterion is testable in the frozen harness. */
    testable: boolean;

    /** Whether a relevant test exists. */
    exists: boolean;

    /** Whether that test executed in a frozen canonical gate. */
    executed: boolean;

    /** Whether the executed assertion passed. */
    passes: boolean;

    /**
     * Whether the assertion distinguishes required behavior from a plausible
     * defect.
     */
    nonVacuous: boolean;

    /** Whether required positive behavior is asserted. */
    positive: boolean;

    /** Whether required negative behavior is asserted. */
    negative: boolean;

    /** Whether required boundary behavior is asserted. */
    boundary: boolean;

    /** Mutation or behavior reversal that would make the assertion fail. */
    counterfactual: string;
  }

  /** File-backed semantic observation supporting one rating. */
  export interface IEvidence {
    /** Bundle-relative artifact path. */
    path: string;

    /** One-based source line. */
    line: number;

    /** Concise observable fact at the location. */
    observation: string;
  }

  /** Blind semantic judgment for one frozen criterion. */
  export interface IRating {
    /** Exact catalog criterion identifier. */
    criterionId: string;

    /** Primary semantic result. */
    status: Status;

    /** Calibrated confidence from zero through one. */
    confidence: number;

    /** Complete fixed product-surface inventory and independent results. */
    surfaces: Array<{
      /** Frozen surface name. */
      surface:
        | "database"
        | "api"
        | "backend"
        | "frontend"
        | "integration"
        | "test"
        | "operations"
        | "documentation";

      /** Semantic result for the surface. */
      status: SurfaceStatus;
    }>;

    /** Non-vacuous test assessment. */
    test: ITestAssessment;

    /** Bundle-relative observations behind the judgment. */
    evidence: IEvidence[];

    /** Defect impact. */
    severity: Severity;

    /** Concise reason that connects evidence to status. */
    rationale: string;
  }

  /** Identity of one independent blind grader. */
  export interface IGrader {
    /** Pseudonym stable within one benchmark report. */
    pseudonym: string;

    /** Grader implementation kind. */
    kind: "llm" | "llm_adjudicator" | "human_validator";

    /** Exact model name, absent for a human. */
    model: string | null;

    /** Exact model or rubric revision, absent when unavailable. */
    version: string | null;

    /** Frozen reasoning effort, absent for a human. */
    reasoningEffort: string | null;

    /** Authentication mode used by the grading runner, absent for a human. */
    authMode: string | null;

    /** Effective provider service tier, absent for a human. */
    serviceTier: string | null;

    /** Exact coding-agent version, absent for a human. */
    agentVersion: string | null;
  }

  /** Provider-facing output for one deterministic grade block. */
  export interface IProviderBlock {
    /** Provider output format version. */
    schemaVersion: 1;

    /** Frozen provider role. */
    role: "blind_grader";

    /** Logical grade assembled from this grader's complete block set. */
    gradeId: string;

    /** Blind bundle identity. */
    bundleId: string;

    /** Subject hidden behind the neutral bundle. */
    subject: Subject;

    /** Immutable milestone being graded. */
    phase: Phase;

    /** Pre-registered logical grader pseudonym. */
    graderPseudonym: string;

    /** Frozen semantic rubric digest. */
    rubricSha256: string;

    /** Frozen population catalog digest. */
    catalogSha256: string;

    /** Independently partitioned criterion population. */
    population: Population;

    /** Exact deterministic plan block identifier. */
    blockId: string;

    /** Zero-based block index in the canonical population partition. */
    blockIndex: number;

    /** Exact planned criterion order echoed before ratings. */
    criterionIds: string[];

    /** Ratings in the exact criterion order assigned by the block. */
    ratings: IRating[];

    /** Terminal provider status retained for right censoring. */
    status: "completed" | "interrupted" | "failed";

    /** Interruption detail, absent only for a completed block. */
    interruption: {
      /** Provider-visible interruption reason. */
      reason: string;

      /** Last criterion completed before interruption, when any. */
      lastCompletedCriterionId: string | null;
    } | null;
  }

  /** Provider-facing arm guess requested only after semantic grade sealing. */
  export interface IProviderArmGuess {
    /** Provider output format version. */
    schemaVersion: 1;

    /** Frozen provider role. */
    role: "blind_arm_guess";

    /** Logical grade whose rating bytes were already sealed. */
    gradeId: string;

    /** Blind bundle identity. */
    bundleId: string;

    /** Subject being guessed. */
    subject: Subject;

    /** Immutable milestone being guessed. */
    phase: Phase;

    /** Pre-registered logical grader pseudonym. */
    graderPseudonym: string;

    /** SHA-256 of exact already sealed semantic-rating bytes. */
    sealedRatingsSha256: string;

    /** Guessed arm or an explicit unknown judgment. */
    guess: ArmGuess;

    /** Guess confidence from zero through one. */
    confidence: number;

    /** Concise arm-guess reasoning without changing a semantic rating. */
    rationale: string;
  }

  /** Provider-facing output from the fresh third LLM adjudicator. */
  export interface IProviderAdjudication {
    /** Provider output format version. */
    schemaVersion: 1;

    /** Frozen provider role. */
    role: "llm_adjudicator";

    /** Stable adjudication attempt identity. */
    adjudicationId: string;

    /** Blind bundle identity. */
    bundleId: string;

    /** Subject being adjudicated. */
    subject: Subject;

    /** Immutable milestone being adjudicated. */
    phase: Phase;

    /** Independently adjudicated criterion population. */
    population: Population;

    /** Digest of exact two-grade and queue input bytes. */
    sealedInputsSha256: string;

    /** Digest of the exact deterministic comparison queue. */
    queueSha256: string;

    /** Decisions in the exact deterministic audit-queue order. */
    decisions: Array<{
      /** Exact queued criterion identity. */
      itemId: string;

      /** Frozen full-semantic adjudication kind. */
      decision: "semantic_consensus";

      /** Complete fresh semantic rating retained for consensus. */
      semanticRating: IRating;

      /** Calibrated decision confidence from zero through one. */
      confidence: number;

      /** Reason that resolves the two source ratings and queue reasons. */
      rationale: string;
    }>;

    /** Terminal provider status. */
    status: "completed" | "interrupted" | "failed";
  }

  /** Harness-owned provenance wrapped around one provider block output. */
  export interface IBlockSubmission {
    /** Local wrapper format version. */
    schemaVersion: 1;

    /** Blind bundle identifier. */
    bundleId: string;

    /** Subject being assessed. */
    subject: Subject;

    /** Immutable source milestone being assessed. */
    phase: Phase;

    /** Independent grader identity. */
    grader: IGrader;

    /** Whether the grader was blind to arm and method. */
    blind: true;

    /** Exact population assigned to this block. */
    population: Population;

    /** Locally validated provider output. */
    output: IProviderBlock;

    /** Harness-owned app-server and schema evidence. */
    provenance: {
      /** Fresh grader thread identifier. */
      threadId: string;

      /** Exact turn identifier that produced the block. */
      turnId: string;

      /** Upstream response identifiers contributing to the turn. */
      responseIds: string[];

      /** Frozen provider-facing schema digest. */
      providerSchemaSha256: string;

      /** Frozen local semantic schema digest. */
      localSchemaSha256: string;

      /** Frozen provider-output registry digest. */
      registrySha256: string;

      /** Provider submission timestamp in UTC. */
      submittedAtUtc: string;
    };
  }

  /** Harness provenance for one post-grade arm-guess response. */
  export interface IArmGuessSubmission {
    /** Local wrapper format version. */
    schemaVersion: 1;

    /** Blind bundle identifier. */
    bundleId: string;

    /** Independent grader identity. */
    grader: IGrader;

    /** Provider output produced only after every grade block was sealed. */
    output: IProviderArmGuess;

    /** Harness-owned app-server and schema evidence. */
    provenance: IBlockSubmission["provenance"];
  }

  /** Harness-owned wrapper around a fresh third LLM adjudication output. */
  export interface IAdjudicationSubmission {
    /** Local wrapper format version. */
    schemaVersion: 1;

    /** Blind bundle identifier. */
    bundleId: string;

    /** Pre-registered fresh third LLM identity. */
    adjudicator: IGrader;

    /** Locally validated provider output. */
    output: IProviderAdjudication;

    /** Harness-owned app-server and schema evidence. */
    provenance: IBlockSubmission["provenance"];
  }

  /** Reconciled counts for one independent population. */
  export interface ISummary {
    /** Frozen population size. */
    populationCount: number;

    /** Criteria remaining after explicit not-applicable adjudication. */
    applicable: number;

    /** Correctly implemented criteria. */
    implementedCorrectly: number;

    /** Partially implemented criteria. */
    partial: number;

    /** Entirely omitted criteria. */
    omitted: number;

    /** Criteria contradicted by the artifact. */
    contradicted: number;

    /** Criteria not establishable from permitted evidence. */
    unverifiable: number;

    /** Explicitly inapplicable criteria. */
    notApplicable: number;

    /** Applicable criteria the grader considered testable. */
    testable: number;

    /** Criteria with a locally valid non-vacuous test judgment. */
    nonVacuousTested: number;

    /** Ratings carrying critical severity. */
    criticalDefects: number;
  }

  /** Complete locally assembled grade from one independent grader. */
  export interface IGrade {
    /** Assembled grade format version. */
    schemaVersion: 1;

    /** Stable grade identifier. */
    gradeId: string;

    /** Blind bundle identifier shared by all source blocks. */
    bundleId: string;

    /** Subject being assessed. */
    subject: Subject;

    /** Immutable source milestone being assessed. */
    phase: Phase;

    /** Independent grader identity shared by all source blocks. */
    grader: IGrader;

    /** Whether the grader was blind to arm and method. */
    blind: true;

    /** Deterministic grade plan digest. */
    planSha256: string;

    /** Immutable generation core seal the grade postprocess reads. */
    generationCoreSealSha256: string;

    /** Frozen semantic rubric digest. */
    rubricSha256: string;

    /** Frozen provider-facing grade-block schema digest. */
    gradeBlockProviderSchemaSha256: string;

    /** Frozen local grade-block schema digest. */
    gradeBlockLocalSchemaSha256: string;

    /** Frozen provider-output registry digest. */
    providerOutputRegistrySha256: string;

    /** Exact acceptance catalog digest. */
    acceptanceCatalogSha256: string;

    /**
     * Exact context catalog digest, absent when the subject has no context
     * population.
     */
    contextCatalogSha256: string | null;

    /** Acceptance ratings in exact frozen catalog order. */
    acceptanceRatings: IRating[];

    /** Context ratings in exact frozen catalog order. */
    contextRatings: IRating[];

    /** Reconciled acceptance counts. */
    acceptanceSummary: ISummary;

    /** Reconciled context counts, absent when the population does not exist. */
    contextSummary: ISummary | null;

    /** Explicit proof that acceptance and context were never pooled. */
    denominatorsSummed: false;

    /** Post-grade arm guess kept outside semantic block responses. */
    armGuess: IProviderArmGuess;

    /** Exact block identifiers assembled into this grade. */
    sourceBlocks: string[];

    /** Exact grader contexts, used to prove inter-grader isolation. */
    sourceThreadIds: string[];

    /** Exact upstream responses whose usage belongs to this grade. */
    sourceResponseIds: string[];

    /** Canonical digest of the exact response identity order. */
    sourceResponseIdsSha256: string;

    /** UTC time after semantic ratings and the separate guess were sealed. */
    submittedAtUtc: string;
  }

  /** Why a criterion enters the independent human audit queue. */
  export type AuditReason =
    | "stratified_sample"
    | "primary_status_disagreement"
    | "high_or_critical"
    | "not_applicable"
    | "unverifiable"
    | "hidden_acceptance_disagreement";

  /** One criterion requiring human review. */
  export interface IAuditItem {
    /** Population containing the criterion. */
    population: Population;

    /** Exact frozen criterion identifier. */
    criterionId: string;

    /** Sorted unique reasons for mandatory audit. */
    reasons: AuditReason[];

    /** First independent grader status. */
    firstStatus: Status;

    /** Second independent grader status. */
    secondStatus: Status;
  }

  /** Inter-rater reliability for exactly one criterion population. */
  export interface IPopulationComparison {
    /** Population measured by these statistics. */
    population: Population;

    /** Exact status agreement count. */
    exactAgreement: number;

    /** Number of criteria compared across both separate populations. */
    compared: number;

    /** Exact agreement divided by compared criteria. */
    exactAgreementRate: number;

    /** Quadratic-weighted Cohen kappa excluding not-applicable pairs. */
    weightedKappa: number | null;

    /** Matrix keyed first by grader-one status and then grader-two status. */
    disagreementMatrix: Record<Status, Record<Status, number>>;
  }

  /** Inter-rater reliability and complete human audit queue. */
  export interface IComparison {
    /** Comparison format version. */
    schemaVersion: 1;

    /** First immutable grade identifier. */
    firstGradeId: string;

    /** Second immutable grade identifier. */
    secondGradeId: string;

    /** Acceptance reliability using only the acceptance denominator. */
    acceptance: IPopulationComparison;

    /** Context reliability using only the context denominator. */
    context: IPopulationComparison | null;

    /** Deterministic queue reviewed by the third LLM and retained for humans. */
    humanAuditQueue: IAuditItem[];

    /** Whether the pre-registered reliability threshold was met. */
    reliabilityThresholdMet: boolean;

    /** SHA-256 of the canonical comparison without this field. */
    comparisonSha256: string;
  }

  /** Fresh third-LLM decision for one mandatory audit-queue criterion. */
  export interface IAdjudicationDecision {
    /** Population containing the criterion. */
    population: Population;

    /** Exact frozen criterion identifier. */
    criterionId: string;

    /** Third-LLM-adjudicated full semantic rating. */
    rating: IRating;

    /** Adjudicator rationale that addresses every queue reason. */
    rationale: string;
  }

  /** Final AI consensus status used for provisional coverage. */
  export interface IConsensusRating {
    /** Exact frozen criterion identifier. */
    criterionId: string;

    /** Final semantic status. */
    status: Status;

    /** Whether the criterion is testable after conservative reconciliation. */
    testable: boolean;

    /** Whether a non-vacuous test survives reconciliation. */
    nonVacuous: boolean;

    /** Final defect severity. */
    severity: Severity;

    /** Whether the row came from exact agreement or third-LLM adjudication. */
    source: "grader_agreement" | "llm_adjudication";
  }

  /** Complete immutable third-LLM adjudication over one comparison queue. */
  export interface IAdjudication {
    /** Adjudication format version. */
    schemaVersion: 1;

    /** First original grade preserved by identity. */
    firstGradeId: string;

    /** Second original grade preserved by identity. */
    secondGradeId: string;

    /** Fresh third LLM adjudicator identity. */
    adjudicator: IGrader;

    /** Exact decisions in deterministic queue order. */
    decisions: IAdjudicationDecision[];

    /** Harness-owned fresh app-server evidence for each population output. */
    provenances: IBlockSubmission["provenance"][];

    /** Final acceptance consensus in frozen catalog order. */
    acceptance: IConsensusRating[];

    /** Final context consensus in frozen catalog order. */
    context: IConsensusRating[];

    /** Explicit proof that populations were never pooled. */
    denominatorsSummed: false;

    /** Required human validation remains separate from executable consensus. */
    humanValidationStatus: "pending";

    /** Exact unresolved human queue retained after AI adjudication. */
    pendingHumanValidationQueue: IAuditItem[];

    /** Prevents an AI consensus from being described as human validated. */
    humanValidatedCompositeClaim: false;

    /** UTC completion time. */
    completedAtUtc: string;

    /** Canonical adjudication digest. */
    adjudicationSha256: string;
  }
}
