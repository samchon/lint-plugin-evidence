import type { IEvidenceBenchmarkClaudeRunState } from "./IEvidenceBenchmarkClaudeRunState.ts";
import type { IEvidenceBenchmarkOutput } from "./IEvidenceBenchmarkOutput.ts";
import type { EvidenceBenchmarkClaudeEffort } from "../typings/EvidenceBenchmarkClaudeEffort.ts";

/**
 * Inputs and append-only observers for a Claude Code benchmark execution.
 *
 * The adapter owns native process sequencing, while the caller durably stores
 * raw stream chunks and immutable state snapshots.
 */
export interface IEvidenceBenchmarkClaudeRunProps {
  /** Fresh or retained state to execute. */
  state: IEvidenceBenchmarkClaudeRunState;

  /** Prepared measured workspace. */
  cwd: string;

  /** Frozen directory containing prescribed instructions. */
  instructionsRoot: string;

  /** Explicit native model identifier. */
  model: string;

  /** Explicit native effort level. */
  effort: EvidenceBenchmarkClaudeEffort;

  /** Repository revision of this runner invocation. */
  runnerRevision?: string;

  /** Sanitized child-process environment. */
  environment?: NodeJS.ProcessEnv;

  /** Optional executable override used by deterministic fixtures. */
  command?: string;

  /** Arguments placed before the native Claude arguments. */
  commandPrefixArguments?: readonly string[];

  /** Optional retained CLI version supplied by a fixture. */
  cliVersion?: string;

  /** Append-only observer for native stream chunks. */
  onOutput: (
    processIndex: number,
    output: IEvidenceBenchmarkOutput,
  ) => void | Promise<void>;

  /** Durable observer for each retained state transition. */
  onState?: (state: IEvidenceBenchmarkClaudeRunState) => void | Promise<void>;
}
