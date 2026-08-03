import type { EvidenceBenchmarkReviewScope } from "../typings/EvidenceBenchmarkReviewScope.ts";

/** One immutable objective slot in a run's retained adaptive plan. */
export interface IEvidenceBenchmarkInstructionPlanEntry {
  /** Stable report name. Supplementation names end in `-remind-<attempt>`. */
  name: string;

  /** Instruction path relative to the frozen instruction root. */
  relativePath: string;

  /** Whether this slot belonged to the frozen base plan or a failed verdict. */
  kind: "base" | "review-supplement";

  /** Review scope supplemented by this dynamic slot. */
  reviewScope?: EvidenceBenchmarkReviewScope;

  /** One-based supplementation number, bounded to one through four. */
  reviewAttempt?: number;

  /** Exact concrete correction text appended to the minimal reminder base. */
  reviewFeedback?: string;
}
