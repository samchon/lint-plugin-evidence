import type { IEvidenceBenchmarkPackageArtifact } from "./IEvidenceBenchmarkPackageArtifact.ts";

/** One atomically materialized benchmark cell and its immutable input ledger. */
export interface IEvidenceBenchmarkMaterialization {
  /** Absolute cell root published by one atomic directory rename. */
  root: string;

  /** Absolute generated-project directory used as the coding agent's cwd. */
  workspace: string;

  /** Absolute preserved requirement snapshot used to audit post-run drift. */
  immutableInputs: string;

  /** Absolute JSON manifest containing every pre-run input identity. */
  manifest: string;

  /** SHA-256 identity of the final workspace path and byte relation. */
  workspaceTreeSha256: string;

  /** Frozen lint configuration identities copied into the retained run state. */
  lintBaselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[];

  /** Environment inherited by setup and the measured cell for local caches. */
  environment: NodeJS.ProcessEnv;
}

/** Materialization inputs, arm identities, and permanent manifest records. */
export namespace IEvidenceBenchmarkMaterialization {
  /** Benchmark mechanisms whose necessary setup differs by construction. */
  export type Arm = "evidence" | "plain";

  /** Portable subject slug backed by a benchmark/requirements directory. */
  export type Project = string;

  /** Complete input needed to materialize one cell before any agent starts. */
  export interface IRequest {
    /** Absolute repository root containing benchmark/template and requirements. */
    repository: string;

    /** New run-owned cell root; existing directories are never overwritten. */
    output: string;

    /** Requirement corpus copied into both workspace and immutable inputs. */
    project: Project;

    /** Mechanism overlay composed after the shared base tree. */
    arm: Arm;

    /** Exact package identities accepted by the scaffold renderer. */
    variables: IVariables;

    /** Single packed product identity shared by every cell in the invocation. */
    artifact: IEvidenceBenchmarkPackageArtifact;
  }

  /** One normalized path and byte identity inside an input or output tree. */
  export interface ITreeEntry {
    /** Portable relative path using forward slashes and normalized Unicode. */
    path: string;

    /** File byte length after LF normalization and placeholder rendering. */
    bytes: number;

    /** Hexadecimal SHA-256 identity of this file's exact bytes. */
    sha256: string;
  }

  /** One literal claim definition in its original configured order. */
  export interface ILintClaimBaseline {
    /** Stable claim name used by phase instructions and diagnostics. */
    name: string;

    /** Canonical hash of the complete literal claim object. */
    sha256: string;

    /** JSON-compatible claim population, selectors, and references. */
    definition: Readonly<Record<string, unknown>>;
  }

  /** Semantic Evidence Graph rule inventory for one lint configuration. */
  export interface ILintGraphBaseline {
    /** Required active severity outside an authorized loader-only branch. */
    severity: "error";

    /** Complete claims in their configured array order. */
    claims: readonly ILintClaimBaseline[];
  }

  /** Exact compiler Program route to one lint configuration. */
  export interface ILintProgramBaseline {
    /** Workspace-relative POSIX path to the owning tsconfig. */
    path: string;

    /** Exact tsconfig-relative lint configuration pointer. */
    configFile: string;

    /** SHA-256 identity of the complete tsconfig bytes. */
    sha256: string;
  }

  /** Immutable command surface of one benchmark package manifest. */
  export interface ILintScriptsBaseline {
    /** Workspace-relative POSIX path to the package manifest. */
    path: string;

    /** Exact package identity used by workspace filters and dependency links. */
    name: string;

    /** Hash of the package identity and complete scripts object. */
    sha256: string;

    /** Exact named commands present when the cell was materialized. */
    scripts: Readonly<Record<string, string>>;

    /** Existing dependency specifiers that agents may not replace or remove. */
    dependencies: Readonly<Record<string, string>>;

    /** Hash of package-manager identity, engine, and resolution controls. */
    resolutionSha256: string;
  }

  /** Exact immutable file that controls a measured command or shared policy. */
  export interface IInfrastructureFileBaseline {
    /** Workspace-relative POSIX path to the frozen infrastructure file. */
    path: string;

    /** SHA-256 identity of the complete file bytes. */
    sha256: string;
  }

  /** Exact and semantic identities for one package lint configuration. */
  export interface ILintConfigBaseline {
    /** Workspace-relative POSIX path to the package configuration. */
    path: string;

    /** SHA-256 identity of the exact rendered configuration bytes. */
    sha256: string;

    /** Hash of the normalized graph inventory or the plain-arm null marker. */
    semanticSha256: string;

    /** Evidence graph inventory; null for a Plain arm configuration. */
    graph: ILintGraphBaseline | null;

    /** Compiler Programs sealed to this exact configuration. */
    programs: readonly ILintProgramBaseline[];

    /** Package command surfaces sealed with this policy owner. */
    scripts: readonly ILintScriptsBaseline[];

    /** Shared policies, workspace routing, and fixed command runners. */
    infrastructure: readonly IInfrastructureFileBaseline[];
  }

  /** Exact root and child package identities rendered into every scaffold. */
  export interface IVariables {
    /** Root workspace npm package name. */
    name: string;

    /** Authored DTO and generated SDK npm package name. */
    apiPackageName: string;

    /** NestJS application npm package name. */
    backendPackageName: string;

    /** React application npm package name. */
    frontendPackageName: string;
  }

  /** Permanent pre-run record written beside the workspace and input copy. */
  export interface IManifest {
    /** Manifest schema version; readers reject unsupported future shapes. */
    schemaVersion: 7;

    /** Versioned algorithm shared by every aggregate tree identity. */
    treeAlgorithm: "sha256-posix-path-nul-bytes-v1";

    /** Requirement subject rendered into the workspace. */
    project: Project;

    /** Mechanism arm whose overlay and package policy were applied. */
    arm: Arm;

    /** Monotonic wall-clock milliseconds spent materializing this cell. */
    elapsedMs: number;

    /** Strict variables used to render the template placeholders. */
    variables: Readonly<Record<string, string>>;

    /** SHA-256 identity of normalized shared template source files. */
    baseTreeSha256: string;

    /** SHA-256 identity of normalized mechanism-overlay source files. */
    armTreeSha256: string;

    /** SHA-256 identity of normalized requirement source files. */
    requirementsTreeSha256: string;

    /** SHA-256 identity of the final generated workspace. */
    workspaceTreeSha256: string;

    /** Aggregate identity binding all trees, variables, arm, and product. */
    inputSha256: string;

    /** Final generated workspace path and byte ledger. */
    workspaceFiles: readonly ITreeEntry[];

    /** Preserved requirement path and byte ledger. */
    requirementFiles: readonly ITreeEntry[];

    /** Materialization-time lint populations and exact source identities. */
    lintBaselines: readonly ILintConfigBaseline[];

    /** Validated Markdown requirement structure. */
    corpus: {
      /** Number of Markdown documents copied from the subject directory. */
      documents: number;

      /** Number of level-two sections outside fenced code blocks. */
      h2: number;

      /** Number of REQ-owned level-three sections. */
      h3: number;
    };

    /** Product package identity installed only when arm is evidence. */
    artifact: {
      /** Actual npm package name from the packed manifest. */
      name: string;

      /** Package version, insufficient alone and paired with the archive hash. */
      version: string;

      /** Exact archive byte identity shared by evidence and plain metadata. */
      sha256: string;

      /** Normalized payload identity shared by evidence and plain metadata. */
      payloadSha256: string;

      /** Source commit that produced the package payload. */
      sourceCommit: string;

      /** Workspace-relative archive path, absent by design in the plain arm. */
      relativeArchive?: string;
    };

    /** Cell-owned mutable caches isolated from every other benchmark cell. */
    caches: {
      /** Empty operator-home replacement used by child tools. */
      home: string;

      /** Absolute Corepack home containing this cell's pinned pnpm payload. */
      corepack: string;

      /** Absolute pnpm content-addressed store used only by this cell. */
      pnpm: string;

      /** Absolute ttsc source-plugin cache used only by this cell. */
      ttsc: string;

      /** Absolute Go object cache used only by this cell. */
      go: string;

      /** Absolute Go module cache used only by this cell. */
      goModules: string;

      /** Absolute Go workspace used only by this cell. */
      goPath: string;

      /** Absolute Playwright browser cache used only by this cell. */
      playwright: string;

      /** Absolute operating-system temporary directory used only by this cell. */
      temp: string;

      /** Directory containing the exact-version pnpm launcher for this cell. */
      toolchain: string;
    };
  }
}
