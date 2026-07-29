import type { IEvidenceBenchmarkMaterialization } from "./IEvidenceBenchmarkMaterialization.ts";

/** Dependency setup record captured before a coding agent can start. */
export interface IEvidenceBenchmarkSetup {
  /** Total monotonic wall-clock milliseconds spent preparing dependencies. */
  elapsedMs: number;

  /** Milliseconds spent resolving and writing the initial frozen lockfile. */
  lockElapsedMs: number;

  /** Milliseconds spent installing exactly the frozen lockfile. */
  installElapsedMs: number;

  /** SHA-256 identity of the lockfile before any measured agent can edit it. */
  lockSha256: string;

  /** Exact pnpm runtime selected by the generated packageManager declaration. */
  pnpmVersion: string;

  /** Exact ttsc package installed at the generated workspace root. */
  ttscVersion: "0.22.0";

  /** Exact lint host package installed at the generated workspace root. */
  lintVersion: "0.22.0";

  /** Exact TypeScript-Go package installed in the benchmark workspace. */
  typescriptVersion: "7.0.2";

  /** Exact Node.js release that installed and executes the benchmark cell. */
  nodeVersion: string;

  /** Operating-system platform that owns the installed native payloads. */
  nodePlatform: NodeJS.Platform;

  /** Processor architecture that owns the installed native payloads. */
  nodeArchitecture: string;

  /** SHA-256 identity of the Node.js executable used by the harness. */
  nodeExecutableSha256: string;

  /** SHA-256 identity of the Corepack program that dispatches pinned pnpm. */
  corepackExecutableSha256: string;

  /** Aggregate identity of the cell-owned Corepack package-manager payload. */
  corepackHomeSha256: string;

  /** Initial direct dependency names whose complete runtime closures are sealed. */
  installedSeedPackages: readonly string[];

  /** Installed compiler, lint host, and measured-product payload identities. */
  installedPackagesSha256: Readonly<Record<string, string>>;

  /** Initial successful dependency-resolution edges, fixed by package identity. */
  installedPackageResolutions: readonly IEvidenceBenchmarkSetup.IResolution[];

  /** Exact launcher identities for commands used by frozen gate scripts. */
  installedLaunchersSha256: Readonly<Record<string, string>>;
}

/** Setup request paired with one completed materialization. */
export namespace IEvidenceBenchmarkSetup {
  /** One successful package resolution observed in the initial install graph. */
  export interface IResolution {
    /** Workspace package label or installed parent-package identity. */
    from: string;

    /** Dependency name resolved from that exact parent. */
    dependency: string;

    /** Installed package identity reached by the initial resolution. */
    to: string;
  }

  /** Inputs required to install one cell without warming another cell's caches. */
  export interface IRequest {
    /** Materialized cell whose workspace and local cache environment are ready. */
    materialization: IEvidenceBenchmarkMaterialization;

    /** Mechanism arm used to assert package presence or deliberate absence. */
    arm: IEvidenceBenchmarkMaterialization.Arm;
  }
}
