import type { IEvidenceBenchmarkCheckpoint } from "./IEvidenceBenchmarkCheckpoint.ts";
import type { IEvidenceBenchmarkGoalRecord } from "./IEvidenceBenchmarkGoalRecord.ts";
import type { IEvidenceBenchmarkInterruption } from "./IEvidenceBenchmarkInterruption.ts";
import type { IEvidenceBenchmarkProcessRecord } from "./IEvidenceBenchmarkProcessRecord.ts";
import type { IEvidenceBenchmarkSupervisionVerdict } from "./IEvidenceBenchmarkSupervisionVerdict.ts";
import type { IEvidenceBenchmarkTokenUsage } from "./IEvidenceBenchmarkTokenUsage.ts";
import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm.ts";
import type { EvidenceBenchmarkSupervisionGoal } from "../typings/EvidenceBenchmarkSupervisionGoal.ts";

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
  status:
    | "ready"
    | "running"
    | "checkpointed"
    | "awaiting-supervision"
    | "rejected"
    | "interrupted"
    | "completed";

  /** Latest cumulative thread token counters. */
  threadTokenUsage: IEvidenceBenchmarkTokenUsage;

  /** Ordered retained Goal records. */
  goals: IEvidenceBenchmarkGoalRecord[];

  /** Durable recovery points created at prescribed Goal boundaries. */
  checkpoints?: IEvidenceBenchmarkCheckpoint[];

  /** Clean external-supervision boundaries retained outside agent self-report. */
  supervisionPauses?: {
    afterGoal: EvidenceBenchmarkSupervisionGoal;
    pausedAt: string;
    verdict?: IEvidenceBenchmarkSupervisionVerdict;
    resumedAt?: string;
  }[];

  /** Process time inherited by a checkpoint-derived run. */
  inheritedProcessElapsedMs?: number;

  /** Every native process used by launch or resume. */
  processes: IEvidenceBenchmarkProcessRecord[];

  /** Failure detail when exact continuation stopped. */
  interruption?: IEvidenceBenchmarkInterruption;
}
