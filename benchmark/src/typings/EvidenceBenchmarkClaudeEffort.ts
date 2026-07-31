/**
 * Selects the native Claude Code effort for one measured cell.
 *
 * Claude Code exposes this set without Codex's `ultra` level, so the runner
 * retains a distinct type instead of accepting an unsupported invocation.
 */
export type EvidenceBenchmarkClaudeEffort =
  "low" | "medium" | "high" | "xhigh" | "max";
