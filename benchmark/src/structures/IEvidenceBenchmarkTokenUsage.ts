/**
 * Native Codex token counters retained at a terminal Goal boundary.
 *
 * The runner snapshots cumulative thread counters before and after each Goal
 * and stores their nonnegative delta in this exact shape.
 */
export interface IEvidenceBenchmarkTokenUsage {
  /** All native tokens reported for the thread. */
  totalTokens: number;

  /** Uncached prompt tokens. */
  inputTokens: number;

  /** Prompt tokens served from the provider cache. */
  cachedInputTokens: number;

  /** Prompt tokens written into the provider cache. */
  cacheWriteInputTokens: number;

  /** Generated response tokens, including reasoning when reported together. */
  outputTokens: number;

  /** Reasoning tokens reported separately by Codex. */
  reasoningOutputTokens: number;
}
