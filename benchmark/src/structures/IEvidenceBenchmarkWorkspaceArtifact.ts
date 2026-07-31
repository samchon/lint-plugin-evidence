/**
 * Immutable local package archive installed only into an Evidence arm.
 *
 * The workspace materializer copies this archive under `.benchmark-deps` and
 * records its package name as a local dependency before installation.
 */
export interface IEvidenceBenchmarkWorkspaceArtifact {
  /** Dependency name written into the prepared workspace manifest. */
  name: string;

  /** Absolute or repository-resolved archive source path. */
  archive: string;
}
