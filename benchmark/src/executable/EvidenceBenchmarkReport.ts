import path from "node:path";

import { writeEvidenceBenchmarkReport } from "../EvidenceBenchmarkReport.ts";
import type { IEvidenceBenchmarkReport } from "../structures/IEvidenceBenchmarkReport.ts";

const repository: string = path.resolve(import.meta.dirname, "../../..");
const output: string =
  process.argv[2] === undefined
    ? path.join(repository, "benchmark", "aggregate")
    : path.resolve(process.cwd(), process.argv[2]);

const report: IEvidenceBenchmarkReport = writeEvidenceBenchmarkReport({
  repository,
  output,
});
process.stdout.write(
  `Wrote ${report.cells.length} benchmark cells to ${output}.\n`,
);
