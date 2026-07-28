import type { IEvidenceBenchmarkQualityGrade } from "./IEvidenceBenchmarkQualityGrade.ts";

/** Contracts for one immutable quality cell and append-only block report. */
export namespace IEvidenceBenchmarkQualityReport {
  /** Exact provider token categories preserved without normalization loss. */
  export interface IUsage {
    /** Whether every expected raw response supplied exact usage. */
    exact: boolean;

    /** Interpretation of every numeric token field. */
    completeness: "exact" | "observed_lower_bound";

    /** Number of unique upstream response rows. */
    responseCount: number;

    /** Digest of the sorted unique upstream response-id set. */
    responseSetSha256: string;

    /** Digest of the frozen cost report joined to this usage ledger. */
    costReportSha256: string;

    /** Provider-reported total tokens. */
    totalTokens: number;

    /** Inclusive provider input tokens. */
    inputTokens: number;

    /** Cached subset of inclusive input tokens. */
    cachedInputTokens: number;

    /** Cache-write input tokens. */
    cacheWriteInputTokens: number;

    /** Inclusive output tokens. */
    outputTokens: number;

    /** Reasoning subset of output tokens. */
    reasoningOutputTokens: number;
  }

  /** Exact retained or neutralized artifact inventory. */
  export interface IArtifactScale {
    /** Number of regular files or symlinks. */
    files: number;

    /** Exact aggregate bytes. */
    bytes: number;

    /** Versioned algorithm used by the aggregate raw-tree identity. */
    treeAlgorithm: "sha256-posix-path-nul-bytes-v1";

    /** Deterministic raw path-and-byte tree digest. */
    rawTreeSha256: string;
  }

  /** Exact milestone times and elapsed durations for one run. */
  export interface ITiming {
    /** Run start time in UTC. */
    startedAtUtc: string;

    /** Exact monotonic t0 nanoseconds. */
    startedMonotonicNanoseconds: string;

    /** First completion claim milestone in UTC, absent when never reached. */
    tDoneAtUtc: string | null;

    /** Exact monotonic t_done nanoseconds, absent when never reached. */
    tDoneMonotonicNanoseconds: string | null;

    /**
     * First independent green gate-set milestone in UTC, absent when never
     * reached.
     */
    tGreenAtUtc: string | null;

    /** Exact monotonic t_green nanoseconds, absent when never reached. */
    tGreenMonotonicNanoseconds: string | null;

    /** Campaign exhaustion milestone in UTC, absent when never reached. */
    tDryAtUtc: string | null;

    /** Exact monotonic t_dry nanoseconds, absent when never reached. */
    tDryMonotonicNanoseconds: string | null;

    /** Terminal seal time in UTC. */
    terminalAtUtc: string;

    /** Exact monotonic terminal nanoseconds. */
    terminalMonotonicNanoseconds: string;

    /** Milliseconds from start to first completion claim. */
    tDoneElapsedMs: number | null;

    /** Milliseconds from start to first independent green gate-set. */
    tGreenElapsedMs: number | null;

    /** Milliseconds from start to campaign exhaustion. */
    tDryElapsedMs: number | null;

    /** Milliseconds from start to terminal seal. */
    terminalElapsedMs: number;

    /**
     * Digest of the exact gate event that established t_green, absent if
     * unreached.
     */
    tGreenEvidenceSha256: string | null;

    /** Whether the source sealed at t_done was already independently green. */
    gateAtDoneGreen: boolean | null;

    /** Digest of the exact gate-at-done evidence, absent before t_done. */
    gateAtDoneEvidenceSha256: string | null;
  }

  /** Deterministic gate and campaign measurements. */
  export interface ICampaign {
    /** Number of fully completed campaign rounds. */
    completedRounds: number;

    /** Whether a partial terminal round was preserved. */
    incompleteRoundPreserved: boolean;

    /** Number of verified unique findings. */
    verifiedFindings: number;

    /** Number of findings handed to the fixer. */
    repairAttempts: number;

    /** Number of findings proven fixed in a fresh context. */
    provenFixed: number;

    /** Number of terminal dry rounds. */
    consecutiveDryRounds: number;

    /** Number of independent build and test gates executed. */
    gateExecutions: number;

    /** Number of non-green gate results. */
    failedGates: number;
  }

  /** Frozen collector identity behind one deterministic quality input. */
  export interface ICollector {
    /** Collector implementation name. */
    producer: string;

    /** Exact collector version. */
    version: string;

    /** Frozen configuration digest. */
    configurationSha256: string;

    /** Exact result artifact digest. */
    resultSha256: string;
  }

  /** Harness-owned hidden, coverage, and mutation measurements. */
  export interface IDeterministicInputs {
    /** Manifest joining every deterministic result. */
    manifestSha256: string;

    /** Hidden black-box acceptance results. */
    hiddenAcceptance: {
      /** Hidden criterion count. */
      total: number;

      /** Passing hidden criteria. */
      passed: number;

      /** Failing hidden criteria. */
      failed: number;

      /** Hidden catalog digest. */
      catalogSha256: string;

      /** Collector provenance. */
      collector: ICollector;
    };

    /** Conventional coverage retained as a secondary vector. */
    conventionalCoverage: {
      /** Covered and total line count. */
      lines: { covered: number; total: number };

      /** Covered and total branch count. */
      branches: { covered: number; total: number };

      /** Covered and total function count. */
      functions: { covered: number; total: number };

      /** Covered and total statement count. */
      statements: { covered: number; total: number };

      /** Collector provenance. */
      collector: ICollector;
    };

    /** Sampled mutation results. */
    mutation: {
      /** Mutants executed by the frozen sampled program. */
      sampled: number;

      /** Mutants killed by the test suite. */
      killed: number;

      /** Mutants that survived. */
      survived: number;

      /** Mutants that could not run. */
      invalid: number;

      /** Frozen operator and target manifest digest. */
      sampleManifestSha256: string;

      /** Collector provenance. */
      collector: ICollector;
    };
  }

  /** Secondary blind UI, usability, accessibility, and maintainability vector. */
  export interface ISecondaryReview {
    /** Secondary review schema version. */
    schemaVersion: 1;

    /** Frozen seeded route and state inventory digest. */
    scenarioManifestSha256: string;

    /** Exact screenshot and browser-flow evidence. */
    evidence: {
      /** Required viewport widths, exactly 390, 834, and 1440. */
      viewportWidths: [390, 834, 1440];

      /** Number of seeded routes exercised. */
      routes: number;

      /** Number of seeded UI states exercised. */
      states: number;

      /** Exact screenshot-set digest. */
      screenshotSetSha256: string;

      /** Exact browser-flow result digest. */
      browserFlowSha256: string;
    };

    /** Exact canonical six-axis vector kept outside requirement coverage. */
    ratings: Array<{
      /** Frozen secondary-review dimension in canonical order. */
      dimension:
        | "usability"
        | "legibility"
        | "responsiveness"
        | "state_feedback"
        | "accessibility"
        | "maintainability";

      /** Ordinal score from one through five. */
      score: 1 | 2 | 3 | 4 | 5;

      /** Calibrated grader confidence from zero through one. */
      confidence: number;

      /** File or visual-evidence-backed reason for the score. */
      rationale: string;
    }>;

    /** Two independent blind secondary-review grade digests. */
    sourceGradeSha256: [string, string];

    /** Provider-facing secondary grade schema digest. */
    gradeProviderSchemaSha256: string;

    /** Local secondary grade wrapper schema digest. */
    gradeLocalSchemaSha256: string;

    /** Provider-facing secondary adjudication schema digest. */
    adjudicationProviderSchemaSha256: string;

    /** Local secondary adjudication wrapper schema digest. */
    adjudicationLocalSchemaSha256: string;

    /** Provider-output registry digest shared by all secondary outputs. */
    registrySha256: string;

    /** Complete independent-grader and fresh third-LLM consensus digest. */
    adjudicationSha256: string;

    /** Human validation remains outside the executable 2+1 AI result. */
    humanValidationStatus: "pending";

    /** Prevents secondary scores from being described as human validated. */
    humanValidatedCompositeClaim: false;

    /** Explicit proof that secondary scores were not pooled with requirements. */
    combinedWithRequirementCoverage: false;
  }

  /** Coverage ratios for one independent criterion population. */
  export interface IPopulationCoverage {
    /** Population represented by this vector. */
    population: IEvidenceBenchmarkQualityGrade.Population;

    /** Frozen criterion count before applicability adjudication. */
    populationCount: number;

    /** Criteria remaining after not-applicable adjudication. */
    applicable: number;

    /** Correctly implemented criteria. */
    full: number;

    /** Correct or partially implemented criteria. */
    partialOrBetter: number;

    /** Full coverage divided by applicable criteria. */
    fullRate: number | null;

    /** Partial-or-better coverage divided by applicable criteria. */
    partialOrBetterRate: number | null;

    /** Criteria judged testable. */
    testable: number;

    /** Criteria with non-vacuous executed tests. */
    nonVacuousTested: number;

    /** Non-vacuous tested criteria divided by testable criteria. */
    nonVacuousTestRate: number | null;
  }

  /** Requirement-heading coverage without pooling hierarchy levels. */
  export interface IHierarchyCoverage {
    /** Frozen H2 owner count. */
    h2Count: number;

    /** H2 owners whose clauses are all correctly implemented. */
    h2Full: number;

    /** H2 owners with at least partial implementation and no total omission. */
    h2PartialOrBetter: number;

    /** Frozen H3 leaf count. */
    h3Count: number;

    /** H3 leaves whose clauses are all correctly implemented. */
    h3Full: number;

    /** H3 leaves with at least partial implementation and no total omission. */
    h3PartialOrBetter: number;
  }

  /** One phase's independent grades and unpooled quality vector. */
  export interface IPhase {
    /** Immutable source milestone. */
    phase: IEvidenceBenchmarkQualityGrade.Phase;

    /** Blind bundle identifier. */
    bundleId: string;

    /** Source snapshot raw-tree digest before stripping. */
    snapshotRawTreeSha256: string;

    /** Neutral bundle raw-tree digest after stripping. */
    bundleRawTreeSha256: string;

    /** Raw retained source scale. */
    rawScale: IArtifactScale;

    /** Neutral blind bundle scale. */
    blindScale: IArtifactScale;

    /** Exact frozen block plan shared by both independent graders. */
    gradePlan: IEvidenceBenchmarkQualityGrade.IBlockPlan;

    /** First immutable independent grade. */
    firstGrade: IEvidenceBenchmarkQualityGrade.IGrade;

    /** Second immutable independent grade. */
    secondGrade: IEvidenceBenchmarkQualityGrade.IGrade;

    /** Population-separated inter-rater statistics and audit queue. */
    comparison: IEvidenceBenchmarkQualityGrade.IComparison;

    /** Fresh third-LLM adjudication preserving both original grades. */
    adjudication: IEvidenceBenchmarkQualityGrade.IAdjudication;

    /** Provisional coverage vectors computed after 2+1 AI adjudication. */
    coverage: {
      /** Final acceptance coverage. */
      acceptance: IPopulationCoverage;

      /** Final context coverage, absent without that population. */
      context: IPopulationCoverage | null;

      /** Final H2 and H3 requirement coverage. */
      hierarchy: IHierarchyCoverage;
    };

    /** Required deterministic grade inputs with collector provenance. */
    deterministicInputs: IDeterministicInputs;

    /** Required secondary blind review, never pooled with requirement coverage. */
    secondaryReview: ISecondaryReview;
  }

  /** One subject-arm-replicate terminal benchmark cell. */
  export interface ICell {
    /** Cell report format version. */
    schemaVersion: 1;

    /** Immutable run identifier. */
    runId: string;

    /** Measured subject. */
    subject: IEvidenceBenchmarkQualityGrade.Subject;

    /** Measured benchmark arm. */
    arm: "plain" | "evidence";

    /** One-based replicate number. */
    replicate: number;

    /** Pre-registered one-based launch order inside the four-cell block. */
    launchOrder: number;

    /** Terminal runner outcome. */
    status: "completed" | "failed" | "interrupted" | "safety_limit";

    /** Redacted terminal reason safe for a public issue ledger. */
    publicTerminalReason: string;

    /** Digest of the private raw terminal reason retained in run artifacts. */
    privateTerminalReasonSha256: string;

    /** Right-censoring subtype, absent for uncensored completion or failure. */
    censoring:
      | null
      | "quota"
      | "provider"
      | "host"
      | "watchdog"
      | "user_abort"
      | "harness"
      | "safety_limit";

    /** Fail-closed safety-limit observation, absent when no limit fired. */
    safetyLimit: {
      /** Whether this cell or its shared four-cell block observed the limit. */
      scope: "cell" | "block";

      /** Digest shared by every cell stopped by the same observation. */
      sharedStopDigest: string;

      /** Limit that stopped new work. */
      trigger: "observed_total_tokens" | "hard_deadline";

      /** Frozen configured threshold. */
      threshold: number;

      /** Exact observed value when interruption began. */
      observed: number;

      /** Observed amount beyond the threshold. */
      overshoot: number;

      /** Whether the stop request itself was observed. */
      stopObserved: boolean;

      /** Upstream responses can finish after observation, so this is never hard. */
      hardCeilingGuaranteed: false;
    } | null;

    /** Exact runner timing milestones. */
    timing: ITiming;

    /** Exact token ledger. */
    usage: IUsage;

    /** Deterministic campaign and gate counts. */
    campaign: ICampaign;

    /** Blind grades for every reached required quality milestone. */
    phases: IPhase[];

    /** SHA-256 of promoted terminal-seal.json, absent before promotion. */
    terminalSealSha256: string | null;

    /** SHA-256 of promotion.json exact bytes, absent for an unpromoted attempt. */
    promotionSha256: string | null;

    /** Public reason promotion is absent, null when promotion exists. */
    promotionAbsentReason: string | null;

    /** SHA-256 of the immutable terminal or attempt seal. */
    attemptSealSha256: string;

    /** SHA-256 of the immutable grading postprocess seal. */
    postprocessSealSha256: string;
  }

  /** One append-only randomized concurrency block. */
  export interface IBlock {
    /** Block report format version. */
    schemaVersion: 1;

    /** Frozen randomized block identifier. */
    blockId: string;

    /** Exact block-plan digest that authorized launch order and ceilings. */
    blockPlanSha256: string;

    /** Exactly two paired subjects represented by four cells. */
    selectedSubjects: [
      IEvidenceBenchmarkQualityGrade.Subject,
      IEvidenceBenchmarkQualityGrade.Subject,
    ];

    /** Exact merged source commit used by every cell. */
    sourceMergedCommit: string;

    /** Frozen protocol revision. */
    protocolRevision: string;

    /** Frozen price sheet digest. */
    priceSheetSha256: string;

    /** Shared block-level safety observation, absent without a block stop. */
    safetyLimit: {
      /** Shared stop evidence digest. */
      sharedStopDigest: string;

      /** Frozen observed-total-token threshold. */
      threshold: number;

      /** Exact observed block total when interruption began. */
      observedTotalTokens: number;

      /** Upstream requests prevent a guaranteed hard ceiling. */
      hardCeilingGuaranteed: false;
    } | null;

    /** Terminal cells in pre-registered launch order. */
    cells: ICell[];

    /** UTC report creation timestamp. */
    createdAtUtc: string;
  }

  /** One tamper-evident append-only ledger row. */
  export interface ILedgerRow {
    /** Ledger row format version. */
    schemaVersion: 1;

    /** One-based append sequence. */
    sequence: number;

    /** SHA-256 of the previous exact row bytes, zero for the first row. */
    previousRowSha256: string;

    /** Immutable randomized block report. */
    block: IBlock;

    /** SHA-256 of the canonical block object. */
    blockSha256: string;

    /** SHA-256 of this canonical row excluding this field. */
    rowSha256: string;
  }
}
