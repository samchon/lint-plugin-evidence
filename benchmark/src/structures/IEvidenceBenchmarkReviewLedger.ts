/** One immutable file entry in a runner-owned review manifest. */
export interface IEvidenceBenchmarkReviewManifestEntry {
  /** Canonical section owned by the backend propagation procedure. */
  section:
    "requirements" | "schema" | "api" | "backend" | "tests" | "configuration";

  /** Workspace-relative POSIX path. */
  path: string;

  /** Exact byte length at round start. */
  bytes: number;

  /** SHA-256 of the exact bytes at round start. */
  sha256: string;
}

/** One file returned through the runner-owned read tool. */
export interface IEvidenceBenchmarkReviewRead {
  path: string;
  bytes: number;
  sha256: string;
  callId: string;
  turnId: string;
  readAt: string;
}

/** One externally enforced full-review round. */
export interface IEvidenceBenchmarkReviewRound {
  index: number;
  startedAt: string;
  manifestSha256: string;
  manifest: IEvidenceBenchmarkReviewManifestEntry[];
  reads: IEvidenceBenchmarkReviewRead[];
  status: "reading" | "findings" | "clean" | "dry" | "invalid";
  findings?: string[];
  finishedAt?: string;
  invalidatedAt?: string;
  invalidation?: string;
}

/** One runner-owned backend process used during review correction or proof. */
export interface IEvidenceBenchmarkReviewCommand {
  index: number;
  command:
    | "build-prisma"
    | "build-main"
    | "build-sdk"
    | "build-test"
    | "schema"
    | "check-watch"
    | "lint"
    | "format"
    | "test";
  phase: "correction" | "calibration-fail" | "calibration-pass" | "final";
  callId: string;
  turnId: string;
  startedAt: string;
  finishedAt?: string;
  manifestSha256: string;
  processId?: number;
  status: "running" | "succeeded" | "expected-failure" | "failed" | "timed-out";
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  outputBytes?: number;
  outputSha256?: string;
  outputLimited?: boolean;
  cleanupForced?: boolean;
}

/** Exact fail-restore-pass boundary preceding a qualifying dry round. */
export interface IEvidenceBenchmarkReviewCalibration {
  index: number;
  startedAt: string;
  baselineManifestSha256: string;
  status: "sealed" | "failure-proven" | "passed" | "invalid";
  failureCommandIndex?: number;
  passCommandIndex?: number;
  invalidatedAt?: string;
  invalidation?: string;
}

/** Durable review-tool ledger for one native Goal. */
export interface IEvidenceBenchmarkReviewLedger {
  goalIndex: number;
  goalName: "backend-review" | "backend-final";
  rounds: IEvidenceBenchmarkReviewRound[];
  commands?: IEvidenceBenchmarkReviewCommand[];
  calibrations?: IEvidenceBenchmarkReviewCalibration[];
}
