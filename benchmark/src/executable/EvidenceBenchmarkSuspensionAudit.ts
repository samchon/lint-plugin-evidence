import path from "node:path";

import { auditWindowsEvidenceBenchmarkSuspensions } from "../EvidenceBenchmarkSuspensionAudit";
import type { IEvidenceBenchmarkSuspensionAuditResult } from "../EvidenceBenchmarkSuspensionAudit";

const repository: string = path.resolve(__dirname, "../../..");
const args: string[] = process.argv.slice(2);
const runIds: string[] = [];
for (let index: number = 0; index < args.length; ++index) {
  if (args[index] !== "--run-id")
    throw new Error(`Unexpected suspension-audit argument: ${args[index]}.`);
  const runId: string | undefined = args[++index];
  if (runId === undefined) throw new Error("Missing value after --run-id.");
  runIds.push(runId);
}

const result: IEvidenceBenchmarkSuspensionAuditResult =
  auditWindowsEvidenceBenchmarkSuspensions(
    repository,
    runIds.length === 0 ? undefined : runIds,
  );
process.stdout.write(
  `Audited ${result.runs} benchmark runs across ${result.intervals} disconnected intervals; added ${result.added} corrections.\n`,
);
