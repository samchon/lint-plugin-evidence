import type { IEvidenceBenchmarkOperation } from "./IEvidenceBenchmarkOperation.ts";

/** Deterministic, model-free preparation dependency used by the CLI. */
export interface IEvidenceBenchmarkOperationPreparer {
  /** Packs, materializes, installs, and seals one randomized four-cell plan. */
  prepare(
    request: IEvidenceBenchmarkOperation.IPrepareRequest,
  ): Promise<IEvidenceBenchmarkOperation.IPlan>;
}
