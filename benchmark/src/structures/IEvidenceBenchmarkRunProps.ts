import type { IEvidenceBenchmarkCheckpointStorage } from "./IEvidenceBenchmarkCheckpointStorage.ts";
import type { IEvidenceBenchmarkGoalRecord } from "./IEvidenceBenchmarkGoalRecord.ts";
import type { IEvidenceBenchmarkOutput } from "./IEvidenceBenchmarkOutput.ts";
import type { IEvidenceBenchmarkRunState } from "./IEvidenceBenchmarkRunState.ts";
import type { EvidenceBenchmarkEffort } from "../typings/EvidenceBenchmarkEffort.ts";
import type { EvidenceBenchmarkSupervisionGoal } from "../typings/EvidenceBenchmarkSupervisionGoal.ts";

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

  /** Retained run root needed to verify external supervision evidence. */
  runRoot?: string;

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

  /** Exact source boundary used to create a checkpoint-derived thread. */
  fork?: {
    sourceSessionId: string;
    terminalTurnId: string;
  };

  /** Ends cleanly after retaining the named recovery boundary. */
  stopAfterGoal?: "backend-start";

  /** Ends cleanly at Goal boundaries that require external verification. */
  pauseAfterGoals?: readonly EvidenceBenchmarkSupervisionGoal[];

  /** Registers runner-owned backend review ledger tools on a fresh thread. */
  reviewLedger?: "backend";

  /** Grace period for app-server to exit after its standard input closes. */
  shutdownGraceMs?: number;

  /** Append-only observer for native stream chunks. */
  onOutput: (
    processIndex: number,
    output: IEvidenceBenchmarkOutput,
  ) => void | Promise<void>;

  /** Durable observer for each retained state transition. */
  onState?: (state: IEvidenceBenchmarkRunState) => void | Promise<void>;

  /** Persists a workspace checkpoint before the next Goal is dispatched. */
  onCheckpoint?: (request: {
    state: IEvidenceBenchmarkRunState;
    goal: IEvidenceBenchmarkGoalRecord;
    processElapsedMs: number;
  }) =>
    | IEvidenceBenchmarkCheckpointStorage
    | Promise<IEvidenceBenchmarkCheckpointStorage>;
}
