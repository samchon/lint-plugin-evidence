import path from "node:path";

import { EvidenceBenchmarkOperationCommandLine } from "./EvidenceBenchmarkOperationCommandLine.ts";
import { EvidenceBenchmarkOperationFacade } from "./EvidenceBenchmarkOperationFacade.ts";
import { EvidenceBenchmarkOperationPreparer } from "./EvidenceBenchmarkOperationPreparer.ts";
import { EvidenceBenchmarkOperationSampler } from "./EvidenceBenchmarkOperationSampler.ts";

/** Composes the production benchmark operations command. */
export namespace EvidenceBenchmarkOperationExecutable {
  /** Resolves repository paths and delegates one process invocation. */
  export async function main(arguments_: readonly string[]): Promise<void> {
    const repository: string = path.resolve(import.meta.dirname, "..", "..");
    const command = new EvidenceBenchmarkOperationCommandLine({
      repository,
      preparer: new EvidenceBenchmarkOperationPreparer({
        workRoot: path.join(repository, "benchmark", ".work"),
        now: (): Date => new Date(),
      }),
      loadAdapter: EvidenceBenchmarkOperationFacade.load,
      now: (): Date => new Date(),
      monotonic: (): bigint => process.hrtime.bigint(),
      sampler: new EvidenceBenchmarkOperationSampler(),
      stdout: (value: string): void => {
        process.stdout.write(value);
      },
    });
    await command.main(arguments_);
  }
}
