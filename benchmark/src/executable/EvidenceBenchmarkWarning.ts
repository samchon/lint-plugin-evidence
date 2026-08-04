import path from "node:path";

import { EvidenceBenchmarkSupervision } from "../EvidenceBenchmarkSupervision.ts";

const main = (): void => {
  const [subject, runId, warningFile] = process.argv.slice(2);
  if (
    subject === undefined ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subject) ||
    runId === undefined ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    ) ||
    warningFile === undefined ||
    process.argv.length !== 5
  )
    throw new Error("Usage: pnpm warn <subject> <run-id> <warning.json>");
  const repository: string = path.resolve(import.meta.dirname, "../../..");
  const verdict = EvidenceBenchmarkSupervision.warn({
    runRoot: path.join(
      repository,
      "benchmark",
      "output",
      subject,
      "codex",
      "evidence",
      "runs",
      runId,
    ),
    instructionsRoot: path.join(repository, "benchmark", "instructions"),
    warningFile,
    subject,
  });
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
};

main();
