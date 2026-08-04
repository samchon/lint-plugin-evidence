import type { IEvidenceBenchmarkCheckpoint } from "./IEvidenceBenchmarkCheckpoint.ts";
import type { IEvidenceBenchmarkGoalRecord } from "./IEvidenceBenchmarkGoalRecord.ts";
import type { IEvidenceBenchmarkInstructionPlanEntry } from "./IEvidenceBenchmarkInstructionPlanEntry.ts";
import type { IEvidenceBenchmarkInterruption } from "./IEvidenceBenchmarkInterruption.ts";
import type { IEvidenceBenchmarkProcessRecord } from "./IEvidenceBenchmarkProcessRecord.ts";
import type { IEvidenceBenchmarkReviewLedger } from "./IEvidenceBenchmarkReviewLedger.ts";
import type { IEvidenceBenchmarkSupervisionVerdict } from "./IEvidenceBenchmarkSupervisionVerdict.ts";
import type { IEvidenceBenchmarkTokenUsage } from "./IEvidenceBenchmarkTokenUsage.ts";
import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm.ts";
import type { EvidenceBenchmarkReviewScope } from "../typings/EvidenceBenchmarkReviewScope.ts";

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
    | "awaiting-review-verdict"
    | "quality-failed"
    | "interrupted"
    | "completed";

  /** Latest cumulative thread token counters. */
  threadTokenUsage: IEvidenceBenchmarkTokenUsage;

  /** First Goal owned by the current native thread after a detached checkpoint. */
  nativeThreadStartInstructionIndex?: number;

  /** Ordered retained Goal records. */
  goals: IEvidenceBenchmarkGoalRecord[];

  /** Frozen base objectives plus append-only-positioned review supplements. */
  instructionPlan?: IEvidenceBenchmarkInstructionPlanEntry[];

  /** Durable recovery points created at prescribed Goal boundaries. */
  checkpoints?: IEvidenceBenchmarkCheckpoint[];

  /** External Plain review decisions retained outside agent self-report. */
  supervisionPauses?: {
    scope: EvidenceBenchmarkReviewScope;
    attempt: number;
    afterGoal: string;
    goalIndex: number;
    pausedAt: string;
    verdict?: IEvidenceBenchmarkSupervisionVerdict;
    resumedAt?: string;
  }[];

  /**
   * Operator warnings attached to a stopped cell's objective.
   *
   * A warning names a frozen boundary the cell crossed, or supplies an
   * authorization it correctly refused to fabricate. It lives here rather than
   * on the instruction plan because the plan's base sequence must stay
   * byte-identical to the frozen one, which is what proves nobody rewrote the
   * objectives themselves.
   */
  operatorWarnings?: {
    instructionIndex: number;
    instructionName: string;
    feedback: string;
    warnedAt: string;
    verdictRelativePath: string;
  }[];

  /** Process time inherited by a checkpoint-derived run. */
  inheritedProcessElapsedMs?: number;

  /** Every native process used by launch or resume. */
  processes: IEvidenceBenchmarkProcessRecord[];

  /** Runner-owned manifests and reads for externally enforced review Goals. */
  reviewLedgers?: IEvidenceBenchmarkReviewLedger[];

  /** Failure detail when exact continuation stopped. */
  interruption?: IEvidenceBenchmarkInterruption;
}
