/** One immutable local package archive prepared before cell materialization. */
export interface IEvidenceBenchmarkPackageArtifact {
  /** Absolute path of the content-addressed tgz retained by the run. */
  archive: string;

  /** Exact npm package name read back from the packed manifest. */
  name: string;

  /** Package version read back from the packed manifest. */
  version: string;

  /** Archive byte length, measured after the pack process closes the file. */
  bytes: number;

  /** Hexadecimal SHA-256 identity of the exact archive bytes. */
  sha256: string;

  /** Npm-compatible SHA-512 subresource-integrity identity of the archive. */
  sri: string;

  /** SHA-256 identity of normalized archive paths and file bytes. */
  payloadSha256: string;

  /** Clean source commit whose package inputs produced this archive. */
  sourceCommit: string;

  /** SHA-256 identity of the source repository's frozen pnpm lockfile. */
  sourceLockSha256: string;

  /** UTC timestamp recorded after the archive passed its consumer smoke. */
  preparedAt: string;

  /** Wall-clock milliseconds spent in the single pnpm pack process. */
  packElapsedMs: number;

  /** Wall-clock milliseconds spent installing the isolated smoke consumer. */
  smokeInstallElapsedMs: number;

  /** Wall-clock milliseconds spent on the failing and passing native checks. */
  smokeCheckElapsedMs: number;

  /** Exact package-manager version selected from the smoke workspace. */
  pnpmVersion: string;

  /** Exact Node.js runtime version that orchestrated package preparation. */
  nodeVersion: string;

  /** Host operating-system identifier for this source-built contributor. */
  platform: NodeJS.Platform;

  /** Host CPU architecture identifier for this source-built contributor. */
  architecture: NodeJS.Architecture;
}

/** Package-preparation inputs and guards paired with the artifact contract. */
export namespace IEvidenceBenchmarkPackageArtifact {
  /** Inputs that identify one clean source snapshot and one artifact target. */
  export interface IRequest {
    /** Absolute root of the evidence repository to build and pack. */
    repository: string;

    /** Validated source commit approved for benchmark measurement. */
    expectedCommit: string;

    /** New run-owned directory that will atomically receive the artifact. */
    output: string;
  }
}
