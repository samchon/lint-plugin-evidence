import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm";
import type { EvidenceBenchmarkEffort } from "../typings/EvidenceBenchmarkEffort";
import type { IEvidenceBenchmarkTokenUsage } from "./IEvidenceBenchmarkTokenUsage";
import type { IEvidenceBenchmarkApiCost } from "./IEvidenceBenchmarkApiCost";
import type { IEvidenceBenchmarkSuspension } from "./IEvidenceBenchmarkSuspension";

/** Publishable aggregate of the latest launched benchmark cells. */
export interface IEvidenceBenchmarkReport {
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
    /**
     * A stage dispatched after the runner last wrote its record, still working.
     *
     * The runner cannot observe a stage it did not broker, so it never calls
     * one finished. This replaces whatever the runner last said, including
     * `completed`, because a pass dispatched after a completion is the later
     * fact about where the cell is.
     */
    | "working"
    /** The same, and the session carrying it went quiet without closing. */
    | "stopped"
    | "completed";
  stage: string | null;
  launchedAt: string;
  /** Cell total, including what judging its Reviews cost. */
  tokens: number;
  /** Cell total, including what judging its Reviews cost. */
  tokenUsage: IEvidenceBenchmarkTokenUsage;
  /** The judging share of `tokens`, `tokenUsage`, and `workElapsedMs`. */
  inspection: IEvidenceBenchmarkReportInspection;
  /**
   * Reconciled per-request price of the measured thread alone.
   *
   * Inspection is deliberately outside this number. The price is emitted only
   * after every retained request reconciles with the thread's own counters, and
   * an inspecting thread reports one aggregate for its whole turn, which cannot
   * be split back into the requests that rate table prices.
   */
  apiCost: IEvidenceBenchmarkApiCost | null;
  /** Verified non-working time excluded from work measurements. */
  suspendedMs: number;
  /** Audit intervals behind `suspendedMs`. */
  suspensions: IEvidenceBenchmarkReportSuspension[];
  /** Cell total, including what judging its Reviews cost. */
  workElapsedMs: number;
  worktree: IEvidenceBenchmarkReportWorktree;
  /** Immutable Plain review verdict history, empty for Evidence. */
  reviewVerdicts: IEvidenceBenchmarkReportReviewVerdict[];
  stages: IEvidenceBenchmarkReportStage[];
}

/**
 * What judging one cell's Reviews cost, inside its totals and separable.
 *
 * Inspection is part of what an arm costs, so it is added rather than reported
 * beside the cell. It keeps its own record because a reader comparing two arms
 * needs to see how much of a total was the work and how much was the judging.
 */
export interface IEvidenceBenchmarkReportInspection {
  /** Inspection attempts made, decided or not, including retries. */
  attempts: number;

  /** Attempts that produced no decision. Spent tokens still count. */
  failures: number;

  tokenUsage: IEvidenceBenchmarkTokenUsage;
  elapsedMs: number;
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
