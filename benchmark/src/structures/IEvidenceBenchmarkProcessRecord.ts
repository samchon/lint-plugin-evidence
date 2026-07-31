/**
 * Invocation and terminal facts for one native agent process.
 *
 * A run retains every launch and resume attempt so failures, elapsed time,
 * arguments, and terminal disposition remain attributable.
 */
export interface IEvidenceBenchmarkProcessRecord {
  /** Repository revision of the runner that started this native process. */
  runnerRevision?: string;

  /** Resolved executable launched without a shell. */
  command: string;

  /** Exact argument vector supplied to the executable. */
  arguments: string[];

  /** Wall-clock process duration in milliseconds. */
  elapsedMs: number;

  /** Exit code, or null while running or when terminated by a signal. */
  exitCode: number | null;

  /** Terminating signal, or null when none was reported. */
  signal: NodeJS.Signals | null;
}
