import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm.ts";
import type { EvidenceBenchmarkEffort } from "../typings/EvidenceBenchmarkEffort.ts";
import type { IEvidenceBenchmarkTokenUsage } from "./IEvidenceBenchmarkTokenUsage.ts";
import type { IEvidenceBenchmarkApiCost } from "./IEvidenceBenchmarkApiCost.ts";
import type { IEvidenceBenchmarkSuspension } from "./IEvidenceBenchmarkSuspension.ts";

/** Publishable aggregate of the latest launched benchmark cells. */
export interface IEvidenceBenchmarkReport {
  schemaVersion: 3;
  generatedAt: string;
  cells: IEvidenceBenchmarkReportCell[];
}

/** Latest retained measurement for one model, subject, and arm. */
export interface IEvidenceBenchmarkReportCell {
  engine: "codex";
  subject: string;
  arm: EvidenceBenchmarkArm;
  runId: string;
  benchmarkRevision: string;
  model: string;
  effort: EvidenceBenchmarkEffort;
  /** Explicit external review-ledger treatment, when selected. */
  reviewLedger?: "backend";
  status:
    | "ready"
    | "running"
    | "checkpointed"
    | "awaiting-review-verdict"
    | "quality-failed"
    | "awaiting-supervision"
    | "rejected"
    | "interrupted"
    | "completed";
  stage: string | null;
  launchedAt: string;
  tokens: number;
  tokenUsage: IEvidenceBenchmarkTokenUsage;
  apiCost: IEvidenceBenchmarkApiCost | null;
  /** Verified non-working time excluded from work measurements. */
  suspendedMs: number;
  /** Audit intervals behind `suspendedMs`. */
  suspensions: IEvidenceBenchmarkReportSuspension[];
  workElapsedMs: number;
  worktree: IEvidenceBenchmarkReportWorktree;
  /** Immutable Plain review verdict history, empty for Evidence. */
  reviewVerdicts: IEvidenceBenchmarkReportReviewVerdict[];
  stages: IEvidenceBenchmarkReportStage[];
}

/** One externally retained Plain review decision and recovery transition. */
export interface IEvidenceBenchmarkReportReviewVerdict {
  scope: "backend" | "frontend" | "overall";
  attempt: number;
  decision: "pass" | "fail";
  action: "final" | "retry" | "quality-failed";
  goalIndex: number;
  terminalTurnId: string;
  rationale: string;
  feedback?: string;
  pausedAt: string;
  decidedAt: string;
  resumedAt?: string;
  verdictRelativePath: string;
  verdictSha256: string;
  workspaceMaterialSha256: string;
}

/** Publishable suspension interval with its exact excluded duration. */
export interface IEvidenceBenchmarkReportSuspension extends IEvidenceBenchmarkSuspension {
  elapsedMs: number;
}

/** Read-only Git delta from the prepared workspace baseline. */
export interface IEvidenceBenchmarkReportWorktree {
  files: number;
  additions: number;
  deletions: number;
}

/** Retained token and work-time share attributed to one instruction. */
export interface IEvidenceBenchmarkReportStage {
  name: string;
  tokens: number;
  elapsedMs: number;
  tokenPercent: number;
  timePercent: number;
}
