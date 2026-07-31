import type { IEvidenceBenchmarkTokenUsage } from "./IEvidenceBenchmarkTokenUsage.ts";

/**
 * Retained Codex state for one prescribed benchmark objective.
 *
 * The record binds exact instruction bytes to the native Goal, terminal turn,
 * idle checkpoint, token delta, and elapsed time needed for exact recovery.
 */
export interface IEvidenceBenchmarkGoalRecord {
  /** Canonical zero-based position in the eight-objective sequence. */
  index: number;

  /** Stable objective name used in reports. */
  name: string;

  /** Instruction path relative to the instruction root. */
  relativePath: string;

  /** Exact selected instruction bytes decoded as UTF-8. */
  prescribedText: string;

  /** Exact selected arm's continuation instruction. */
  continuationText: string;

  /** Exact user objective sent to the native Goal API. */
  objectiveText: string;

  /** Latest native Goal snapshot. */
  goal: Record<string, unknown> | null;

  /** Terminal native turn associated with this Goal. */
  terminalTurnId: string | null;

  /** Whether the terminal turn emitted completion. */
  terminalTurnCompleted: boolean;

  /** Whether the thread returned to idle after the terminal turn. */
  threadIdle: boolean;

  /** Turn whose token notification sealed the measurement. */
  tokenUsageTurnId: string | null;

  /** Thread token counters before this Goal. */
  tokenUsageStart: IEvidenceBenchmarkTokenUsage;

  /** Thread token counters after this Goal. */
  tokenUsageEnd: IEvidenceBenchmarkTokenUsage | null;

  /** Nonnegative token delta attributed to this Goal. */
  tokenUsage: IEvidenceBenchmarkTokenUsage;

  /** Native turn duration retained for this Goal. */
  elapsedMs: number;
}
