import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkClaudeRunner } from "../EvidenceBenchmarkClaudeRunner.ts";
import { EvidenceBenchmarkRunner } from "../EvidenceBenchmarkRunner.ts";
import { EvidenceBenchmarkWorkspace } from "../EvidenceBenchmarkWorkspace.ts";

type EvidenceBenchmarkEffort =
  EvidenceBenchmarkRunner.IEvidenceBenchmarkRunProps["effort"];
type EvidenceBenchmarkEngine = "codex" | "claude-code";
type EvidenceBenchmarkState =
  | EvidenceBenchmarkRunner.IEvidenceBenchmarkRunState
  | EvidenceBenchmarkClaudeRunner.IEvidenceBenchmarkRunState;

interface IEvidenceBenchmarkArguments {
  engine: EvidenceBenchmarkEngine;
  subject: string;
  arm: EvidenceBenchmarkRunner.EvidenceBenchmarkArm;
  model: string;
  effort: EvidenceBenchmarkEffort;
  runId?: string;
}

interface IEvidenceBenchmarkCell {
  engine: EvidenceBenchmarkEngine;
  subject: string;
  arm: EvidenceBenchmarkRunner.EvidenceBenchmarkArm;
  runId: string;
  benchmarkRevision: string;
  evidenceArtifactSha256?: string;
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
  state: EvidenceBenchmarkState;
}

const EVIDENCE_BENCHMARK_PACKAGE_NAME = "@samchon/lint-plugin-evidence";

const main = async (): Promise<void> => {
  const repository: string = path.resolve(import.meta.dirname, "../../..");
  const options: IEvidenceBenchmarkArguments = parseArguments(
    process.argv.slice(2),
  );
  const benchmarkRevision: string = readBenchmarkRevision(repository);
  const requestedCell: IEvidenceBenchmarkCell = {
    engine: options.engine,
    subject: options.subject,
    arm: options.arm,
    runId: options.runId ?? crypto.randomUUID(),
    benchmarkRevision,
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
    cell.engine !== requestedCell.engine ||
    cell.subject !== requestedCell.subject ||
    cell.arm !== requestedCell.arm ||
    cell.benchmarkRevision !== requestedCell.benchmarkRevision ||
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
    if (archive !== undefined) {
      const retainedArchive: string | undefined =
        process.env.EVIDENCE_BENCHMARK_ARCHIVE;
      if (retainedArchive === undefined)
        await packEvidence(repository, archive);
      else {
        const source: string = path.resolve(retainedArchive);
        if (!fs.statSync(source).isFile())
          throw new Error(
            "EVIDENCE_BENCHMARK_ARCHIVE must name a regular file.",
          );
        fs.copyFileSync(source, archive);
      }
      cell.evidenceArtifactSha256 = sha256(archive);
    }
    prepared = await EvidenceBenchmarkWorkspace.prepareWorkspace({
      repository,
      output,
      project: cell.subject,
      arm: cell.arm,
      variables: {
        name: `benchmark-${cell.subject}-${cell.arm}`,
        apiPackageName: `@benchmark/${cell.subject}-${cell.arm}-api`,
        backendPackageName: `@benchmark/${cell.subject}-${cell.arm}-backend`,
        frontendPackageName: `@benchmark/${cell.subject}-${cell.arm}-frontend`,
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
  await runBenchmark(
    cell,
    records,
    cell.engine === "codex"
      ? EvidenceBenchmarkRunner.create(cell.arm)
      : EvidenceBenchmarkClaudeRunner.create(cell.arm),
  );
};

const runBenchmark = async (
  cell: IEvidenceBenchmarkCell,
  records: IEvidenceBenchmarkRecordPaths,
  initialState: EvidenceBenchmarkState,
): Promise<void> => {
  const repository: string = path.resolve(import.meta.dirname, "../../..");
  const eventDescriptor: number = fs.openSync(records.events, "a");
  const rawDescriptor: number = fs.openSync(records.raw, "a");
  try {
    const onOutput = (
      processIndex: number,
      output: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput,
    ): void => {
      fs.writeFileSync(
        eventDescriptor,
        `${JSON.stringify({
          recordedAt: new Date().toISOString(),
          processIndex,
          ...output,
        })}\n`,
        "utf8",
      );
      fs.writeFileSync(rawDescriptor, output.text, "utf8");
    };
    const onState = (state: EvidenceBenchmarkState): void => {
      fs.fsyncSync(eventDescriptor);
      fs.fsyncSync(rawDescriptor);
      replaceDurably(
        records.state,
        `${JSON.stringify({ cell, records, state }, null, 2)}\n`,
      );
    };
    onState(initialState);
    const result =
      cell.engine === "codex"
        ? await EvidenceBenchmarkRunner.run({
            state: codexState(initialState),
            cwd: records.workspace,
            instructionsRoot: path.join(
              repository,
              "benchmark",
              "instructions",
            ),
            model: cell.model,
            effort: cell.effort,
            environment: process.env,
            onOutput,
            onState,
          })
        : await EvidenceBenchmarkClaudeRunner.run({
            state: claudeState(initialState),
            cwd: records.workspace,
            instructionsRoot: path.join(
              repository,
              "benchmark",
              "instructions",
            ),
            model: cell.model,
            effort: claudeEffort(cell.effort),
            environment: process.env,
            onOutput,
            onState,
          });
    if (result.status !== "completed")
      throw new Error(
        "Benchmark run was interrupted; resume the retained run.",
      );
  } finally {
    fs.fsyncSync(eventDescriptor);
    fs.fsyncSync(rawDescriptor);
    fs.closeSync(eventDescriptor);
    fs.closeSync(rawDescriptor);
  }
};

const parseArguments = (
  input: readonly string[],
): IEvidenceBenchmarkArguments => {
  if (input.length < 5 || input.length > 6)
    throw new Error(
      "Usage: pnpm start -- <codex|claude-code> <subject> <evidence|plain> <model> <effort> [run-id]",
    );
  const engine: string = input[0]!;
  if (engine !== "codex" && engine !== "claude-code")
    throw new Error(`Invalid benchmark engine: ${engine}.`);
  const subject: string = input[1]!;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subject))
    throw new Error(`Invalid benchmark subject: ${subject}.`);
  const arm: string = input[2]!;
  if (arm !== "evidence" && arm !== "plain")
    throw new Error(`Invalid benchmark arm: ${arm}.`);
  const model: string = input[3]!;
  if (model.length === 0) throw new Error("Benchmark model cannot be empty.");
  const effort: string = input[4]!;
  if (
    effort !== "low" &&
    effort !== "medium" &&
    effort !== "high" &&
    effort !== "xhigh" &&
    effort !== "max" &&
    effort !== "ultra"
  )
    throw new Error(`Invalid benchmark effort: ${effort}.`);
  if (engine === "claude-code" && effort === "ultra")
    throw new Error("Claude Code does not support ultra effort.");
  const runId: string | undefined = input[5];
  if (
    runId !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    )
  )
    throw new Error(`Invalid benchmark run ID: ${runId}.`);
  return { engine, subject, arm, model, effort, runId };
};

const codexState = (
  state: EvidenceBenchmarkState,
): EvidenceBenchmarkRunner.IEvidenceBenchmarkRunState => {
  if (!("threadTokenUsage" in state))
    throw new Error("Retained benchmark state does not belong to Codex.");
  return state;
};

const claudeState = (
  state: EvidenceBenchmarkState,
): EvidenceBenchmarkClaudeRunner.IEvidenceBenchmarkRunState => {
  if ("threadTokenUsage" in state)
    throw new Error("Retained benchmark state does not belong to Claude Code.");
  return state;
};

const claudeEffort = (
  effort: EvidenceBenchmarkEffort,
): EvidenceBenchmarkClaudeRunner.EvidenceBenchmarkEffort => {
  if (effort === "ultra")
    throw new Error("Claude Code does not support ultra effort.");
  return effort;
};

const readBenchmarkRevision = (repository: string): string => {
  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    {
      cwd: repository,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  if (status.status !== 0)
    throw new Error("Unable to inspect the benchmark repository state.");
  if ((status.stdout ?? "").trim().length !== 0)
    throw new Error("Benchmark launch requires a clean repository.");
  const revision = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repository,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  const value: string = (revision.stdout ?? "").trim();
  if (revision.status !== 0 || !/^[0-9a-f]{40}$/i.test(value))
    throw new Error("Unable to identify the benchmark repository revision.");
  return value;
};

const sha256 = (file: string): string =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

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
