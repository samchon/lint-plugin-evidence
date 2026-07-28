/**
 * Configuration, persisted state, and result contracts for one Codex benchmark
 * run.
 */
export namespace IEvidenceBenchmarkCodexRun {
  /** The only model admitted into the registered evidence benchmark matrix. */
  export type Model = "gpt-5.6-terra";

  /** Explicit reasoning efforts that may be frozen in a run manifest. */
  export type Effort = "none" | "low" | "medium" | "high" | "xhigh" | "max";

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

    /** Codex source commit corresponding to the pinned executable. */
    codexSourceCommit: string;

    /** Frozen model; the runner rejects every value except `gpt-5.6-terra`. */
    model: Model;

    /** Frozen reasoning effort applied to the first and all subsequent turns. */
    effort: Effort;

    /** Initial Goal state set before the first user turn. */
    initialGoalStatus: "active";

    /** SHA-256 of the exact first user message bytes. */
    promptSha256: string;

    /** SHA-256 of the exact Goal objective bytes. */
    goalSha256: string;

    /** SHA-256 of the same-session completion challenge bytes. */
    completionChallengeSha256: string;

    /** SHA-256 of the deterministic restart continuation message. */
    recoveryPromptSha256: string;

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

    /** Immutable provenance that must survive and match every restart. */
    manifest: IManifest;

    /** App-server launch command, normally the pinned Codex executable. */
    appServer: IAppServer;

    /** Independent build and test commands that decide `t_green`. */
    gates: IGate[];

    /** Maximum run wall time in milliseconds, excluding prior materialization. */
    timeoutMs: number;

    /** Maximum app-server process restarts before the run becomes interrupted. */
    maximumRestarts: number;

    /** Maximum repair cycles after independent gates report a failure. */
    maximumGateRepairs: number;

    /** Request timeout in milliseconds for one JSON-RPC response. */
    requestTimeoutMs: number;

    /** Heartbeat rewrite interval in milliseconds. */
    heartbeatIntervalMs: number;

    /** Delay in milliseconds used to prove no active descendant work remains. */
    dryIntervalMs: number;
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

  /** Mutable checkpoint restored after a controller or app-server restart. */
  export interface IState {
    /** State schema version understood by the runner. */
    schemaVersion: 1;

    /** Overall run status, kept separate from individual turn outcomes. */
    status: Status;

    /** SHA-256 of the immutable manifest serialized at run creation. */
    manifestSha256: string;

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

    /** Last observed Goal status for the primary thread. */
    goalStatus?: GoalStatus;

    /** Active primary turn identifier, absent between turns. */
    activeTurnId?: string;

    /** Number of app-server restarts already consumed. */
    restartCount: number;

    /** Number of independent gate repair cycles already consumed. */
    gateRepairCount: number;

    /** Whether the first immutable user prompt has been submitted. */
    firstTurnStarted: boolean;

    /** Whether a completion claim has been observed and timestamped. */
    completionClaimObserved: boolean;

    /** Whether the same-session challenge has been accepted by app-server. */
    completionChallengeSent: boolean;

    /** Whether a rejected in-turn steer must become the next turn. */
    completionChallengePending: boolean;

    /** Whether independent build and test gates have both passed. */
    green: boolean;

    /** Last globally monotonic append-only transport envelope sequence. */
    lastEnvelopeSequence: number;

    /** Last JSON-RPC request id allocated by the controller. */
    lastRequestId: number;

    /** Human-readable terminal reason, present for failed or interrupted runs. */
    terminalReason?: string;
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
