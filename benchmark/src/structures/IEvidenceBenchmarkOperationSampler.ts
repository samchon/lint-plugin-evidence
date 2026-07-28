import type { IEvidenceBenchmarkOperation } from "./IEvidenceBenchmarkOperation.ts";

/** Low-overhead host sampler injected into the outer block monitor. */
export interface IEvidenceBenchmarkOperationSampler {
  /** Captures one host diagnostic point without inferring provider wait. */
  sample(): IEvidenceBenchmarkOperation.IBlockSample["host"];
}
