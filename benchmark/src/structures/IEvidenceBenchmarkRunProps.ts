import type { IEvidenceBenchmarkOutput } from "./IEvidenceBenchmarkOutput.ts";
import type { IEvidenceBenchmarkRunState } from "./IEvidenceBenchmarkRunState.ts";
import type { EvidenceBenchmarkEffort } from "../typings/EvidenceBenchmarkEffort.ts";

/**
 * Inputs and append-only observers for a Codex benchmark execution.
 *
 * The runner owns native protocol progression, while the caller owns durable
 * persistence of stream chunks and immutable state snapshots.
 */
export interface IEvidenceBenchmarkRunProps {
  /** Fresh or retained state to execute. */
  state: IEvidenceBenchmarkRunState;

  /** Prepared measured workspace. */
  cwd: string;

  /** Frozen directory containing prescribed instructions. */
  instructionsRoot: string;

  /** Explicit native model identifier. */
  model: string;

  /** Explicit native reasoning effort. */
  effort: EvidenceBenchmarkEffort;

  /** Repository revision of this runner invocation. */
  runnerRevision?: string;

  /** Sanitized child-process environment. */
  environment?: NodeJS.ProcessEnv;

  /** Optional executable override used by deterministic fixtures. */
  command?: string;

  /** Arguments placed before the native Codex arguments. */
  commandPrefixArguments?: readonly string[];

  /** Grace period for app-server to exit after its standard input closes. */
  shutdownGraceMs?: number;

  /** Append-only observer for native stream chunks. */
  onOutput: (
    processIndex: number,
    output: IEvidenceBenchmarkOutput,
  ) => void | Promise<void>;

  /** Durable observer for each retained state transition. */
  onState?: (state: IEvidenceBenchmarkRunState) => void | Promise<void>;
}
