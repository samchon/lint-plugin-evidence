import type { IEvidenceBenchmarkOperation } from "./IEvidenceBenchmarkOperation.ts";

/**
 * Fail-closed boundary between orchestration and the admitted Codex runner,
 * grader, and reporter.
 */
export interface IEvidenceBenchmarkOperationAdapter {
  /**
   * Runs one prepared cell only through the production runner and its launch
   * gate.
   */
  run(
    plan: IEvidenceBenchmarkOperation.IPlan,
    cell: IEvidenceBenchmarkOperation.ICell,
    signal: AbortSignal,
  ): Promise<IEvidenceBenchmarkOperationAdapter.ITerminalResult>;

  /** Cooperatively interrupts one live runner and its owned descendants. */
  abort(
    cell: IEvidenceBenchmarkOperation.ICell,
    request: IEvidenceBenchmarkOperation.IAbortRequest,
  ): Promise<void>;

  /** Reads one durable runner observation without reconstructing token usage. */
  observe(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): Promise<IEvidenceBenchmarkOperation.IObservation>;

  /**
   * Reopens a stale attempt only to verify and right-censor its retained
   * record; this method must never send another model turn.
   */
  sealInterrupted(
    plan: IEvidenceBenchmarkOperation.IPlan,
    cell: IEvidenceBenchmarkOperation.ICell,
    request: IEvidenceBenchmarkOperation.IAbortRequest,
  ): Promise<IEvidenceBenchmarkOperationAdapter.ITerminalResult>;

  /** Grades one sealed run through the frozen blind-grading procedure. */
  grade(
    plan: IEvidenceBenchmarkOperation.IPlan,
    cell: IEvidenceBenchmarkOperation.ICell,
  ): Promise<IEvidenceBenchmarkOperationAdapter.IPostprocessResult>;

  /** Reports one fully terminal randomized block. */
  report(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): Promise<IEvidenceBenchmarkOperationAdapter.IPostprocessResult>;
}

/** Results returned by the admitted production operation facade. */
export namespace IEvidenceBenchmarkOperationAdapter {
  /** Runner terminal result required before the outer seal can close. */
  export interface ITerminalResult {
    /** Exact terminal status returned by the runner. */
    status: "completed" | "failed" | "interrupted";

    /** Evidence-backed runner terminal reason. */
    reason: string;

    /** Explicit terminal boundary, including frozen safety-limit stops. */
    subtype: IEvidenceBenchmarkOperation.TerminalSubtype;

    /** Shared block-stop digest required exactly for safety-limit outcomes. */
    blockStopSha256: string | null;

    /** Absolute runner-owned immutable result directory. */
    runnerRecord: string;

    /** Absolute runner-owned terminal summary path. */
    runnerTerminal: string;
  }

  /** Grading or reporting output retained outside mutable live state. */
  export interface IPostprocessResult {
    /** Human-readable operation outcome. */
    message: string;

    /** Absolute retained output paths. */
    outputs: string[];
  }
}
