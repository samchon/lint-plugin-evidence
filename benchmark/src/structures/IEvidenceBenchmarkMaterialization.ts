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

  /** Environment inherited by setup and the measured cell for local caches. */
  environment: NodeJS.ProcessEnv;
}

/** Materialization inputs, arm identities, and permanent manifest records. */
export namespace IEvidenceBenchmarkMaterialization {
  /** Benchmark mechanisms whose necessary setup differs by construction. */
  export type Arm = "evidence" | "plain";

  /** Supported requirement corpora in ascending benchmark cost order. */
  export type Project = "todo" | "reddit" | "shopping" | "erp";

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
    schemaVersion: 3;

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

    /** Validated human and machine-readable requirement inventory summary. */
    corpus: {
      /** Number of Markdown documents copied from the subject directory. */
      documents: number;

      /** Number of level-two sections outside fenced code blocks. */
      h2: number;

      /** Number of REQ-owned level-three sections. */
      h3: number;

      /** Number of validated atomic acceptance clauses. */
      atomicAcceptanceClauses: number;

      /** Separately scored H2 context criteria, never added to atomic clauses. */
      contextCriteria: number;

      /** Machine-readable corpus contract selected by filename. */
      inventory: "acceptance-criteria.jsonl" | "metadata.json";
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

    /** Cell-local cache paths kept outside the generated project tree. */
    caches: {
      /** Absolute pnpm content-addressed store used only by this cell. */
      pnpm: string;

      /** Absolute ttsc source-plugin cache used only by this cell. */
      ttsc: string;

      /** Absolute Go object cache used only by this cell. */
      go: string;

      /** Absolute Playwright browser cache used only by this cell. */
      playwright: string;

      /** Directory containing the exact-version pnpm launcher for this cell. */
      toolchain: string;
    };
  }
}
