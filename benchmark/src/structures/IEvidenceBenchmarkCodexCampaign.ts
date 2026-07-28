import type { IEvidenceBenchmarkCodexRecord } from "./IEvidenceBenchmarkCodexRecord.ts";

/**
 * Frozen Phase 2 inputs, fresh-context audit records, and resumable campaign
 * state.
 */
export namespace IEvidenceBenchmarkCodexCampaign {
  /** The six arm-neutral discovery lenses registered by the protocol. */
  export type Lens =
    "requirements" | "database" | "api" | "logic" | "tests" | "frontend";

  /** The four fixed finder assignments and their registered lens partitions. */
  export type FinderAssignment =
    "F1-requirements-database" | "F2-api-logic" | "F3-tests" | "F4-frontend";

  /** Exhaustive defect taxonomy emitted by independent verification. */
  export type Classification =
    | "requirement_omission"
    | "partial_implementation"
    | "semantic_defect"
    | "false_acknowledgement"
    | "configuration_coverage"
    | "test_oracle_gap"
    | "non_defect";

  /** Campaign outcomes that never collapse interruption into success. */
  export type Status = "running" | "interrupted" | "failed" | "completed";

  /** Immutable proof that Phase 1 ended before the completion challenge. */
  export interface IPhase1Boundary {
    /** Semantic event sequence at the first terminal completion claim. */
    tDoneEventSeq: number;

    /** Hash-chain identity of the first terminal completion event. */
    tDoneEventSha256: string;

    /** SHA-256 of the atomic checkpoint captured at `t_done`. */
    tDoneSnapshotSha256: string;

    /** Authored-source snapshot captured before the completion challenge. */
    tDoneSourceSnapshotSha256: string;

    /** New turn created for the post-completion challenge. */
    completionChallengeTurnId: string;

    /** Unique upstream response that completed the challenge turn. */
    completionChallengeResponseId: string;

    /** UTC time at which the challenge turn completed. */
    completionChallengeCompletedAtUtc: string;

    /** Literal proof that the challenge turn reached completed status. */
    completionChallengeCompleted: true;

    /** SHA-256 of the schema-valid challenge completion adjudication. */
    completionChallengeAdjudicationSha256: string;
  }

  /** One isolated finder copy derived from the round's canonical bundle. */
  export interface IBundleInstance {
    /** Fixed finder assignment that alone receives this instance. */
    assignmentId: FinderAssignment;

    /** Unique instance identity never reused in another round. */
    instanceId: string;

    /** SHA-256 of the exact isolated bundle tree. */
    bundleSha256: string;

    /** Finder access mode. */
    readOnly: true;

    /** Whether the fresh thread received no earlier conversation. */
    priorTranscriptAbsent: true;

    /** Whether the bundle excludes arm identity and measured-arm instructions. */
    armInformationAbsent: true;
  }

  /** Canonical stripped bundle and the four equal isolated finder instances. */
  export interface IRoundBundle {
    /** One-based campaign round. */
    round: number;

    /** Authored-state digest from which this bundle was materialized. */
    sourceAuthoredDigest: string;

    /** Unique identity of this round's bundle materialization. */
    bundleId: string;

    /** SHA-256 of the canonical bundle manifest. */
    manifestSha256: string;

    /** SHA-256 of parser implementation, version, and grammar provenance. */
    stripperProvenanceSha256: string;

    /** SHA-256 shared by the canonical bundle and every finder instance. */
    canonicalBundleSha256: string;

    /** Exactly four instances in registered finder order. */
    instances: [
      IBundleInstance,
      IBundleInstance,
      IBundleInstance,
      IBundleInstance,
    ];
  }

  /** One structured finder candidate before harness deduplication. */
  export interface IFinding {
    /** Finder-local unique candidate identity. */
    candidateId: string;

    /** Finder-supplied content fingerprint, retained but never trusted alone. */
    fingerprint: string;

    /** Registered lens that produced the candidate. */
    lens: Lens;

    /** Requirement clause identifiers implicated by the claim. */
    clauseIds: string[];

    /** Concrete expected-versus-observed behavior. */
    behavior: string;

    /** Expected behavior stated independently for fixer handoff. */
    expectedBehavior: string;

    /** Observed behavior stated independently for fixer handoff. */
    observedBehavior: string;

    /** Repository-relative files, symbols, endpoints, or tests. */
    locations: string[];

    /** Deterministic reproduction procedure or command. */
    reproduction: string;

    /** Concise defect claim. */
    claim: string;

    /** Concrete evidence supporting the claim. */
    evidence: string[];
  }

  /** One fresh read-only finder result. */
  export interface IFinderResult {
    /** Campaign round index. */
    round: number;

    /** Fixed finder assignment. */
    assignmentId: FinderAssignment;

    /** Exact registered lens partition. */
    lenses: Lens[];

    /** Fresh top-level Codex thread identifier. */
    threadId: string;

    /** Finder-only isolated bundle instance. */
    bundleInstanceId: string;

    /** SHA-256 of the finder bundle. */
    bundleSha256: string;

    /** Whether the fresh context had no prior transcript. */
    priorTranscriptAbsent: true;

    /** Whether arm identity was absent. */
    armInformationAbsent: true;

    /** Raw candidates in emission order. */
    findings: IFinding[];

    /** Unique upstream response ids charged to this finder. */
    responseIds: string[];
  }

  /** Canonical structured decision made for every raw candidate. */
  export interface IDedupeDecision {
    /** Finder-local candidate identity. */
    candidateId: string;

    /** Retained candidate fingerprint, never the sole comparison input. */
    fingerprint: string;

    /** Structured requirement clauses used in comparison. */
    clauseIds: string[];

    /** Structured behavior used in comparison. */
    behavior: string;

    /** Registered lens used in the canonical comparison. */
    lens: Lens;

    /** Expected behavior used in the canonical comparison. */
    expectedBehavior: string;

    /** Observed behavior used in the canonical comparison. */
    observedBehavior: string;

    /** Structured locations used in comparison. */
    locations: string[];

    /** Structured reproduction used in comparison. */
    reproduction: string;

    /** Exact defect claim used in the canonical comparison. */
    claim: string;

    /** Concrete evidence rows used in the canonical comparison. */
    evidence: string[];

    /** Whether the candidate enters or references the canonical catalog. */
    decision: "new" | "duplicate";

    /** Stable canonical finding identity. */
    canonicalFindingId: string;

    /** Canonical target for duplicates, otherwise null. */
    duplicateOf: string | null;

    /** Evidence-backed explanation of the structured comparison. */
    basis: string;
  }

  /** Fresh adversarial verdict for one dedup-new candidate. */
  export interface IVerification {
    /** Finder-local candidate identity under review. */
    candidateId: string;

    /** Finder fingerprint retained for traceability. */
    fingerprint: string;

    /** Canonical finding identity, or duplicate target for duplicate verdicts. */
    canonicalFindingId: string;

    /** Fresh top-level verifier thread identifier. */
    threadId: string;

    /** SHA-256 of the neutral read-only bundle inspected by the verifier. */
    bundleSha256: string;

    /** Whether the verifier received no prior transcript. */
    priorTranscriptAbsent: true;

    /** Whether arm identity was absent from verifier input. */
    armInformationAbsent: true;

    /** Independent adversarial disposition. */
    verdict: "verified" | "rejected" | "duplicate" | "unverifiable";

    /** Frozen defect class, or null only when no classification was possible. */
    classification: Classification | null;

    /** Frozen severity label, or null when no defect was verified. */
    severity: "low" | "medium" | "high" | "critical" | null;

    /** Evidence-backed adversarial rationale. */
    rationale: string;

    /** Unique upstream response ids charged to this verifier. */
    responseIds: string[];
  }

  /** Exhaustive lifecycle row emitted for every raw finder candidate. */
  export interface IFindingLifecycle {
    /** Finder-local candidate identity. */
    candidateId: string;

    /** Retained finder fingerprint. */
    fingerprint: string;

    /** Finder assignment that emitted the candidate. */
    finderAssignmentId: FinderAssignment;

    /** Harness structured dedupe decision. */
    dedupeDecision: IDedupeDecision;

    /** Fresh verdict for dedup-new candidates, otherwise null. */
    verification: IVerification | null;

    /** Exhaustive disposition with no silently dropped candidate. */
    disposition: "duplicate" | "rejected" | "unverifiable" | "repair_pending";

    /** Stable canonical identity or named duplicate target. */
    canonicalFindingId: string;
  }

  /** Canonical verified defect admitted into the fixer handoff. */
  export interface IVerifiedFinding {
    /** Finder candidate identity or deterministic mutation identity. */
    candidateId: string;

    /** Retained content fingerprint. */
    fingerprint: string;

    /** Canonical finding identity. */
    canonicalFindingId: string;

    /** Verified verdict required by the handoff contract. */
    verdict: "verified";

    /** Non-`non_defect` verified classification. */
    classification: Exclude<Classification, "non_defect">;

    /** Non-empty verified severity. */
    severity: "low" | "medium" | "high" | "critical";

    /** Discovery lens that exposed the defect. */
    lens: Lens;

    /** Atomic requirement clauses implicated by the defect. */
    atomicClauseIds: string[];

    /** Independently verified expected behavior. */
    expectedBehavior: string;

    /** Independently verified observed behavior. */
    observedBehavior: string;

    /** Verified repository-relative locations. */
    locations: string[];

    /** Deterministic independent verification procedure. */
    verificationProcedure: string;

    /** Concrete verified evidence. */
    evidence: string[];

    /** Fresh verifier thread, or null for harness mutation. */
    verifierThreadId: string | null;

    /** Evidence-backed verification rationale. */
    rationale: string;

    /** Origin of the verified defect. */
    source: "finder_verification" | "harness_mutation";
  }

  /** Exact one-per-round deterministic mutation probe and byte restoration. */
  export interface IMutationCheck {
    /** The harness, never a measured agent, owns the probe. */
    owner: "harness";

    /** Campaign round index. */
    round: number;

    /** Authored-state digest against which the criterion was selected. */
    authoredStateDigest: string;

    /** Deterministic population and selection proof. */
    selection: {
      /** SHA-256 of the frozen eligible criterion population. */
      populationSha256: string;

      /** SHA-256 of the deterministic selection input. */
      selectionSha256: string;

      /** Selected mutation target identity. */
      targetId: string;

      /** Selected quality criterion identity. */
      criterionId: string;
    };

    /** Repository-relative target path. */
    targetPath: string;

    /** Zero-based half-open byte span deliberately mutated. */
    targetSpan: {
      /** Inclusive first mutated byte. */
      start: number;

      /** Exclusive byte after the mutation. */
      end: number;
    };

    /** SHA-256 of exact target bytes before mutation. */
    preSha256: string;

    /** SHA-256 of exact target bytes after mutation. */
    mutatedSha256: string;

    /** Shell-free command and literal arguments used to test the criterion. */
    command: string[];

    /** Frozen expected failure signature. */
    expectedFailure: string;

    /** Observed process exit code. */
    actualExitCode: number | null;

    /** SHA-256 of exact observed diagnostic bytes. */
    actualDiagnosticSha256: string;

    /** Expected rejection, or a verified test-oracle defect. */
    outcome: "expected_failure" | "verified_test_oracle_gap";

    /** Harness-verified finding present exactly when the mutation survives. */
    verifiedFinding: IVerifiedFinding | null;

    /** SHA-256 after restoration. */
    restoreSha256: string;

    /** Exact byte-for-byte restoration proof. */
    restoredBytesExact: boolean;

    /** Unauthorized mutation paths; valid rounds require an empty list. */
    unauthorizedMutationPaths: string[];

    /** UTC completion timestamp. */
    checkedAtUtc: string;
  }

  /** Immutable verified-only handoff delivered to the arm-aware fixer. */
  export interface IFixManifest {
    /** Handoff schema version. */
    schemaVersion: 1;

    /** Benchmark run identity. */
    runId: string;

    /** Campaign round. */
    round: number;

    /** Unique deterministic handoff identity. */
    handoffId: string;

    /** UTC creation timestamp. */
    createdAtUtc: string;

    /** Raw authored workspace digest inspected by the auditors. */
    rawWorkspaceDigest: string;

    /** Canonical neutral bundle inspected by fresh contexts. */
    neutralBundleSha256: string;

    /** SHA-256 of the canonical dedupe catalog. */
    catalogSha256: string;

    /** SHA-256 of the frozen verified-finding JSON schema. */
    verifiedFindingSchemaSha256: string;

    /** Verified findings only. */
    verifiedFindings: IVerifiedFinding[];

    /** RFC 8785 SHA-256 of every preceding manifest field. */
    manifestSha256: string;
  }

  /** Path-and-hash-only reference passed to the fixer. */
  export interface IFixHandoff {
    /** Absolute immutable manifest path. */
    manifestPath: string;

    /** Expected manifest hash. */
    manifestSha256: string;
  }

  /** Result of one fixer turn in the original first-done thread. */
  export interface IFixResult {
    /** Original Phase 1 thread id. */
    threadId: string;

    /** Campaign round repaired by this turn. */
    round: number;

    /** Exact handoff hash the fixer consumed. */
    manifestSha256: string;

    /** Unique upstream response ids charged to the fixer. */
    responseIds: string[];

    /** Repository-relative paths changed by the fixer. */
    changedPaths: string[];

    /** Whether the fixer turn completed. */
    completed: boolean;
  }

  /** Fresh post-fix proof that every verified handoff defect was resolved. */
  export interface IFixResolution {
    /** Campaign round. */
    round: number;

    /** Exact immutable fixer handoff hash. */
    manifestSha256: string;

    /** Authored digest before fixing. */
    beforeDigest: string;

    /** Changed authored digest after fixing. */
    afterFixDigest: string;

    /** Literal proof that fixing changed authored state. */
    authoredDigestChanged: true;

    /** SHA-256 of the fresh post-fix neutral bundle. */
    freshBundleSha256: string;

    /** One exact resolution row for every handed-off verified finding. */
    findings: Array<{
      /** Canonical verified finding identity. */
      canonicalFindingId: string;

      /** Original verified finding source. */
      source: "finder_verification" | "harness_mutation";

      /** Fresh post-fix disposition. */
      verdict: "fixed" | "still_present" | "unverifiable";

      /** Fresh verifier thread, null only for harness mutation replay. */
      freshVerifierThreadId: string | null;

      /** Unique upstream response ids charged to resolution. */
      responseIds: string[];

      /** Independent deterministic reproduction result. */
      reproduction: {
        /** Shell-free command and arguments. */
        command: string[];

        /** Observed exit code. */
        exitCode: number | null;

        /** SHA-256 of exact reproduction evidence. */
        evidenceSha256: string;

        /** Frozen expected resolution. */
        expectedResolution: string;

        /** Whether observed evidence matched the expectation. */
        matched: boolean;
      };

      /** Exact mutation replay proof for harness-originated findings. */
      mutationReplay: {
        /** Whether the exact original mutation target was replayed. */
        sameTargetId: true;

        /** Whether the repaired oracle rejected the replay as expected. */
        expectedFailureMatched: true;

        /** SHA-256 after replay restoration. */
        restoreSha256: string;

        /** Exact byte restoration proof. */
        restoredBytesExact: true;
      } | null;
    }>;

    /** Literal proof that resolution ids equal handoff ids. */
    verifiedSetMatchesResolution: true;

    /** Literal proof that every finding is fixed and matched. */
    allResolved: true;
  }

  /** Append-only transition closing one repair-pending finding as fixed. */
  export interface IFindingClosure {
    /** Campaign round that proved the repair. */
    round: number;

    /** Canonical finding identity. */
    canonicalFindingId: string;

    /** Only repair-pending findings can close. */
    from: "repair_pending";

    /** Fresh resolution terminal state. */
    to: "fixed";

    /** Authored digest on which the repair was proved. */
    authoredDigest: string;

    /** Immutable fixer handoff hash. */
    manifestSha256: string;

    /** Fresh post-fix resolution evidence. */
    resolution: IFixResolution["findings"][number];
  }

  /** One fully recorded campaign round. */
  export interface IRound {
    /** Round record schema version. */
    schemaVersion: 1;

    /** Benchmark run identity. */
    runId: string;

    /** Immutable Phase 1 completion and challenge boundary. */
    phase1Boundary: IPhase1Boundary;

    /** One-based round index. */
    index: number;

    /** UTC round start timestamp. */
    startedAtUtc: string;

    /** UTC round completion timestamp. */
    completedAtUtc: string;

    /** Protected authored-state digest at round start. */
    startDigest: string;

    /** Fresh neutral bundle and four finder copies. */
    bundle: IRoundBundle;

    /** Four fresh finder results. */
    finders: IFinderResult[];

    /** One exhaustive lifecycle row for every raw candidate. */
    findingLifecycles: IFindingLifecycle[];

    /** Raw finder candidate count before deduplication. */
    rawCandidateCount: number;

    /** Machine-checked reconciliation across discovery and fixer handoff. */
    reconciliation: {
      /** Exhaustive lifecycle row count. */
      lifecycleCount: number;

      /** Dedup-new candidate count sent to fresh verifiers. */
      deduplicatedNewCount: number;

      /** Finder candidates independently verified as defects. */
      verifiedByFinderCount: number;

      /** Whether the mutation probe added one verified defect. */
      mutationVerifiedCount: 0 | 1;

      /** Verified findings admitted to the immutable fixer handoff. */
      fixHandoffCount: number;

      /** Literal proof that all candidate counts reconcile. */
      countsReconciled: true;

      /** Literal proof that no verified finding was omitted or added. */
      verifiedSetMatchesHandoff: true;
    };

    /** The round's sole pre-fixer mutation probe. */
    mutationCheck: IMutationCheck;

    /** Verified finder and mutation defects admitted to fixing. */
    verifiedNewCount: number;

    /** Verified-only immutable handoff, or null when fixing was unnecessary. */
    fixManifest: IFixManifest | null;

    /** Original-thread fixer result, or null when fixing was unnecessary. */
    fixResult: IFixResult | null;

    /** Fresh post-fix proof, or null when fixing was unnecessary. */
    fixResolution: IFixResolution | null;

    /** Full independent post-fixer gates. */
    gates: IEvidenceBenchmarkCodexRecord.IGateResult[];

    /** Protected authored-state digest after fixing and gates. */
    endDigest: string;

    /** Whether the round ended on its starting authored digest. */
    sameDigestAsStart: boolean;

    /** Whether this clean round matches the preceding clean digest. */
    sameDigestAsPreviousCleanRound: boolean;

    /** Whether every protocol validity condition held. */
    valid: boolean;

    /** Explicit reasons this round cannot count toward dryness. */
    invalidReasons: string[];

    /** Whether this valid round was clean on one unchanged authored digest. */
    clean: boolean;

    /** Consecutive clean count after this round. */
    consecutiveCleanRounds: number;

    /** Whether this round established `t_dry`. */
    establishesTDry: boolean;
  }

  /** Partial round retained whenever safe progress cannot continue. */
  export interface IIncompleteRound {
    /** One-based round index that did not complete. */
    index: number;

    /** UTC attempt start timestamp. */
    startedAtUtc: string;

    /** Stage at which progress became impossible. */
    stage:
      | "bundle"
      | "finder"
      | "dedupe"
      | "verifier"
      | "mutation-check"
      | "fixer"
      | "fix-resolution"
      | "gate";

    /** Bundle record, when materialization completed. */
    bundle?: IRoundBundle;

    /** Successful finder results received before interruption. */
    finders: IFinderResult[];

    /** Completed dedupe decisions, when available. */
    dedupeDecisions: IDedupeDecision[];

    /** Successful verifier results received before interruption. */
    verifications: IVerification[];

    /** Mutation evidence, when the probe completed. */
    mutationCheck?: IMutationCheck;

    /** Evidence-backed terminal reason. */
    reason: string;
  }

  /** Resumable campaign checkpoint. */
  export interface IState {
    /** Campaign state schema version. */
    schemaVersion: 1;

    /** Overall campaign status. */
    status: Status;

    /** Immutable Phase 1 completion and challenge boundary. */
    phase1Boundary: IPhase1Boundary;

    /** Original Phase 1 thread reserved for fixing. */
    firstDoneThreadId: string;

    /** SHA-256 of the frozen finder prompt. */
    finderPromptSha256: string;

    /** SHA-256 of the frozen adversarial verifier prompt. */
    verifierPromptSha256: string;

    /** SHA-256 of the frozen arm-aware fixer prompt. */
    fixerPromptSha256: string;

    /** Exactly two clean rounds are required. */
    requiredCleanRounds: 2;

    /** Current consecutive clean count. */
    consecutiveCleanRounds: number;

    /** Digest shared by the current clean sequence. */
    cleanDigest?: string;

    /** Append-only canonical finding history and global identity registry. */
    findingHistory: IDedupeDecision[];

    /** Append-only global canonical ids, including harness mutation findings. */
    canonicalFindingIdRegistry: string[];

    /** Digest-scoped entries eligible for duplicate suppression. */
    activeDedupeIndex: {
      /** Authored digest on which every entry was adjudicated. */
      authoredDigest: string;

      /** Rejected or freshly resolved canonical entries. */
      entries: IDedupeDecision[];
    } | null;

    /** Exhaustive candidate lifecycle history across completed rounds. */
    findingLifecycles: IFindingLifecycle[];

    /** Append-only repair closure history. */
    findingClosures: IFindingClosure[];

    /** Fully completed rounds in append order. */
    rounds: IRound[];

    /** Partial final round for interrupted or failed campaigns. */
    incompleteRound?: IIncompleteRound;

    /** Semantic event hash that established `t_dry`. */
    tDryEventSha256?: string;

    /** Authored digest at `t_dry`. */
    tDryAuthoredDigest?: string;

    /** UTC checkpoint update timestamp. */
    updatedAtUtc: string;

    /** UTC campaign start timestamp retained across restart. */
    startedAtUtc: string;

    /** Frozen cumulative campaign deadline retained across restart. */
    deadlineAtUtc: string;

    /** Terminal interruption or failure reason. */
    terminalReason?: string;
  }

  /** Frozen coordinator options. */
  export interface IOptions {
    /** Globally unique benchmark run id. */
    runId: string;

    /** Original Phase 1 thread reserved for fixing. */
    firstDoneThreadId: string;

    /** Immutable Phase 1 completion and challenge boundary. */
    phase1Boundary: IPhase1Boundary;

    /** SHA-256 of the frozen finder prompt. */
    finderPromptSha256: string;

    /** SHA-256 of the frozen adversarial verifier prompt. */
    verifierPromptSha256: string;

    /** SHA-256 of the frozen arm-aware fixer prompt. */
    fixerPromptSha256: string;

    /** SHA-256 of the frozen verified-finding schema. */
    verifiedFindingSchemaSha256: string;

    /** Absolute directory for immutable fixer handoffs. */
    fixManifestDirectory: string;

    /** Absolute campaign checkpoint path. */
    checkpointPath: string;

    /** Maximum campaign wall time in milliseconds. */
    timeoutMs: number;
  }

  /** Computes the current protected authored-state digest. */
  export type IDigest = (signal: AbortSignal) => Promise<string>;

  /** Creates a canonical stripped bundle and four isolated finder copies. */
  export type IMaterializeBundle = (
    round: number,
    authoredStateDigest: string,
    signal: AbortSignal,
  ) => Promise<IRoundBundle>;

  /** Launches one fresh read-only finder context. */
  export type IFind = (
    round: number,
    assignmentId: FinderAssignment,
    lenses: Lens[],
    bundle: IRoundBundle,
    signal: AbortSignal,
  ) => Promise<IFinderResult>;

  /** Deduplicates raw candidates against the canonical structured catalog. */
  export type IDeduplicate = (
    round: number,
    findings: IFinding[],
    catalog: IDedupeDecision[],
    signal: AbortSignal,
  ) => Promise<IDedupeDecision[]>;

  /** Launches one fresh read-only adversarial verifier context. */
  export type IVerify = (
    round: number,
    finding: IFinding,
    decision: IDedupeDecision,
    bundle: IRoundBundle,
    signal: AbortSignal,
  ) => Promise<IVerification>;

  /** Performs the round's sole pre-fixer mutation and exact restoration. */
  export type ICheckMutation = (
    round: number,
    authoredStateDigest: string,
    signal: AbortSignal,
  ) => Promise<IMutationCheck>;

  /** Sends only an immutable manifest path and hash to the original fixer. */
  export type IFix = (
    handoff: IFixHandoff,
    signal: AbortSignal,
  ) => Promise<IFixResult>;

  /** Performs fresh post-fix verification and exact mutation replay. */
  export type IResolveFix = (
    manifest: IFixManifest,
    beforeDigest: string,
    afterFixDigest: string,
    signal: AbortSignal,
  ) => Promise<IFixResolution>;

  /** Runs the complete independent gate set after optional fixing. */
  export type IGate = (
    round: number,
    signal: AbortSignal,
  ) => Promise<IEvidenceBenchmarkCodexRecord.IGateResult[]>;

  /** Stops descendant processes and waits until no adapter work can mutate. */
  export type IQuiesce = (signal: AbortSignal) => Promise<void>;

  /** Adapter binding the pure state machine to app-server and workspace IO. */
  export interface IAdapter {
    /** Computes the current protected authored-state digest. */
    digest: IDigest;

    /** Creates each round's neutral canonical bundle and isolated copies. */
    materializeBundle: IMaterializeBundle;

    /** Creates fresh finder contexts. */
    find: IFind;

    /** Produces structured harness dedupe decisions. */
    deduplicate: IDeduplicate;

    /** Creates fresh adversarial verifier contexts. */
    verify: IVerify;

    /** Runs one deterministic pre-fixer mutation and restores exact bytes. */
    checkMutation: ICheckMutation;

    /** Runs the original arm-aware fixer from a path-and-hash handoff. */
    fix: IFix;

    /** Proves every handed-off defect resolved on fresh post-fix input. */
    resolveFix: IResolveFix;

    /** Runs the full independent build and test gates. */
    gate: IGate;

    /** Kills and joins every live adapter operation before terminal sealing. */
    quiesce: IQuiesce;
  }
}
