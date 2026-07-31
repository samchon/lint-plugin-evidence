import type { IEvidenceBenchmarkClaudeInstructionRecord } from "./IEvidenceBenchmarkClaudeInstructionRecord.ts";
import type { IEvidenceBenchmarkClaudeTokenUsage } from "./IEvidenceBenchmarkClaudeTokenUsage.ts";
import type { IEvidenceBenchmarkInterruption } from "./IEvidenceBenchmarkInterruption.ts";
import type { IEvidenceBenchmarkProcessRecord } from "./IEvidenceBenchmarkProcessRecord.ts";
import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm.ts";

/**
 * Complete resumable Claude Code state for one benchmark cell.
 *
 * `state.json` persists this structure between noninteractive processes so
 * every later objective resumes the same native session and retained prefix.
 */
export interface IEvidenceBenchmarkClaudeRunState {
  /** Selected experiment arm. */
  arm: EvidenceBenchmarkArm;

  /** Native session identifier reused across all objectives. */
  sessionId: string;

  /** Exact Claude Code CLI version retained at launch. */
  cliVersion?: string;

  /** Model resolved and reported by the native initialization event. */
  nativeModel?: string;

  /** Next objective position to execute. */
  nextInstructionIndex: number;

  /** Current runner lifecycle state. */
  status: "ready" | "running" | "interrupted" | "completed";

  /** Cumulative retained native token counters. */
  tokenUsage: IEvidenceBenchmarkClaudeTokenUsage;

  /** Cumulative client-estimated native cost. */
  costUsd: number;

  /** Ordered objective records. */
  instructions: IEvidenceBenchmarkClaudeInstructionRecord[];

  /** Every native process used by launch or resume. */
  processes: IEvidenceBenchmarkProcessRecord[];

  /** Failure detail when exact continuation stopped. */
  interruption?: IEvidenceBenchmarkInterruption;
}
