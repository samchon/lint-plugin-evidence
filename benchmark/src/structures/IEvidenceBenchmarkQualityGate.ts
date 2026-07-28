/** Contracts shared by deterministic benchmark quality producers. */
export namespace IEvidenceBenchmarkQualityGate {
  /** Subjects whose frozen corpora can be graded. */
  export type Subject = "todo" | "reddit" | "shopping" | "erp";

  /** Stable status used by every harness-owned check. */
  export type Status = "passed" | "failed" | "blocked";

  /** Fixed browser viewports, independent of the generated application. */
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
    /** Exact immutable outer run-manifest bytes. */
    runManifestSha256: string;
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
  }
}
