import type { IEvidenceBenchmarkCodexRecord } from "./IEvidenceBenchmarkCodexRecord.ts";
import type { IEvidenceBenchmarkCodexCampaign } from "./IEvidenceBenchmarkCodexCampaign.ts";

/**
 * Configuration, persisted state, and result contracts for one Codex benchmark
 * run.
 */
export namespace IEvidenceBenchmarkCodexRun {
  /** The only model admitted into the registered evidence benchmark matrix. */
  export type Model = "gpt-5.6-terra";

  /** Reasoning effort pre-registered by issue #88 for every matrix cell. */
  export type Effort = "high";

  /** Service tier frozen for every request in the registered matrix. */
  export type ServiceTier = "priority";

  /** Overall runner states; no failure state is collapsed into completion. */
  export type Status = "running" | "interrupted" | "failed" | "completed";

  /** Goal states exposed by Codex 0.145 app-server. */
  export type GoalStatus =
    | "active"
    | "paused"
    | "blocked"
    | "usageLimited"
    | "budgetLimited"
    | "complete";

  /** Terminal outcomes reported for an individual Codex turn. */
  export type TurnStatus =
    "inProgress" | "completed" | "interrupted" | "failed";

  /** Structured terminal report required from every generation-class turn. */
  export interface IGenerationOutcome {
    /** Whether requested work is complete or right-censored. */
    outcome: "complete" | "interrupted";

    /** Concise evidence-backed terminal summary. */
    summary: string;

    /** Empty only for complete; non-empty for interrupted. */
    unfinished: string[];
  }

  /** Exact adjudication separating turn completion from work completion. */
  export interface ICompletionAdjudication {
    /** Primary generation thread. */
    threadId: string;

    /** Completed generation turn. */
    turnId: string;

    /** Unique final upstream response. */
    responseId: string;

    /** Final assistant item containing structured output. */
    assistantItemId: string;

    /** Only completed turns are eligible. */
    turnStatus: "completed";

    /** Generation-class turn role. */
    context: "phase1" | "completion_challenge";

    /** SHA-256 of the provider-compatible output schema sent with the turn. */
    outputSchemaSha256: string;

    /** SHA-256 of the stricter local cross-field validation contract. */
    localValidationSha256: string;

    /** Literal proof that stricter local validation passed. */
    localValidationPassed: true;

    /** Strictly validated structured output. */
    output: IGenerationOutcome;

    /** Goal status observed near adjudication, when available. */
    goalStatus: GoalStatus | null;

    /** Goal is supporting evidence, never a substitute. */
    goalConsistency: "consistent" | "mismatch" | "unavailable";

    /** Schema-valid completion or right-censored decision. */
    decision: "complete" | "interrupted";

    /** Semantic event sequence recording the decision. */
    eventSeq: number;

    /** Semantic event hash recording the decision. */
    eventSha256: string;

    /** UTC adjudication timestamp. */
    adjudicatedAtUtc: string;
  }

  /** Independent validation categories whose success defines `t_green`. */
  export type GateKind = "build" | "test" | "custom";

  /** One shell-free validation command executed independently of the agent. */
  export interface IGate {
    /** Stable gate name used in event and artifact filenames. */
    name: string;

    /**
     * Semantic gate category; at least one build and one test gate are
     * required.
     */
    kind: GateKind;

    /** Executable invoked directly without an intermediate command shell. */
    command: string;

    /** Literal argv values supplied to the executable in their declared order. */
    arguments: string[];

    /** Absolute working directory, normally the generated project root. */
    cwd: string;

    /**
     * Optional environment additions; omitted keys inherit the runner
     * environment.
     */
    environment?: Readonly<Record<string, string>>;

    /** Maximum gate duration in milliseconds before process-tree termination. */
    timeoutMs: number;
  }

  /** Cost authority captured before a paid benchmark can pass the launch gate. */
  export interface ICostAuthorization {
    /** Stable approval or campaign identifier. */
    id: string;

    /** UTC timestamp at which the authorized operator approved the run. */
    approvedAtUtc: string;

    /** Maximum authorized spend in the price sheet's currency. */
    maximumCost: number;

    /** ISO 4217 currency code used by the frozen price sheet. */
    currency: string;
  }

  /** Experiment identity and frozen non-runner inputs surrounding one runner. */
  export interface IExperimentManifest {
    /** Globally unique run id shared by every event and result artifact. */
    runId: string;

    /** Frozen subject name such as todo or reddit. */
    subject: string;

    /** Frozen benchmark arm. */
    arm: "evidence" | "plain";

    /** One-based replicate index within the subject-arm block. */
    replicate: number;

    /** Randomization or scheduling block identifier. */
    blockId: string;

    /** Validated merged product source revision. */
    sourceRevision: string;

    /** SHA-256 of the full template input tree manifest. */
    templateSha256: string;

    /** SHA-256 of the selected requirement corpus manifest. */
    requirementsSha256: string;

    /** SHA-256 of the leaf acceptance catalog used as the quality denominator. */
    acceptanceCatalogSha256: string;

    /** Number of leaf acceptance clauses in the primary quality denominator. */
    acceptanceCatalogCount: number;

    /** SHA-256 of a context-only catalog, null when the subject has none. */
    contextCatalogSha256: string | null;

    /** Context-only clause count; it is never added to the acceptance count. */
    contextCatalogCount: number;

    /** Frozen guard preventing the two distinct denominators from being summed. */
    denominatorsSummed: false;

    /** SHA-256 of the complete generated project input manifest. */
    projectInputSha256: string;

    /** SHA-256 of the locally packed measured product tarball. */
    productTgzSha256: string;

    /** SHA-256 of the frozen toolchain and host environment manifest. */
    environmentSha256: string;

    /** Maximum simultaneously measured cells in this scheduling block. */
    concurrency: number;

    /** Explicit spend authority required before a production runner starts. */
    costAuthorization: ICostAuthorization;
  }

  /** Codex-specific immutable inputs nested inside the experiment manifest. */
  export interface IRunnerManifest {
    /** Exact Codex CLI version, including the numeric release. */
    codexCliVersion: string;

    /** SHA-256 of the native Codex executable used to start app-server. */
    codexExecutableSha256: string;

    /** SHA-256 of the experimental app-server JSON schema archived for the run. */
    codexSchemaSha256: string;

    /** Exact number of regular files in the extracted schema tree. */
    codexSchemaFileCount: 347;

    /** Exact aggregate regular-file bytes in the extracted schema tree. */
    codexSchemaByteLength: 3_303_877;

    /** SHA-256 of immutable archive bytes, null for a tracked loose snapshot. */
    codexSchemaArchiveSha256: string | null;

    /** Exact archive byte length, zero for a tracked loose snapshot. */
    codexSchemaArchiveByteLength: number;

    /** Frozen algorithm used to hash the sorted app-server schema tree. */
    codexSchemaTreeAlgorithm: "sha256(sorted-posix-path-nul-bytes-nul)";

    /** Codex source commit corresponding to the pinned executable. */
    codexSourceCommit: string;

    /** Frozen model; the runner rejects every value except `gpt-5.6-terra`. */
    model: Model;

    /** Frozen reasoning effort applied to the first and all subsequent turns. */
    effort: Effort;

    /** Frozen service tier applied at thread start and every subsequent turn. */
    serviceTier: ServiceTier;

    /** Provider substitution is forbidden for exact model comparability. */
    allowProviderModelFallback: false;

    /** Goal objective is staged paused so it cannot auto-start a Goal-only turn. */
    initialGoalStatus: "paused";

    /** Goal activation occurs only after the first user turn has started. */
    goalActivationPolicy: "paused-before-first-turn-active-after-turn-started";

    /** First user prompt repeats every task fact needed before Goal activation. */
    firstPromptSelfContained: true;

    /** SHA-256 of the exact first user message bytes. */
    promptSha256: string;

    /** SHA-256 of the exact Goal objective bytes. */
    goalSha256: string;

    /** SHA-256 of the same-session completion challenge bytes. */
    completionChallengeSha256: string;

    /** SHA-256 of the deterministic restart continuation message. */
    recoveryPromptSha256: string;

    /** SHA-256 of the three registered Phase 2 prompts. */
    phase2PromptSha256: {
      /** Fresh finder prompt. */
      finder: string;

      /** Fresh adversarial verifier prompt. */
      verifier: string;

      /** Original-thread fixer prompt. */
      fixer: string;
    };

    /** SHA-256 of the strict generation outcome JSON schema. */
    generationOutcomeSchemaSha256: string;

    /** SHA-256 of local cross-field completion validation semantics. */
    generationOutcomeLocalValidationSha256: string;

    /** SHA-256 of the frozen price sheet used only by downstream cost reduction. */
    priceSheetSha256: string;
  }

  /** Immutable outer experiment manifest that wraps the Codex runner manifest. */
  export interface IManifest {
    /** Manifest schema version understood by the runner. */
    schemaVersion: 1;

    /** Subject, arm, source, input, environment, concurrency, and cost identity. */
    experiment: IExperimentManifest;

    /** Frozen Codex protocol, prompt, Goal, and model identity. */
    runner: IRunnerManifest;

    /** UTC timestamp at which the immutable manifest was first written. */
    createdAtUtc: string;
  }

  /**
   * App-server process launch contract, replaceable by a fake in deterministic
   * tests.
   */
  export interface IAppServer {
    /** Executable path or command name for the pinned Codex binary. */
    command: string;

    /**
     * Literal arguments; production runs use app-server stdio with Goal
     * enabled.
     */
    arguments: string[];

    /** Optional isolated process environment additions. */
    environment?: Readonly<Record<string, string>>;

    /** Grace interval in milliseconds before a stuck process tree is terminated. */
    shutdownGraceMs: number;
  }

  /** Complete immutable input to one runner invocation or resume. */
  export interface IOptions {
    /** Absolute generated project directory controlled by the measured agent. */
    workspace: string;

    /** Absolute run record directory; it must not be shared by another run. */
    outputDirectory: string;

    /** Exact initial user message sent without trimming or normalization. */
    prompt: string;

    /** Exact Goal objective installed as durable thread state. */
    goal: string;

    /** Exact challenge injected after the first completion claim. */
    completionChallenge: string;

    /** Frozen message used only after process failure and thread resume. */
    recoveryPrompt: string;

    /** Strict JSON Schema applied to all generation-class turns. */
    generationOutcomeSchema: Readonly<Record<string, unknown>>;

    /** Immutable provenance that must survive and match every restart. */
    manifest: IManifest;

    /** App-server launch command, normally the pinned Codex executable. */
    appServer: IAppServer;

    /** Optional immutable original archive; regenerated bytes are forbidden. */
    codexSchemaArchivePath?: string;

    /** Extracted schema tree corresponding exactly to the immutable archive. */
    codexSchemaDirectory: string;

    /** Independent build and test commands that decide `t_green`. */
    gates: IGate[];

    /** Maximum run wall time in milliseconds, excluding prior materialization. */
    timeoutMs: number;

    /**
     * App-server restart continuation is forbidden in Codex 0.145.0 because
     * `thread/resume` cannot re-enable raw response events.
     */
    maximumRestarts: 0;

    /** Maximum repair cycles after independent gates report a failure. */
    maximumGateRepairs: number;

    /** Request timeout in milliseconds for one JSON-RPC response. */
    requestTimeoutMs: number;

    /** Heartbeat rewrite interval in milliseconds. */
    heartbeatIntervalMs: number;

    /** Delay in milliseconds used to prove no active descendant work remains. */
    dryIntervalMs: number;

    /** Absolute canonical result directory promoted only after terminal success. */
    canonicalResultDirectory: string;
  }

  /** Persisted identity and status of one primary or descendant thread. */
  export interface IThreadState {
    /** Codex thread identifier. */
    id: string;

    /** Parent thread identifier, null for the primary thread. */
    parentThreadId: string | null;

    /** Session identifier shared by the primary thread and its descendants. */
    sessionId: string;

    /** Last observed runtime state of the thread. */
    status: "unknown" | "idle" | "active" | "systemError";

    /** Last active or completed turn identifier, when observed. */
    turnId?: string;

    /** Last observed turn outcome, when the thread has produced a turn. */
    turnStatus?: TurnStatus;

    /** Persisted rollout path reported by app-server, when available. */
    rolloutPath?: string;
  }

  /** Durable heads needed to verify and reopen every append-only stream. */
  export interface IStreamHeads {
    /** Exact raw byte heads by transport direction. */
    raw: Record<
      IEvidenceBenchmarkCodexRecord.Direction,
      {
        /** Committed raw byte length. */
        byteLength: number;

        /** SHA-256 of all committed raw bytes. */
        sha256: string;
      }
    >;

    /** Transport envelope ledger head. */
    envelope: {
      /** Last globally committed envelope sequence. */
      lastSequence: number;

      /** Exact ledger byte length. */
      byteLength: number;

      /** SHA-256 of exact ledger bytes. */
      sha256: string;
    };

    /** Semantic event hash-chain head. */
    event: {
      /** Last globally committed semantic event sequence. */
      lastSequence: number;

      /** Last semantic event hash, or 64 zeroes before the first event. */
      lastEventSha256: string;

      /** Exact ledger byte length. */
      byteLength: number;

      /** SHA-256 of exact ledger bytes. */
      sha256: string;
    };
  }

  /** Mutable checkpoint restored after controller or app-server restart. */
  export interface IRunState {
    /** State schema version understood by the runner. */
    schemaVersion: 1;

    /** Overall run status, kept separate from individual turn outcomes. */
    status: Status;

    /** SHA-256 of the immutable manifest serialized at run creation. */
    manifestSha256: string;

    /** Current runner phase. */
    phase:
      | "setup"
      | "phase1"
      | "completion_challenge"
      | "campaign"
      | "grading"
      | "terminal";

    /** UTC timestamp at which `t0` was recorded. */
    startedAtUtc: string;

    /** Latest UTC timestamp represented by this checkpoint. */
    updatedAtUtc: string;

    /** Primary Codex thread identifier after thread start succeeds. */
    primaryThreadId?: string;

    /** Session identifier used to discover descendant threads. */
    sessionId?: string;

    /** Every observed primary and descendant thread keyed by thread id. */
    threads: Record<string, IThreadState>;

    /** Latest durable Goal observation, or null before Goal creation. */
    goal: {
      /** SHA-256 of the exact objective bytes. */
      objectiveSha256: string;

      /** Latest observed Goal state. */
      status: GoalStatus;

      /** UTC observation timestamp. */
      checkedAtUtc: string;
    } | null;

    /** Active primary turn identifier, absent between turns. */
    activeTurnId?: string;

    /** Number of app-server restarts already consumed. */
    restartCount: number;

    /** Number of independent gate repair cycles already consumed. */
    gateRepairCount: number;

    /** Whether the first immutable user prompt has been submitted. */
    firstTurnStarted: boolean;

    /** Strict Phase 1 terminal adjudication, or null before terminal output. */
    completionAdjudication: ICompletionAdjudication | null;

    /** Immutable `t_done` snapshot boundary, or null before valid completion. */
    phase1Boundary: IEvidenceBenchmarkCodexCampaign.IPhase1Boundary | null;

    /** Whether the post-`t_done` challenge turn has started. */
    completionChallengeStarted: boolean;

    /** Strict challenge adjudication, or null before challenge completion. */
    completionChallengeAdjudication: ICompletionAdjudication | null;

    /** Whether independent build and test gates have both passed. */
    green: boolean;

    /** Registered milestones recorded exactly once and snapshotted atomically. */
    milestones: Partial<
      Record<
        IEvidenceBenchmarkCodexRecord.Milestone,
        IEvidenceBenchmarkCodexRecord.IMilestone
      >
    >;

    /** Durable byte and hash heads used for exact fresh-process recovery. */
    streamHeads: IStreamHeads;

    /** Last JSON-RPC request id allocated by the controller. */
    lastRequestId: number;

    /** UTC timestamp of latest protocol, gate, or controller activity. */
    lastActivityAtUtc: string;

    /** SHA-256 of latest campaign checkpoint, or null before Phase 2. */
    campaignCheckpointSha256: string | null;

    /** Source snapshot captured immediately at `t_done`. */
    tDoneSourceSnapshotSha256: string | null;

    /** Deterministic retained-source snapshot SHA-256 captured at `t_dry`. */
    tDrySourceSnapshotSha256: string | null;

    /** Explicit terminal seal, null while running. */
    terminal: {
      /** UTC terminal timestamp. */
      atUtc: string;

      /** Evidence-backed terminal reason. */
      reason: string;

      /** Right-censoring subtype, null for success or deterministic failure. */
      interruptionSubtype:
        | null
        | "quota"
        | "provider"
        | "host"
        | "watchdog"
        | "user_abort"
        | "harness";

      /** SHA-256 of final pre-seal checkpoint. */
      lastCheckpointSha256: string;
    } | null;
  }

  /** Final runner return value referencing all durable evidence. */
  export interface IResult {
    /** Terminal overall run state. */
    status: Exclude<Status, "running">;

    /**
     * Absolute directory containing the preserved raw record and workspace
     * links.
     */
    outputDirectory: string;

    /** Primary Codex thread identifier, when thread creation succeeded. */
    primaryThreadId?: string;

    /** Terminal reason for failed or interrupted outcomes. */
    terminalReason?: string;

    /** Absolute final checkpoint path. */
    checkpointPath: string;

    /** Absolute exact-usage summary path. */
    usagePath: string;

    /** Absolute activity annotation ledger path. */
    activityPath: string;
  }
}
