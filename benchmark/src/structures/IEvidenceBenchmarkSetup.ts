import type { IEvidenceBenchmarkMaterialization } from "./IEvidenceBenchmarkMaterialization.ts";

/** Untimed dependency setup record captured before a coding agent can start. */
export interface IEvidenceBenchmarkSetup {
  /** UTC timestamp after the frozen install and version checks completed. */
  completedAt: string;

  /** Milliseconds spent resolving and writing the initial frozen lockfile. */
  lockElapsedMs: number;

  /** Milliseconds spent installing exactly the frozen lockfile. */
  installElapsedMs: number;

  /** SHA-256 identity of the lockfile before any measured agent can edit it. */
  lockSha256: string;

  /** Exact pnpm runtime selected by the generated packageManager declaration. */
  pnpmVersion: string;

  /** Exact ttsc package installed at the generated workspace root. */
  ttscVersion: "0.23.0";

  /** Exact lint host package installed at the generated workspace root. */
  lintVersion: "0.23.0";

  /** Exact TypeScript-Go package installed for the frozen benchmark protocol. */
  typescriptVersion: "7.0.2";
}

/** Setup request paired with one completed materialization. */
export namespace IEvidenceBenchmarkSetup {
  /** Inputs required to install one cell without warming another cell's caches. */
  export interface IRequest {
    /** Materialized cell whose workspace and local cache environment are ready. */
    materialization: IEvidenceBenchmarkMaterialization;

    /** Mechanism arm used to assert package presence or deliberate absence. */
    arm: IEvidenceBenchmarkMaterialization.Arm;
  }
}
