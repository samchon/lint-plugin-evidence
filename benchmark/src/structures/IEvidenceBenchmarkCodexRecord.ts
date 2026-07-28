/**
 * Append-only transport, metric, milestone, and activity records emitted by the
 * Codex benchmark runner.
 */
export namespace IEvidenceBenchmarkCodexRecord {
  /** Byte-stream directions captured without decoding or normalization. */
  export type Direction = "client" | "server" | "stderr";

  /** Measurement provenance that prevents estimates from entering exact totals. */
  export type Measurement =
    "exact-event" | "heuristic-classification" | "ai-estimate";

  /** Stable activity categories used by later human or AI trace audits. */
  export type ActivityCategory =
    | "skill"
    | "build"
    | "test"
    | "implementation"
    | "requirement"
    | "debug"
    | "verification"
    | "tool"
    | "other";

  /** Registered milestone names whose timestamps come from the live stream. */
  export type Milestone = "t0" | "t_done" | "t_green" | "t_dry";

  /** Runner phases used to partition setup, agent, gate, and terminal work. */
  export type Phase =
    "setup" | "agent" | "gate" | "reconciliation" | "terminal";

  /** Producer identities for semantic events. */
  export type Actor = "runner" | "client" | "app-server" | "gate" | "auditor";

  /** One append-only raw chunk and its location in a direction-specific file. */
  export interface IEnvelope {
    /** Global sequence allocated in receipt order across all three directions. */
    sequence: number;

    /** Raw stream direction. */
    direction: Direction;

    /** UTC receipt timestamp generated before the chunk is persisted. */
    receivedAtUtc: string;

    /** Monotonic nanoseconds since an arbitrary process-local epoch. */
    monotonicNanoseconds: string;

    /** Direction-specific raw filename holding the exact bytes. */
    rawFile: string;

    /** Inclusive byte offset at which this chunk begins. */
    byteOffset: number;

    /** Number of exact bytes in this chunk. */
    byteLength: number;

    /** SHA-256 of the exact chunk bytes. */
    sha256: string;
  }

  /** Parsed JSONL frame metadata linked back to exact server-stream bytes. */
  export interface IFrame {
    /** UTC time at which the complete newline-delimited frame became available. */
    receivedAtUtc: string;

    /** Inclusive byte offset in `server.raw.jsonl`. */
    byteOffset: number;

    /** Exact frame byte length excluding its newline delimiter. */
    byteLength: number;

    /** SHA-256 of the exact frame bytes. */
    sha256: string;

    /** Parsed JSON value, absent when syntax validation failed. */
    value?: unknown;

    /** Syntax failure preserved instead of silently dropping a malformed frame. */
    parseError?: string;
  }

  /** Crash-tail raw bytes preserved before committed stream reconciliation. */
  export interface IOrphanSegment {
    /** Raw stream direction. */
    direction: Direction;

    /** Original raw stream filename. */
    sourcePath: string;

    /** Original inclusive byte offset. */
    byteOffset: number;

    /** Exact preserved byte length. */
    byteLength: number;

    /** SHA-256 of exact preserved bytes. */
    sha256: string;

    /** Run-relative durable orphan segment path. */
    preservedPath: string;

    /** UTC preservation timestamp. */
    capturedAtUtc: string;
  }

  /** Non-overlapping Codex token categories from one upstream response. */
  export interface ITokenUsage {
    /** Provider total token counter; it is retained rather than recomputed. */
    totalTokens: number;

    /** Inclusive input tokens reported by Codex. */
    inputTokens: number;

    /** Cached subset of inclusive input tokens. */
    cachedInputTokens: number;

    /** Cache-write input tokens, zero when the CLI schema omits the category. */
    cacheWriteInputTokens: number;

    /** Inclusive output tokens reported by Codex. */
    outputTokens: number;

    /** Reasoning subset reported separately for audit and pricing. */
    reasoningOutputTokens: number;
  }

  /** Exact usage from one unique upstream Responses completion. */
  export interface IResponseUsage {
    /** Upstream response id used as the deduplication key. */
    responseId: string;

    /** Thread charged for the completion. */
    threadId: string;

    /** Turn charged for the completion. */
    turnId: string;

    /** Exact non-accumulated provider counters. */
    usage: ITokenUsage;

    /** UTC receipt timestamp of the first copy of this response event. */
    receivedAtUtc: string;
  }

  /** Latest accumulated token snapshot app-server exposed for one thread. */
  export interface IThreadUsage {
    /** Thread whose accumulated counters were observed. */
    threadId: string;

    /** Turn associated with the notification. */
    turnId: string;

    /** Latest completion delta exposed by app-server. */
    last: ITokenUsage;

    /** Accumulated thread counters used only for reconciliation. */
    total: ITokenUsage;

    /** UTC timestamp of the latest snapshot. */
    receivedAtUtc: string;
  }

  /** Difference between exact response sums and accumulated thread snapshots. */
  export interface IUsageDifference {
    /** Thread for which both exact and accumulated counters were available. */
    threadId: string;

    /** Exact response-level sum collected without duplicate response ids. */
    exact: ITokenUsage;

    /** Last accumulated app-server snapshot. */
    accumulated: ITokenUsage;

    /** Signed accumulated-minus-exact difference for every category. */
    difference: ITokenUsage;
  }

  /** Final token ledger with duplicates and reconciliation visible. */
  export interface IUsageReport {
    /** Report schema version. */
    schemaVersion: 1;

    /** Whether every expected exact raw response row was present and valid. */
    exactUsageComplete: boolean;

    /** Whether secondary accumulated counters reconcile to exact response rows. */
    accumulatedUsageReconciled: boolean;

    /** Unique exact upstream response events in first-seen order. */
    responses: IResponseUsage[];

    /** Duplicate response ids observed and excluded from every exact sum. */
    duplicateResponseIds: string[];

    /** Exact sum across the primary and every discovered descendant thread. */
    exactTotal: ITokenUsage;

    /** Exact sums partitioned by thread id. */
    exactByThread: Record<string, ITokenUsage>;

    /** Latest accumulated app-server snapshots partitioned by thread id. */
    latestThreadUsage: Record<string, IThreadUsage>;

    /** Per-thread reconciliation differences; non-zero values require audit. */
    reconciliation: IUsageDifference[];

    /** Parse, schema, rollout, or identity anomalies that forbid silent trust. */
    anomalies: string[];
  }

  /** One exact or estimated activity annotation kept outside token totals. */
  export interface IActivity {
    /** Stable append order within the activity ledger. */
    sequence: number;

    /** Primary or descendant thread id, when the source event identifies one. */
    threadId?: string;

    /** Turn id, when the source event identifies one. */
    turnId?: string;

    /** Item or response id, when one exists. */
    itemId?: string;

    /** Normalized activity category. */
    category: ActivityCategory;

    /** Whether the record is exact, mechanically inferred, or AI-estimated. */
    measurement: Measurement;

    /** Confidence from zero to one; exact records use one. */
    confidence: number;

    /** UTC timestamp derived from the live event or estimate creation. */
    observedAtUtc: string;

    /**
     * Exact duration in milliseconds, present only when the source event
     * exposes it.
     */
    exactDurationMs?: number;

    /** Estimated duration in milliseconds, never included in exact timing sums. */
    estimatedDurationMs?: number;

    /** Estimated token attribution, never included in exact response usage. */
    estimatedTokens?: number;

    /** Concise evidence or inference explaining the classification. */
    basis: string;
  }

  /** One live milestone event recorded exactly once. */
  export interface IMilestone {
    /** Registered milestone name. */
    name: Milestone;

    /** UTC wall-clock timestamp captured when the condition first held. */
    occurredAtUtc: string;

    /** Monotonic nanoseconds used for duration comparison within this run. */
    monotonicNanoseconds: string;

    /** Whether the condition itself was exact or heuristically classified. */
    measurement: Exclude<Measurement, "ai-estimate">;

    /** Evidence explaining why the milestone became true. */
    basis: string;
  }

  /** One independently executed build, test, or custom validation result. */
  export interface IGateResult {
    /** Stable configured gate name. */
    name: string;

    /** Configured semantic gate category. */
    kind: "build" | "test" | "custom";

    /** UTC process start timestamp. */
    startedAtUtc: string;

    /** UTC process completion timestamp. */
    completedAtUtc: string;

    /** Monotonic elapsed milliseconds measured by the controller. */
    durationMs: number;

    /** Process exit code, null when a signal or spawn error prevented one. */
    exitCode: number | null;

    /** Process signal, null for ordinary exit. */
    signal: NodeJS.Signals | null;

    /** Whether the process exceeded its configured timeout. */
    timedOut: boolean;

    /** Absolute stdout artifact path. */
    stdoutPath: string;

    /** Absolute stderr artifact path. */
    stderrPath: string;
  }

  /** Exact byte reference from a semantic event back into one raw stream. */
  export interface IRawReference {
    /** Raw stream direction. */
    direction: Direction;

    /** Direction-specific raw filename. */
    path: string;

    /** Inclusive byte offset of the referenced region. */
    byteOffset: number;

    /** Exact referenced byte length. */
    byteLength: number;

    /** SHA-256 of the exact referenced bytes. */
    sha256: string;
  }

  /** One semantic event appended by the controller beside the raw transport. */
  export interface IRunnerEvent {
    /** Globally unique run id from the immutable outer manifest. */
    runId: string;

    /** Globally increasing semantic-event sequence within the run. */
    seq: number;

    /** UTC event timestamp. */
    utc: string;

    /** Monotonic nanoseconds for local ordering. */
    monotonicNs: string;

    /** Measurement phase in which the event occurred. */
    phase: Phase;

    /** Producer that asserted the semantic event. */
    actor: Actor;

    /** Stable machine-readable event type. */
    type: string;

    /** JSON-serializable event payload. */
    payload: Readonly<Record<string, unknown>>;

    /** Exact raw byte reference, or null for controller-originated events. */
    rawRef: IRawReference | null;

    /** SHA-256 of the prior semantic event, or 64 zeroes for the first event. */
    previousEventSha256: string;

    /** SHA-256 of the canonical event excluding this field. */
    eventSha256: string;
  }
}
