import type { IEvidenceBenchmarkClaudeTokenUsage } from "./IEvidenceBenchmarkClaudeTokenUsage.ts";

/**
 * Retained Claude Code result for one prescribed benchmark objective.
 *
 * The record binds exact instruction bytes to one native process and its
 * successful terminal result, measurements, and safe resume boundary.
 */
export interface IEvidenceBenchmarkClaudeInstructionRecord {
  /** Canonical zero-based position in the nine-objective sequence. */
  index: number;

  /** Stable objective name used in reports. */
  name: string;

  /** Instruction path relative to the instruction root. */
  relativePath: string;

  /** Exact selected instruction text. */
  prescribedText: string;

  /** Exact shared continuation text. */
  continuationText: string;

  /** Exact noninteractive prompt sent to Claude Code. */
  objectiveText: string;

  /** Whether the objective entered the native process. */
  inputDispatched: boolean;

  /** Whether Claude emitted one successful terminal result. */
  completed: boolean;

  /** Native process records associated with this objective. */
  processIndexes: number[];

  /** Exact terminal result object retained from Claude Code. */
  terminalResult: Record<string, unknown> | null;

  /** Token categories attributed to this objective. */
  tokenUsage: IEvidenceBenchmarkClaudeTokenUsage;

  /** Client-estimated native cost reported by Claude Code. */
  costUsd: number;

  /** Native process duration for this objective. */
  elapsedMs: number;
}
