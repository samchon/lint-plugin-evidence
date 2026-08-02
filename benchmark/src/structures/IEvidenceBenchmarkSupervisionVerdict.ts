import type { IEvidenceBenchmarkWorkspaceIdentity } from "./IEvidenceBenchmarkWorkspaceIdentity.ts";

/** External decision bound to one completed Goal and workspace state. */
export interface IEvidenceBenchmarkSupervisionVerdict {
  /** Whether the measured run may continue beyond this boundary. */
  decision: "approved" | "rejected";

  /** Time at which the external supervisor recorded the decision. */
  decidedAt: string;

  /** Terminal turn independently inspected by the supervisor. */
  terminalTurnId: string;

  /** Precommitted expectation location relative to the retained run root. */
  expectationsRelativePath: string;

  /** Digest proving the expectation bytes used before trajectory inspection. */
  expectationsSha256: string;

  /** Report location relative to the retained run root. */
  reportRelativePath: string;

  /** Digest of the immutable copied report. */
  reportSha256: string;

  /** Exact product state inspected by the supervisor. */
  workspace: IEvidenceBenchmarkWorkspaceIdentity;
}
