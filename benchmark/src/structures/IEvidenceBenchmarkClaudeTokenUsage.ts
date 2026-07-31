/**
 * Native Claude Code token counters retained from a terminal result.
 *
 * Claude reports these categories directly for one noninteractive process; the
 * runner sums them without inventing a separate reasoning category.
 */
export interface IEvidenceBenchmarkClaudeTokenUsage {
  /** Sum of every retained Claude token category. */
  totalTokens: number;

  /** Uncached prompt tokens. */
  inputTokens: number;

  /** Prompt tokens read from the provider cache. */
  cachedInputTokens: number;

  /** Prompt tokens written into the provider cache. */
  cacheWriteInputTokens: number;

  /** Generated response tokens. */
  outputTokens: number;
}
