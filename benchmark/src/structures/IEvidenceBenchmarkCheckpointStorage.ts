/** Filesystem facts returned after one checkpoint snapshot is durable. */
export interface IEvidenceBenchmarkCheckpointStorage {
  createdAt: string;
  workspaceRelativePath: string;
  workspaceSha256: string;
  workspaceMaterialSha256: string;
  workspaceFileCount: number;
  workspaceGitHead: string;
  workspaceGitStatus: string;
  inheritedWallElapsedMs: number;
}
