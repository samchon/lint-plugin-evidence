import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkReconcile } from "../EvidenceBenchmarkReconcile";

/**
 * Reconciles one cell the runner can no longer resume.
 *
 * Stages are named in objective order. A stage whose cost must come from the
 * rollout carries a trailing `+`; a stage the runner measured carries the name
 * alone and is left exactly as the runner wrote it.
 *
 * The list must name every stage the run performed, including those the runner
 * never recorded, because it is what the run's goal order is rewritten to be. A
 * list that omits a recorded stage is refused rather than partially applied.
 */
const main = async (): Promise<void> => {
  const [subject, arm, runId, rollout, ...stages] = process.argv.slice(2);
  if (
    subject === undefined ||
    (arm !== "evidence" && arm !== "plain") ||
    runId === undefined ||
    rollout === undefined ||
    stages.length === 0
  )
    throw new Error(
      "Usage: pnpm reconcile <subject> <evidence|plain> <run-id> <rollout.jsonl> <stage[+[dispatches]]>...",
    );
  if (!fs.existsSync(rollout))
    throw new Error(`Codex session rollout not found: ${rollout}.`);

  const repository: string = path.resolve(__dirname, "../../..");
  const runRoot: string = path.join(
    repository,
    "benchmark",
    "output",
    subject,
    "codex",
    arm,
    "runs",
    runId,
  );
  if (!fs.existsSync(path.join(runRoot, "state.json")))
    throw new Error(`Benchmark run not found: ${runRoot}.`);

  const written = await EvidenceBenchmarkReconcile.run({
    runRoot,
    rollout,
    instructionRoot: path.join(repository, "benchmark", "instructions", arm),
    stages: stages.map((entry) => {
      // `overall-final+3` is one stage that took three dispatches to finish.
      const match = /^(.*?)(?:\+(\d*))?$/u.exec(entry)!;
      return {
        name: match[1]!,
        ...(match[2] === undefined
          ? {}
          : {
              derive: true,
              ...(match[2] === "" ? {} : { dispatches: Number(match[2]) }),
            }),
      };
    }),
  });
  for (const stage of written)
    console.log(
      `  ${String(stage.index).padStart(2)} ${stage.name.padEnd(18)} ${stage.tokens.toLocaleString().padStart(12)}  ${String(Math.round(stage.elapsedMs / 60000)).padStart(4)}m  ${stage.derived ? "derived" : "runner"}`,
    );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
