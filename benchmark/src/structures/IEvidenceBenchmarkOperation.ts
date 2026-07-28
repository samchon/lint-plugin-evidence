import type { IEvidenceBenchmarkMaterialization } from "./IEvidenceBenchmarkMaterialization.ts";

/** Immutable plans and durable state owned by the benchmark operations CLI. */
export namespace IEvidenceBenchmarkOperation {
  /** Commands exposed by the benchmark operator entrypoint. */
  export type Command =
    "prepare" | "start" | "status" | "resume" | "abort" | "grade" | "report";

  /** States of one outer run record without collapsing terminal outcomes. */
  export type Status =
    "prepared" | "running" | "completed" | "failed" | "interrupted";

  /** Liveness classifications safe to derive from a persisted run lock. */
  export type Liveness = "live" | "stale" | "unknown" | "unlocked";

  /** Terminal boundary retained separately from the broad outer status. */
  export type TerminalSubtype =
    | "completed"
    | "runner_failure"
    | "integrity_failure"
    | "operator_abort"
    | "liveness_loss"
    | "safety_limit";

  /** Frozen token and wall-clock authority for one concurrent block. */
  export interface ISafetyAuthorization {
    /** Stable operator authorization identity. */
    id: string;

    /** UTC operator approval timestamp. */
    approvedAtUtc: string;

    /** Equal-arm observed token threshold for each selected subject. */
    maximumObservedTotalTokensBySubject: Partial<
      Readonly<Record<IEvidenceBenchmarkMaterialization.Project, number>>
    >;

    /** Equal-arm measured duration used once to derive each t0 deadline. */
    maximumDurationMsBySubject: Partial<
      Readonly<Record<IEvidenceBenchmarkMaterialization.Project, number>>
    >;

    /** Response-observed aggregate threshold across all four cells. */
    maximumObservedBlockTotalTokens: number;

    /** Frozen launch-relative outer safety duration for the whole block. */
    maximumBlockDurationMs: number;

    /** Monetary conversion remains unavailable and is never fabricated. */
    monetaryStatus: "unavailable";

    /** In-flight responses mean neither token threshold is a hard ceiling. */
    hardCeilingGuaranteed: false;
  }

  /** One cell inside a randomized two-subject four-cell block. */
  export interface ICell {
    /** Globally unique run identifier. */
    runId: string;

    /** Requirement subject assigned to this cell. */
    project: IEvidenceBenchmarkMaterialization.Project;

    /** Benchmark mechanism assigned to this cell. */
    arm: IEvidenceBenchmarkMaterialization.Arm;

    /** One-based replicate number shared across the block. */
    replicate: number;

    /** Zero-based randomized launch position. */
    launchIndex: number;

    /** Absolute cell root owned by materialization and this run. */
    root: string;

    /** Absolute generated project directory controlled by the coding agent. */
    workspace: string;

    /** Exact materialization manifest path. */
    materializationManifest: string;

    /** Exact materialization manifest SHA-256. */
    materializationManifestSha256: string;

    /** Exact dependency setup record path. */
    setupRecord: string;

    /** Exact dependency setup record SHA-256. */
    setupRecordSha256: string;
  }

  /** Self-hashed immutable launch plan for one four-cell block. */
  export interface IPlan {
    /** Plan schema version. */
    schemaVersion: 1;

    /** Randomized scheduling block identity. */
    blockId: string;

    /** Exact merged source revision prepared for every cell. */
    sourceRevision: string;

    /** Absolute repository root whose inputs were prepared. */
    repository: string;

    /** UTC completion timestamp of deterministic preparation. */
    preparedAtUtc: string;

    /** One-based replicate number for each subject-arm cell. */
    replicate: number;

    /** Two subjects measured together in this scheduling wave. */
    subjects: readonly ["todo", "reddit"] | readonly ["shopping", "erp"];

    /** Remote default branch proved to contain the source revision. */
    mergedBaseRef: string;

    /** Exact fetched remote-default revision used for ancestor admission. */
    mergedBaseRevision: string;

    /** UTC timestamp after the remote default branch fetch completed. */
    remoteVerifiedAtUtc: string;

    /** Absolute detached LF-only checkout used as every execution input. */
    sealedSource: string;

    /** Exact sealed-source manifest path. */
    sealedSourceManifest: string;

    /** SHA-256 of the exact sealed-source manifest bytes. */
    sealedSourceManifestSha256: string;

    /** Hexadecimal randomization seed retained for reproducibility. */
    seed: string;

    /** Frozen block-global and equal-arm safety authority. */
    safety: ISafetyAuthorization;

    /** Required block concurrency; all four cells enter together. */
    concurrency: 4;

    /** Randomized launch order expressed as exact run identifiers. */
    launchOrder: string[];

    /** Four prepared cells, independent of randomized order. */
    cells: ICell[];

    /** Exact prepared product archive provenance path. */
    productProvenance: string;

    /** Exact product provenance SHA-256. */
    productProvenanceSha256: string;

    /** SHA-256 of every preceding canonical plan field. */
    planSha256: string;
  }

  /** Inputs accepted by deterministic four-cell preparation. */
  export interface IPrepareRequest {
    /** Absolute evidence repository root. */
    repository: string;

    /** New immutable plan path; an existing file is never overwritten. */
    plan: string;

    /** Randomized scheduling block identifier. */
    blockId: string;

    /** One-based replicate number. */
    replicate: number;

    /** Two-subject scheduling wave; Todo and Reddit are the default. */
    subjects?: readonly ["todo", "reddit"] | readonly ["shopping", "erp"];

    /** Optional hexadecimal seed; cryptographic random bytes are used otherwise. */
    seed?: string;

    /** Frozen token and absolute-wall authorization. */
    safety: ISafetyAuthorization;
  }

  /** Mutable snapshot for one outer run record. */
  export interface IState {
    /** State schema version. */
    schemaVersion: 1;

    /** Monotonic one-based transition sequence. */
    sequence: number;

    /** Exact run identity. */
    runId: string;

    /** Current outer run state. */
    status: Status;

    /** UTC timestamp of the latest durable state transition. */
    updatedAtUtc: string;

    /** Current controller PID while running. */
    controllerPid: number | null;

    /** Terminal reason when the run no longer executes. */
    terminalReason: string | null;

    /** Explicit terminal boundary, including safety stops. */
    terminalSubtype: TerminalSubtype | null;

    /** SHA-256 of the preceding state, or 64 zeroes for sequence one. */
    previousSha256: string;

    /** SHA-256 of every preceding canonical state field. */
    stateSha256: string;
  }

  /** Exclusive controller lock and heartbeat for one run. */
  export interface ILock {
    /** Lock schema version. */
    schemaVersion: 1;

    /** Exact run identity. */
    runId: string;

    /** Host-local controller process identifier. */
    pid: number;

    /** Hostname in whose PID namespace the controller runs. */
    hostname: string;

    /** Random lock-owner identity preventing PID-reuse confusion. */
    ownerId: string;

    /** Owner-specific append-only heartbeat ledger path. */
    heartbeat: string;

    /** UTC lock acquisition timestamp. */
    acquiredAtUtc: string;

    /** UTC heartbeat timestamp rewritten while the controller is live. */
    heartbeatAtUtc: string;
  }

  /** Operator request consumed cooperatively by the live cell controller. */
  export interface IAbortRequest {
    /** Abort request schema version. */
    schemaVersion: 1;

    /** Exact run identity. */
    runId: string;

    /** Non-empty operator reason retained in the permanent record. */
    reason: string;

    /** Operator or shared block-safety boundary. */
    subtype: "operator_abort" | "liveness_loss" | "safety_limit";

    /** Shared immutable block-stop digest for a safety stop. */
    blockStopSha256: string | null;

    /** UTC request timestamp. */
    requestedAtUtc: string;
  }

  /** Terminal outer seal referencing the runner-owned terminal record. */
  export interface ITerminal {
    /** Terminal seal schema version. */
    schemaVersion: 1;

    /** Exact run identity. */
    runId: string;

    /** Terminal status; prepared and running are never sealed. */
    status: "completed" | "failed" | "interrupted";

    /** Evidence-backed terminal reason. */
    reason: string;

    /** Explicit terminal boundary, including safety stops. */
    subtype: TerminalSubtype;

    /** UTC seal timestamp. */
    sealedAtUtc: string;

    /** Runner-owned result directory preserved for inspection. */
    runnerRecord: string;

    /** Runner-owned terminal checkpoint or summary path. */
    runnerTerminal: string;

    /** SHA-256 of the runner-owned terminal summary. */
    runnerTerminalSha256: string;

    /** Shared block-stop digest for safety-limited cells. */
    blockStopSha256: string | null;
  }

  /** Read-only status returned by `status` and block summaries. */
  export interface IStatus {
    /** Exact run identity. */
    runId: string;

    /** Current durable outer status. */
    status: Status;

    /** Controller lock liveness. */
    liveness: Liveness;

    /** Heartbeat age in milliseconds, null when no readable lock exists. */
    heartbeatAgeMs: number | null;

    /** Terminal reason when available. */
    terminalReason: string | null;

    /** Absolute run root. */
    root: string;
  }

  /** Live runner observation used only for outer safety and diagnostics. */
  export interface IObservation {
    /** Exact run identity. */
    runId: string;

    /** Deduplicated response-observed provider total tokens. */
    observedTotalTokens: number;

    /** Exact deduplicated upstream responses supporting the cumulative total. */
    responses: Array<{
      /** Globally unique upstream response identity. */
      responseId: string;

      /** Exact provider total tokens for this response. */
      totalTokens: number;
    }>;

    /** Whether forced termination may have hidden later usage. */
    usageLowerBound: boolean;

    /** SHA-256 of the runner checkpoint supporting this observation. */
    checkpointSha256: string;

    /** Process-tree telemetry exposed by the runner when supported. */
    process: {
      /** Live descendant process count, including the app-server. */
      count: number | null;

      /** Aggregate resident bytes, null when the host cannot provide it. */
      rssBytes: number | null;

      /** Aggregate user CPU microseconds, null when unsupported. */
      userCpuMicros: number | null;

      /** Aggregate system CPU microseconds, null when unsupported. */
      systemCpuMicros: number | null;

      /** Aggregate disk-read bytes, null when unsupported. */
      diskReadBytes: number | null;

      /** Aggregate disk-write bytes, null when unsupported. */
      diskWriteBytes: number | null;
    };
  }

  /** Immutable shared stop record binding every cell to one safety decision. */
  export interface IBlockStop {
    /** Block-stop schema version. */
    schemaVersion: 1;

    /** Exact randomized block identity. */
    blockId: string;

    /** Safety boundary that triggered the shared stop. */
    boundary:
      | "maximum_observed_block_total_tokens"
      | "hard_deadline"
      | "safety_monitor_failure";

    /** Frozen threshold or absolute deadline from the plan. */
    limit: number | string;

    /** Aggregate tokens visible when the boundary was first observed. */
    observedBlockTotalTokens: number;

    /** Per-cell observations supporting the aggregate. */
    observations: IObservation[];

    /** UTC observation timestamp. */
    observedAtUtc: string;

    /** In-flight work means the observed boundary is not a hard ceiling. */
    hardCeilingGuaranteed: false;

    /** SHA-256 of every preceding canonical stop field. */
    blockStopSha256: string;
  }

  /** Write-once launch boundary deriving the outer absolute block deadline. */
  export interface IBlockExecutionSafety {
    /** Execution-safety schema version. */
    schemaVersion: 1;

    /** Exact randomized block identity. */
    blockId: string;

    /** Immutable operation plan digest. */
    planSha256: string;

    /** Frozen relative duration from the immutable plan. */
    maximumBlockDurationMs: number;

    /** UTC launch boundary recorded immediately before cell start. */
    launchedAtUtc: string;

    /** Monotonic launch boundary in nanoseconds. */
    launchedAtMonotonicNs: string;

    /** Absolute deadline derived once from launchedAtUtc and frozen duration. */
    hardDeadlineUtc: string;

    /** SHA-256 of every preceding canonical execution-safety field. */
    executionSafetySha256: string;
  }

  /** One low-overhead outer diagnostic sample, separate from primary timing. */
  export interface IBlockSample {
    /** Monotonic one-based sample sequence. */
    sequence: number;

    /** Exact block identity. */
    blockId: string;

    /** UTC sample timestamp. */
    atUtc: string;

    /** Monotonic nanoseconds from the controller clock. */
    monotonicNs: string;

    /** Sampling work duration in milliseconds. */
    samplerElapsedMs: number;

    /** Cadence slots missed since the preceding sample. */
    droppedSamples: number;

    /** Host-level cumulative and point-in-time diagnostics. */
    host: {
      /** Operating system and architecture pin. */
      platform: string;

      /** Host logical CPU count. */
      cpuCount: number;

      /** Aggregate cumulative idle CPU milliseconds. */
      cpuIdleMs: number;

      /** Aggregate cumulative non-idle CPU milliseconds. */
      cpuBusyMs: number;

      /** Total host memory bytes. */
      totalMemoryBytes: number;

      /** Free host memory bytes. */
      freeMemoryBytes: number;

      /** One-minute load average, null on unsupported Windows hosts. */
      loadAverage1m: number | null;

      /** Filesystem free bytes, null without a pinned platform counter. */
      diskFreeBytes: null;
    };

    /** Exact per-cell runner observations available at this cadence. */
    observations: IObservation[];

    /** Aggregate response-observed tokens across available cells. */
    observedBlockTotalTokens: number;

    /** SHA-256 of the preceding sample, or 64 zeroes for sequence one. */
    previousSha256: string;

    /** SHA-256 of every preceding canonical sample field. */
    sampleSha256: string;
  }

  /** Append-only outer event capturing orchestration transitions. */
  export interface IEvent {
    /** Monotonic one-based event sequence within one run. */
    sequence: number;

    /** Exact run identity. */
    runId: string;

    /** UTC event timestamp. */
    atUtc: string;

    /** SHA-256 of the preceding event, or 64 zeroes for sequence one. */
    previousSha256: string;

    /** Stable event kind. */
    kind:
      | "prepared"
      | "lock-acquired"
      | "started"
      | "abort-requested"
      | "terminal-sealed"
      | "lock-released"
      | "stale-lock-taken-over";

    /** Event-specific JSON-compatible detail. */
    detail: Readonly<Record<string, unknown>>;

    /** SHA-256 of every preceding canonical event field. */
    eventSha256: string;
  }
}
