import path from "node:path";

import { EvidenceBenchmarkSupervision } from "../EvidenceBenchmarkSupervision.ts";

const main = (): void => {
  const [subject, runId, decision, expectations, report] =
    process.argv.slice(2);
  if (
    subject === undefined ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subject) ||
    runId === undefined ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    ) ||
    (decision !== "approved" && decision !== "rejected") ||
    expectations === undefined ||
    report === undefined ||
    process.argv.length !== 7
  )
    throw new Error(
      "Usage: pnpm supervise <subject> <run-id> <approved|rejected> <expectations.md> <report.md>",
    );
  const repository: string = path.resolve(import.meta.dirname, "../../..");
  const verdict = EvidenceBenchmarkSupervision.decide({
    runRoot: path.join(
      repository,
      "benchmark",
      "output",
      subject,
      "codex",
      "plain",
      "runs",
      runId,
    ),
    decision,
    expectations,
    report,
  });
  process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
};

main();
