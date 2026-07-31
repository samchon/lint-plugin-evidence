/**
 * One ordered native-process stream chunk retained by the runner.
 *
 * Consumers append this record to `events.jsonl` and append its text to
 * `raw.log`, preserving native delivery order for later audit.
 */
export interface IEvidenceBenchmarkOutput {
  /** Zero-based arrival order within one native process. */
  sequence: number;

  /** Milliseconds since that native process started. */
  elapsedMs: number;

  /** Process stream that produced or received the chunk. */
  stream: "stdin" | "stdout" | "stderr";

  /** Exact bytes decoded as text without normalization. */
  text: string;
}
