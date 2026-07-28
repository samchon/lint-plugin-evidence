/** Contracts shared by deterministic benchmark quality producers. */
export namespace IEvidenceBenchmarkQualityGate {
  /** Subjects whose frozen corpora can be graded. */
  export type Subject = "todo" | "reddit" | "shopping" | "erp";

  /** Stable status used by every harness-owned check. */
  export type Status = "passed" | "failed" | "blocked";

  /** Fixed 390, 834, and 1440 CSS-pixel browser viewports. */
  export type Viewport = "mobile" | "tablet" | "desktop";

  /** Algorithm-qualified aggregate raw-byte tree identity. */
  export interface IRawTreeDigest {
    /** Exact versioned path-and-byte algorithm. */
    algorithmId: "sha256-posix-path-nul-bytes-v1";
    /** Aggregate tree SHA-256. */
    sha256: string;
  }

  /** Pre-seal immutable inputs shared by every deterministic producer. */
  export interface IInputProvenance {
    /** Outer benchmark run identity. */
    runId: string;
    /** Exact immutable outer run-manifest bytes. */
    runManifestSha256: string;
    /** Snapshot milestone measured by this producer. */
    milestone: "t_done" | "t_dry";
    /** Generated project snapshot measured by this producer. */
    snapshotRawTree: IRawTreeDigest;
    /** Frozen subject requirements used by this run. */
    subjectRequirementsRawTree: IRawTreeDigest;
  }

  /** One pre-registered hidden browser or HTTP scenario. */
  export interface IHiddenCase {
    /** Opaque stable case identity. */
    id: string;
    /** Acceptance criteria exercised by this case. */
    criterionIds: string[];
    /** External surface driven by the adapter. */
    kind: "http" | "browser";
    /** Named browser state, or null for an HTTP case. */
    routeState: string | null;
    /** Exact browser viewports, empty for an HTTP case. */
    viewports: Viewport[];
  }

  /** A harness-owned adapter pinned by exact source bytes. */
  export interface IAdapterPin {
    /** POSIX path below the benchmark root. */
    module: string;
    /** Exact adapter source digest. */
    sha256: string;
    /** Exact regular-file closure containing the adapter and its local assets. */
    closure: {
      root: string;
      files: number;
      treeSha256: string;
    };
    /** Sole supported named export. */
    exportName: "adapter";
  }

  /** Frozen inputs for one subject's deterministic quality run. */
  export interface IManifest {
    /** Manifest contract version. */
    schemaVersion: 2;
    /** Materializer contract whose raw-byte trees this suite consumes. */
    materializerManifestSchemaVersion: 2;
    /** Stable suite identity. */
    suiteId: string;
    /** All-subject input freeze identity. */
    freezeId: string;
    /** Subject under test. */
    subject: Subject;
    /** Exact algorithm-qualified requirements tree. */
    subjectRequirementsRawTree: IRawTreeDigest;
    /** Exact product-quality denominator pin. */
    acceptanceCatalog: {
      sha256: string;
      count: number;
    };
    /** Production adapter pin, or an explicit launch blocker. */
    adapter: IAdapterPin | null;
    /** Complete pre-registered hidden-case set. */
    cases: IHiddenCase[];
  }

  /** A count pair whose ratio is defined only when total is non-zero. */
  export interface ICount {
    /** Covered members. */
    covered: number;
    /** Measured members. */
    total: number;
    /** Covered divided by total, or null for an empty dimension. */
    ratio: number | null;
  }

  /** Conventional coverage retained without combining dimensions. */
  export interface ICoverage {
    /** Coverage record contract version. */
    schemaVersion: 1;
    /** Immutable run and subject inputs. */
    input: IInputProvenance;
    /** Parsed producer format. */
    format: "istanbul" | "lcov";
    /** Artifact path relative to the workspace when possible. */
    sourceArtifact: string;
    /** Exact input artifact digest. */
    sourceArtifactSha256: string;
    /** Authored workspace identity at ingestion. */
    workspaceSourceTreeSha256: string;
    /** Unique covered source files. */
    files: number;
    /** Line coverage. */
    lines: ICount;
    /** Branch coverage. */
    branches: ICount;
    /** Function coverage. */
    functions: ICount;
    /** Statement coverage, unavailable in LCOV. */
    statements: ICount | null;
  }

  /** One exact placeholder or disabled-test occurrence. */
  export interface IInventoryFinding {
    /** Mechanical finding class. */
    category:
      | "todo"
      | "fixme"
      | "placeholder"
      | "not_implemented"
      | "skipped_test"
      | "focused_test"
      | "disabled_gate";
    /** POSIX authored-file path. */
    path: string;
    /** One-based line. */
    line: number;
    /** One-based column. */
    column: number;
    /** Digest of the matched source line or script. */
    excerptSha256: string;
  }

  /** Static inventory over authored source, test, and package scripts. */
  export interface IInventory {
    /** Inventory contract version. */
    schemaVersion: 1;
    /** Immutable run and subject inputs. */
    input: IInputProvenance;
    /** Authored workspace identity. */
    workspaceSourceTreeSha256: string;
    /** Authored files inspected. */
    files: number;
    /** Exact authored byte count. */
    authoredBytes: number;
    /** Source-like files inspected. */
    sourceFiles: number;
    /** Test files inspected. */
    testFiles: number;
    /** Sorted mechanical findings. */
    findings: IInventoryFinding[];
  }

  /** One syntax-aware mutation frozen before tests execute. */
  export interface IMutation {
    /** Content-derived mutation identity. */
    id: string;
    /** POSIX source path. */
    path: string;
    /** Supported syntax transformation. */
    kind: "boolean_literal" | "binary_operator";
    /** UTF-16 source start offset. */
    start: number;
    /** UTF-16 source end offset. */
    end: number;
    /** Exact original token text. */
    before: string;
    /** Exact replacement token text. */
    after: string;
    /** Exact unmutated source digest. */
    sourceSha256: string;
  }

  /** A deterministic sampled mutation plan. */
  export interface IMutationPlan {
    /** Mutation plan contract version. */
    schemaVersion: 1;
    /** Immutable run and subject inputs. */
    input: IInputProvenance;
    /** Frozen deterministic selection seed. */
    seed: string;
    /** Authored workspace identity. */
    workspaceSourceTreeSha256: string;
    /** Full supported candidate population. */
    candidateCount: number;
    /** Requested maximum sample size. */
    requestedSampleSize: number;
    /** Selected mutations in deterministic order. */
    mutations: IMutation[];
    /** Digest of every other plan field. */
    planSha256: string;
  }

  /** Observable result of one mutation and exact restoration. */
  export interface IMutationResult {
    /** Planned mutation identity. */
    id: string;
    /** Mutation-test outcome. */
    status: "killed" | "survived" | "timed_out" | "infrastructure_failure";
    /** Child exit status, or null when unavailable. */
    commandStatus: number | null;
    /** Monotonic child wall time. */
    elapsedMs: number;
    /** Exact retained stdout digest. */
    stdoutSha256: string;
    /** Exact retained stderr digest. */
    stderrSha256: string;
    /** Whether original bytes were restored. */
    restored: boolean;
  }

  /** One browser observation returned by the pinned hidden adapter. */
  export interface IBrowserObservation {
    /** Frozen hidden case identity. */
    caseId: string;
    /** Fixed viewport exercised. */
    viewport: Viewport;
    /** Frozen route-state identity. */
    routeState: string;
    /** Loopback URL requested. */
    requestedUrl: string;
    /** Loopback URL after navigation. */
    finalUrl: string;
    /** Semantic case outcome. */
    status: Exclude<Status, "blocked">;
    /** Decimal monotonic start nanoseconds. */
    startedMonotonicNs: string;
    /** Decimal monotonic completion nanoseconds. */
    completedMonotonicNs: string;
    /** Exact viewport screenshot provenance. */
    screenshot: {
      path: string;
      sha256: string;
      width: number;
      height: number;
    };
    /** Exact accessibility-scan provenance. */
    accessibility: {
      artifact: string;
      sha256: string;
      engine: string;
      engineVersion: string;
      rulesetSha256: string;
      violations: number;
    };
    /** Browser-observed requests that reached the leased API origin. */
    integration: {
      /** Exact request-ledger artifact. */
      artifact: string;
      /** Digest of the exact ledger bytes. */
      sha256: string;
      /** Number of public API responses observed during the route case. */
      requests: number;
    };
    /** Narrow-reflow and text-zoom probes retained beside the main capture. */
    probes: {
      /** Stable probe identity. */
      kind: "reflow_320" | "text_zoom_200";
      /** Exact PNG artifact. */
      path: string;
      /** Exact PNG digest. */
      sha256: string;
      /** Captured CSS viewport width. */
      width: number;
      /** Captured CSS viewport height. */
      height: number;
      /** Whether the probe avoided nonessential horizontal overflow. */
      passed: boolean;
    }[];
  }

  /** One non-browser hidden case result. */
  export interface IHiddenObservation {
    /** Frozen hidden case identity. */
    caseId: string;
    /** Semantic case outcome. */
    status: Exclude<Status, "blocked">;
    /** Decimal monotonic start nanoseconds. */
    startedMonotonicNs: string;
    /** Decimal monotonic completion nanoseconds. */
    completedMonotonicNs: string;
    /** POSIX result artifact below the adapter output. */
    artifact: string;
    /** Exact result artifact digest. */
    artifactSha256: string;
  }

  /** One immutable artifact promoted below the harness-owned output root. */
  export interface IArtifactReference {
    /** Confined POSIX path below the output root. */
    path: string;
    /** Exact retained byte length. */
    byteLength: number;
    /** Digest of the exact retained bytes. */
    sha256: string;
  }

  /** One promoted owned-process stream with its public runner role. */
  export interface IProcessLogReference extends IArtifactReference {
    /** Stable attempt, process role, and stream basename. */
    role: string;
  }

  /** Public, independently re-readable runtime evidence. */
  export interface IRuntimeEvidence {
    /** Runtime lease whose artifacts were promoted. */
    instanceId: string;
    /** Opaque lease identity shared by every promoted member. */
    leaseId: string;
    /** Outer benchmark run identity. */
    runId: string;
    /** Subject bound by the runtime bundle. */
    subject: Subject;
    /** Comparison arm bound by the runtime bundle. */
    arm: "evidence" | "plain";
    /** Measured snapshot milestone. */
    milestone: "t_done" | "t_dry";
    /** Exact outer run-manifest bytes. */
    runManifestSha256: string;
    /** Exact generated source snapshot. */
    workspaceSourceTreeSha256: string;
    /** Evidence inventory that binds every promoted member. */
    inventory: IArtifactReference;
    /** Fresh database-copy provenance. */
    databaseProvenance: IArtifactReference;
    /** Redacted process, environment, and toolchain provenance. */
    processProvenance: IArtifactReference;
    /** Completed cleanup and database-restoration seal. */
    cleanupSeal: IArtifactReference;
    /** Runner-side requests that reached the generated API. */
    serverRequestLedger: IArtifactReference;
    /** Exact stdout and stderr logs for every owned process attempt. */
    logs: IProcessLogReference[];
  }

  /** Complete response produced by a harness-owned adapter. */
  export interface IAdapterResult {
    /** Adapter result contract version. */
    schemaVersion: 1;
    /** Immutable run and subject inputs. */
    input: IInputProvenance;
    /** Frozen suite identity. */
    suiteId: string;
    /** Subject under test. */
    subject: Subject;
    /** Authored workspace identity observed by the harness. */
    workspaceSourceTreeSha256: string;
    /** Runner-owned fresh runtime and cleanup provenance. */
    runtime: {
      /** Unique runtime lease identity. */
      instanceId: string;
      /** Opaque lease identity shared by every runtime artifact. */
      leaseId: string;
      /** Exact fresh database-clone identity. */
      databaseCloneSha256: string;
      /** Exact API/frontend process and command provenance. */
      processProvenanceSha256: string;
      /** Exact cleanup completion seal. */
      cleanupSealSha256: string;
      /** Exact runner-side HTTP request ledger. */
      serverRequestLedgerSha256: string;
      /** Runner-promoted evidence, null until the production facade seals it. */
      evidence: IRuntimeEvidence | null;
    } | null;
    /** Exact HTTP case results. */
    hidden: IHiddenObservation[];
    /** Exact browser case and viewport results. */
    browser: IBrowserObservation[];
  }

  /** Input exposed to the adapter, never to the generation agent. */
  export interface IAdapterInput {
    /** Frozen hidden suite. */
    manifest: IManifest;
    /** Immutable run and subject inputs. */
    input: IInputProvenance;
    /** Absolute generated-workspace root. */
    workspace: string;
    /** Absolute harness-owned output root. */
    output: string;
    /** Authored workspace identity before adapter execution. */
    workspaceSourceTreeSha256: string;
    /** Runner-owned fatal UTF-8 and duplicate-member JSON parser. */
    parseJson(bytes: Uint8Array, label: string): unknown;
    /** Optional runner lease; mandatory for the production public adapter. */
    runtime?: IRuntimeLease;
  }

  /** Runner-owned fresh API, frontend, and database runtime lease. */
  export interface IRuntimeLease {
    /** Unique per-milestone attempt identity. */
    instanceId: string;
    /** Opaque lease identity shared by every runtime artifact. */
    leaseId: string;
    /** Outer run identity bound by the lease. */
    runId: string;
    /** Subject bound by the lease. */
    subject: Subject;
    /** Benchmark comparison arm bound by the lease. */
    arm: "evidence" | "plain";
    /** Milestone bound by the lease. */
    milestone: "t_done" | "t_dry";
    /** Exact API origin started by the runner. */
    apiOrigin: string;
    /** Exact frontend origin started by the runner. */
    browserOrigin: string;
    /** Per-lease nonce injected by the runner-owned API proxy. */
    requestNonce: string;
    /** Exact fresh database-clone identity. */
    databaseCloneSha256: string;
    /** Exact API/frontend command, source, PID, and environment provenance. */
    processProvenanceSha256: string;
    /** Exact canonical process-provenance artifact bytes. */
    processProvenanceBytes: Uint8Array;
    /** Local-only exact absolute-vector evidence, excluded from public grading. */
    privateControlEvidence: {
      /** Absolute retained harness-private path. */
      path: string;
      /** Absolute recovery-registry path retained by the run owner. */
      registryPath: string;
      /** Exact retained byte length. */
      byteLength: number;
      /** Exact retained byte digest. */
      sha256: string;
    };
    /** Fails unless the clone and processes are fresh and runner-owned. */
    assertFresh(): Promise<void>;
    /** Stops processes, removes the clone, and returns its cleanup seal. */
    cleanup(): Promise<{
      /** Exact canonical cleanup artifact bytes. */
      cleanupSealBytes: Uint8Array;
      /** Digest of cleanupSealBytes. */
      cleanupSealSha256: string;
      /** Exact canonical runner-side request-ledger bytes. */
      serverRequestLedgerBytes: Uint8Array;
      /** Digest of serverRequestLedgerBytes. */
      serverRequestLedgerSha256: string;
    }>;
    /**
     * Atomically promotes public runtime bytes into the harness output CAS.
     *
     * The private control artifact retains host paths outside this result.
     */
    promoteEvidence(output: string): Promise<IRuntimeEvidence>;
  }

  /** Runtime shape of the named export in a pinned adapter module. */
  export interface IAdapter {
    /** Adapter contract version. */
    schemaVersion: 1;
    /** Executes the complete frozen hidden suite. */
    execute(input: IAdapterInput): Promise<IAdapterResult>;
  }

  /** Fail-closed hidden quality outcome. */
  export interface IHiddenOutcome {
    /** Outcome contract version. */
    schemaVersion: 1;
    /** Immutable run and subject inputs. */
    input: IInputProvenance;
    /** Aggregate gate state. */
    status: Status;
    /** Failure or blocker explanation. */
    reason: string | null;
    /** Exact hidden manifest digest. */
    manifestSha256: string;
    /** Exact adapter source digest when pinned. */
    adapterSha256: string | null;
    /** Validated adapter result, absent on failure or blockage. */
    result: IAdapterResult | null;
    /** Runtime evidence retained even when an adapter reports failure. */
    runtimeEvidence: IRuntimeEvidence | null;
  }

  /** Exact producer record embedded in protocol quality inputs. */
  export interface IProducerReference {
    /** Stable producer identity. */
    producer: string;
    /** Immutable producer version. */
    version: string;
    /** Exact producer configuration digest. */
    configSha256: string;
    /** Digest of the exact canonical producer-result bytes. */
    resultSha256: string;
  }

  /** Exact browser capture record embedded in protocol quality inputs. */
  export interface IVisualReference {
    /** Stable visual producer identity. */
    producer: string;
    /** Immutable visual producer version. */
    version: string;
    /** Exact visual producer configuration digest. */
    configSha256: string;
    /** Exact public route inventory digest. */
    routeInventorySha256: string;
    /** Exact browser state-seed digest. */
    stateSeedSha256: string;
    /** Frozen visual sampling seed. */
    sampleSeed: string;
    /** Protocol numeric width binding for mobile, tablet, and desktop. */
    viewports: [390, 834, 1440];
    /** Exact browser engine and revision identity. */
    browser: string;
    /** Digest of the exact canonical visual artifact ledger bytes. */
    artifactsSha256: string;
  }

  /** Protocol v2 pre-seal aggregate over deterministic quality producers. */
  export interface IQualityInputs {
    /** Quality-input aggregate contract version. */
    schemaVersion: 2;
    /** Outer benchmark run identity. */
    runId: string;
    /** Exact outer run-manifest digest. */
    runManifestSha256: string;
    /** Captured generation milestone. */
    milestone: "t_done" | "t_dry";
    /** Exact source snapshot measured at the milestone. */
    snapshotRawTree: IRawTreeDigest;
    /** Hidden acceptance producer result. */
    hiddenAcceptance: IProducerReference;
    /** Conventional coverage producer result. */
    coverage: IProducerReference;
    /** Sampled mutation producer result. */
    sampledMutation: IProducerReference;
    /** Browser visual and accessibility producer result. */
    visualCapture: IVisualReference;
  }
}
