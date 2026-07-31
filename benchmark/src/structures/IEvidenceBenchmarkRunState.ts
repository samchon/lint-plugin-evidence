import type { IEvidenceBenchmarkGoalRecord } from "./IEvidenceBenchmarkGoalRecord.ts";
import type { IEvidenceBenchmarkInterruption } from "./IEvidenceBenchmarkInterruption.ts";
import type { IEvidenceBenchmarkProcessRecord } from "./IEvidenceBenchmarkProcessRecord.ts";
import type { IEvidenceBenchmarkTokenUsage } from "./IEvidenceBenchmarkTokenUsage.ts";
import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm.ts";

/**
 * Complete resumable Codex state for one benchmark cell.
 *
 * `state.json` persists this structure after each meaningful transition so a
 * later process can prove the exact thread and Goal boundary before resuming.
 */
export interface IEvidenceBenchmarkRunState {
  /** Selected experiment arm. */
  arm: EvidenceBenchmarkArm;

  /** Native Codex thread identifier after creation. */
  sessionId?: string;

  /** Exact native CLI version retained at launch. */
  cliVersion?: string;

  /** Next objective position to execute. */
  nextInstructionIndex: number;

  /** Current runner lifecycle state. */
  status: "ready" | "running" | "interrupted" | "completed";

  /** Latest cumulative thread token counters. */
  threadTokenUsage: IEvidenceBenchmarkTokenUsage;

  /** Ordered retained Goal records. */
  goals: IEvidenceBenchmarkGoalRecord[];

  /** Every native process used by launch or resume. */
  processes: IEvidenceBenchmarkProcessRecord[];

  /** Failure detail when exact continuation stopped. */
  interruption?: IEvidenceBenchmarkInterruption;
}
