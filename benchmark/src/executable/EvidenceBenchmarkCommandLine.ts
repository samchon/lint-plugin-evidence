import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkRunner } from "../EvidenceBenchmarkRunner.ts";
import { EvidenceBenchmarkWorkspace } from "../EvidenceBenchmarkWorkspace.ts";

type EvidenceBenchmarkEffort =
  EvidenceBenchmarkRunner.IEvidenceBenchmarkRunProps["effort"];

interface IEvidenceBenchmarkArguments {
  subject: string;
  arm: EvidenceBenchmarkRunner.EvidenceBenchmarkArm;
  model: string;
  effort: EvidenceBenchmarkEffort;
  runId?: string;
}

interface IEvidenceBenchmarkCell {
  engine: "codex";
  subject: string;
  arm: EvidenceBenchmarkRunner.EvidenceBenchmarkArm;
  runId: string;
  model: string;
  effort: EvidenceBenchmarkEffort;
}

interface IEvidenceBenchmarkRecordPaths {
  root: string;
  workspace: string;
  state: string;
  events: string;
  raw: string;
}

interface IEvidenceBenchmarkStateFile {
  cell: IEvidenceBenchmarkCell;
  records: IEvidenceBenchmarkRecordPaths;
  state: EvidenceBenchmarkRunner.IEvidenceBenchmarkRunState;
}

const EVIDENCE_BENCHMARK_PACKAGE_NAME = "@samchon/lint-plugin-evidence";

const main = async (): Promise<void> => {
  const repository: string = path.resolve(import.meta.dirname, "../../..");
  const options: IEvidenceBenchmarkArguments = parseArguments(
    process.argv.slice(2),
  );
  const requestedCell: IEvidenceBenchmarkCell = {
    engine: "codex",
    subject: options.subject,
    arm: options.arm,
    runId: options.runId ?? crypto.randomUUID(),
    model: options.model,
    effort: options.effort,
  };
  const output: string = path.join(
    repository,
    "benchmark",
    "result",
    requestedCell.subject,
    requestedCell.engine,
    requestedCell.arm,
    "runs",
    requestedCell.runId,
  );
  const retained: IEvidenceBenchmarkStateFile | undefined =
    options.runId === undefined
      ? undefined
      : (JSON.parse(
          fs.readFileSync(path.join(output, "state.json"), "utf8"),
        ) as IEvidenceBenchmarkStateFile);
  const cell: IEvidenceBenchmarkCell = retained?.cell ?? requestedCell;
  if (
    cell.subject !== requestedCell.subject ||
    cell.arm !== requestedCell.arm ||
    cell.model !== requestedCell.model ||
    cell.effort !== requestedCell.effort ||
    cell.runId !== requestedCell.runId
  )
    throw new Error("Retained benchmark cell does not match the invocation.");

  if (retained !== undefined) {
    await runBenchmark(cell, retained.records, retained.state);
    return;
  }

  const temporary: string | undefined =
    cell.arm === "evidence"
      ? fs.mkdtempSync(path.join(os.tmpdir(), "evidence-benchmark-"))
      : undefined;
  const archive: string | undefined =
    temporary === undefined ? undefined : path.join(temporary, "evidence.tgz");
  let prepared: EvidenceBenchmarkWorkspace.IEvidenceBenchmarkWorkspaceResult;
  try {
    if (archive !== undefined) await packEvidence(repository, archive);
    prepared = await EvidenceBenchmarkWorkspace.prepareWorkspace({
      repository,
      output,
      project: cell.subject,
      arm: cell.arm,
      variables: {
        name: `evidence-benchmark-${cell.subject}-${cell.arm}`,
        apiPackageName: `@evidence-benchmark/${cell.subject}-${cell.arm}-api`,
        backendPackageName: `@evidence-benchmark/${cell.subject}-${cell.arm}-backend`,
        frontendPackageName: `@evidence-benchmark/${cell.subject}-${cell.arm}-frontend`,
      },
      artifact:
        archive === undefined
          ? undefined
          : {
              name: EVIDENCE_BENCHMARK_PACKAGE_NAME,
              archive,
            },
    });
  } finally {
    if (temporary !== undefined)
      fs.rmSync(temporary, { recursive: true, force: true });
  }

  const records: IEvidenceBenchmarkRecordPaths = {
    root: prepared.root,
    workspace: prepared.workspace,
    state: path.join(prepared.root, "state.json"),
    events: path.join(prepared.root, "events.jsonl"),
    raw: path.join(prepared.root, "raw.log"),
  };
  initializeAppendOnly(records.events);
  initializeAppendOnly(records.raw);
  await runBenchmark(cell, records, EvidenceBenchmarkRunner.create(cell.arm));
};

const runBenchmark = async (
  cell: IEvidenceBenchmarkCell,
  records: IEvidenceBenchmarkRecordPaths,
  initialState: EvidenceBenchmarkRunner.IEvidenceBenchmarkRunState,
): Promise<void> => {
  const repository: string = path.resolve(import.meta.dirname, "../../..");
  const cursors: number[] = initialState.processes.map(
    (processRecord) => processRecord.output.length,
  );
  await EvidenceBenchmarkRunner.run({
    state: initialState,
    cwd: records.workspace,
    instructionsRoot: path.join(repository, "benchmark", "instructions"),
    model: cell.model,
    effort: cell.effort,
    environment: process.env,
    onState: (state): void => {
      for (
        let processIndex = 0;
        processIndex < state.processes.length;
        ++processIndex
      ) {
        const processRecord = state.processes[processIndex]!;
        const cursor: number = cursors[processIndex] ?? 0;
        const outputRecords = processRecord.output.slice(cursor);
        if (outputRecords.length === 0) continue;
        appendDurably(
          records.events,
          outputRecords
            .map((record) =>
              JSON.stringify({
                processIndex,
                ...record,
              }),
            )
            .join("\n") + "\n",
        );
        appendDurably(
          records.raw,
          outputRecords.map((record) => record.text).join(""),
        );
        cursors[processIndex] = processRecord.output.length;
      }
      replaceDurably(
        records.state,
        `${JSON.stringify({ cell, records, state }, null, 2)}\n`,
      );
    },
  });
};

const parseArguments = (
  input: readonly string[],
): IEvidenceBenchmarkArguments => {
  if (input.length < 2 || input.length > 5)
    throw new Error(
      "Usage: pnpm start -- <subject> <evidence|plain> [model] [effort] [run-id]",
    );
  const subject: string = input[0]!;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subject))
    throw new Error(`Invalid benchmark subject: ${subject}.`);
  const arm: string = input[1]!;
  if (arm !== "evidence" && arm !== "plain")
    throw new Error(`Invalid benchmark arm: ${arm}.`);
  const model: string = input[2] ?? "gpt-5.6-terra";
  if (model.length === 0) throw new Error("Benchmark model cannot be empty.");
  const effort: string = input[3] ?? "high";
  if (
    effort !== "low" &&
    effort !== "medium" &&
    effort !== "high" &&
    effort !== "xhigh" &&
    effort !== "max" &&
    effort !== "ultra"
  )
    throw new Error(`Invalid benchmark effort: ${effort}.`);
  const runId: string | undefined = input[4];
  if (
    runId !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    )
  )
    throw new Error(`Invalid benchmark run ID: ${runId}.`);
  return { subject, arm, model, effort, runId };
};

const packEvidence = async (
  repository: string,
  archive: string,
): Promise<void> => {
  const entrypoint: string | undefined = process.env.npm_execpath;
  if (entrypoint === undefined)
    throw new Error(
      "The benchmark command line must be launched through pnpm.",
    );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [entrypoint, "pack", "--out", archive],
      {
        cwd: path.join(repository, "packages", "evidence"),
        env: process.env,
        shell: false,
        windowsHide: true,
        stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("close", (exitCode, signal) => {
      if (exitCode === 0 && signal === null) resolve();
      else
        reject(
          new Error(
            [
              "Evidence package pack exited with",
              `code ${String(exitCode)} and signal ${String(signal)}.`,
            ].join(" "),
          ),
        );
    });
  });
};

const initializeAppendOnly = (file: string): void => {
  const descriptor: number = fs.openSync(file, "wx");
  fs.closeSync(descriptor);
};

const appendDurably = (file: string, content: string): void => {
  if (content.length === 0) return;
  const descriptor: number = fs.openSync(file, "a");
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
};

const replaceDurably = (file: string, content: string): void => {
  const temporary: string = `${file}.${process.pid}.tmp`;
  const descriptor: number = fs.openSync(temporary, "w");
  try {
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
