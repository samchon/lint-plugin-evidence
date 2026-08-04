import path from "node:path";

import { writeEvidenceBenchmarkReport } from "../EvidenceBenchmarkReport";
import type { IEvidenceBenchmarkReport } from "../structures/IEvidenceBenchmarkReport";

const repository: string = path.resolve(__dirname, "../../..");
const args: string[] = process.argv.slice(2);
let output: string = path.join(repository, "benchmark", "aggregate");
const runIds: string[] = [];
let outputAssigned: boolean = false;
for (let i: number = 0; i < args.length; ++i) {
  const argument: string = args[i]!;
  if (argument === "--run-id") {
    const runId: string | undefined = args[++i];
    if (runId === undefined) throw new Error("Missing value after --run-id.");
    runIds.push(runId);
  } else if (outputAssigned === false) {
    output = path.resolve(process.cwd(), argument);
    outputAssigned = true;
  } else throw new Error(`Unexpected benchmark report argument: ${argument}.`);
}

const report: IEvidenceBenchmarkReport = writeEvidenceBenchmarkReport({
  repository,
  output,
  ...(runIds.length === 0 ? {} : { runIds }),
});
process.stdout.write(
  `Wrote ${report.cells.length} benchmark cells to ${output}.\n`,
);
