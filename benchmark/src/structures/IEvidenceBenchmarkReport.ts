import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm.ts";
import type { EvidenceBenchmarkEffort } from "../typings/EvidenceBenchmarkEffort.ts";

/** Publishable aggregate of the latest launched benchmark cells. */
export interface IEvidenceBenchmarkReport {
  schemaVersion: 1;
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
  status: "ready" | "running" | "interrupted" | "completed";
  stage: string | null;
  launchedAt: string;
  tokens: number;
  workElapsedMs: number;
  wallElapsedMs: number;
  worktree: IEvidenceBenchmarkReportWorktree;
  stages: IEvidenceBenchmarkReportStage[];
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
