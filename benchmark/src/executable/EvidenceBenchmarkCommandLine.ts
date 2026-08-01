import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import typia from "typia";

import { EvidenceBenchmarkCheckpoint } from "../EvidenceBenchmarkCheckpoint.ts";
import { EvidenceBenchmarkRunner } from "../EvidenceBenchmarkRunner.ts";
import { EvidenceBenchmarkWorkspace } from "../EvidenceBenchmarkWorkspace.ts";
import { sanitizeBenchmarkEnvironment } from "../sanitizeBenchmarkEnvironment.ts";
import type { IEvidenceBenchmarkCheckpoint } from "../structures/IEvidenceBenchmarkCheckpoint.ts";
import type { IEvidenceBenchmarkInputIdentity } from "../structures/IEvidenceBenchmarkInputIdentity.ts";
import type { IEvidenceBenchmarkOutput } from "../structures/IEvidenceBenchmarkOutput.ts";
import type { IEvidenceBenchmarkRunState } from "../structures/IEvidenceBenchmarkRunState.ts";
import type { IEvidenceBenchmarkWorkspaceResult } from "../structures/IEvidenceBenchmarkWorkspaceResult.ts";
import type { EvidenceBenchmarkArm } from "../typings/EvidenceBenchmarkArm.ts";
import type { EvidenceBenchmarkEffort } from "../typings/EvidenceBenchmarkEffort.ts";

type EvidenceBenchmarkEngine = "codex";
type EvidenceBenchmarkState = IEvidenceBenchmarkRunState;

interface IEvidenceBenchmarkArguments {
  engine: EvidenceBenchmarkEngine;
  subject: string;
  arm: EvidenceBenchmarkArm;
  model: string;
  effort: EvidenceBenchmarkEffort;
  runId?: string;
  checkpointRunId?: string;
  stopAfter?: "backend-start";
}

interface IEvidenceBenchmarkCell {
  engine: EvidenceBenchmarkEngine;
  subject: string;
  arm: EvidenceBenchmarkArm;
  runId: string;
  benchmarkRevision: string;
  evidenceArtifactSha256?: string;
  model: string;
  effort: EvidenceBenchmarkEffort;
  launchedAt?: string;
  inputIdentity?: IEvidenceBenchmarkInputIdentity;
  checkpointSource?: {
    runId: string;
    name: "backend-start";
    inheritedWallElapsedMs: number;
  };
  stopAfter?: "backend-start";
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
  const options: IEvidenceBenchmarkArguments = parseEvidenceBenchmarkArguments(
    process.argv.slice(2),
  );
  const runnerRevision: string = readEvidenceBenchmarkRevision(repository);
  const inputIdentity: IEvidenceBenchmarkInputIdentity =
    EvidenceBenchmarkCheckpoint.identifyInputs({
      repository,
      subject: options.subject,
      arm: options.arm,
    });
  const requestedCell: IEvidenceBenchmarkCell = {
    engine: options.engine,
    subject: options.subject,
    arm: options.arm,
    runId: options.runId ?? crypto.randomUUID(),
    benchmarkRevision: runnerRevision,
    model: options.model,
    effort: options.effort,
    inputIdentity,
    stopAfter: options.stopAfter,
  };
  const output: string = path.join(
    repository,
    "benchmark",
    "output",
    requestedCell.subject,
    requestedCell.engine,
    requestedCell.arm,
    "runs",
    requestedCell.runId,
  );
  const retained: IEvidenceBenchmarkStateFile | undefined =
    options.runId === undefined
      ? undefined
      : typia.assert<IEvidenceBenchmarkStateFile>(
          JSON.parse(fs.readFileSync(path.join(output, "state.json"), "utf8")),
        );
  const checkpointSource: IEvidenceBenchmarkStateFile | undefined =
    options.checkpointRunId === undefined
      ? undefined
      : readStateFile(
          evidenceBenchmarkOutputPath(
            repository,
            options.subject,
            options.engine,
            options.arm,
            options.checkpointRunId,
          ),
        );
  const records: IEvidenceBenchmarkRecordPaths =
    evidenceBenchmarkRecordPaths(output);
  if (
    retained !== undefined &&
    !sameEvidenceBenchmarkRecordPaths(retained.records, records)
  )
    throw new Error("Retained benchmark record paths do not match the run.");
  const cell: IEvidenceBenchmarkCell = retained?.cell ?? requestedCell;
  if (
    cell.engine !== requestedCell.engine ||
    cell.subject !== requestedCell.subject ||
    cell.arm !== requestedCell.arm ||
    cell.model !== requestedCell.model ||
    cell.effort !== requestedCell.effort ||
    cell.runId !== requestedCell.runId ||
    cell.stopAfter !== requestedCell.stopAfter
  )
    throw new Error("Retained benchmark cell does not match the invocation.");
  if (retained !== undefined)
    assertEvidenceBenchmarkRecoveryRevision(
      repository,
      cell.benchmarkRevision,
      runnerRevision,
    );
  if (retained !== undefined)
    assertSameInputIdentity(
      retained.cell.inputIdentity,
      inputIdentity,
      "Retained benchmark inputs changed after launch.",
    );
  if (
    retained !== undefined &&
    ((cell.arm === "evidence" &&
      !/^[0-9a-f]{64}$/i.test(cell.evidenceArtifactSha256 ?? "")) ||
      (cell.arm === "plain" && cell.evidenceArtifactSha256 !== undefined))
  )
    throw new Error(
      "Retained benchmark cell has an invalid artifact identity.",
    );

  if (retained !== undefined) {
    if (retained.state.status === "checkpointed")
      throw new Error(
        "Checkpoint-only runs cannot resume; derive a run from backend-start.",
      );
    assertRegularFile(records.state);
    await runBenchmark(cell, records, retained.state, runnerRevision);
    return;
  }

  if (checkpointSource !== undefined) {
    await runFromBackendStartCheckpoint({
      repository,
      runnerRevision,
      requestedCell,
      source: checkpointSource,
      records,
    });
    return;
  }

  const temporary: string | undefined =
    cell.arm === "evidence"
      ? fs.mkdtempSync(path.join(os.tmpdir(), "evidence-benchmark-"))
      : undefined;
  const archive: string | undefined =
    temporary === undefined ? undefined : path.join(temporary, "evidence.tgz");
  let prepared: IEvidenceBenchmarkWorkspaceResult;
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
        name: `benchmark-${cell.subject}`,
        apiPackageName: `@benchmark/${cell.subject}-api`,
        backendPackageName: `@benchmark/${cell.subject}-backend`,
        frontendPackageName: `@benchmark/${cell.subject}-frontend`,
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

  if (
    !sameEvidenceBenchmarkRecordPaths(
      records,
      evidenceBenchmarkRecordPaths(prepared.root),
    )
  )
    throw new Error("Prepared benchmark workspace has an invalid path.");
  initializeAppendOnly(records.events);
  initializeAppendOnly(records.raw);
  await runBenchmark(
    cell,
    records,
    EvidenceBenchmarkRunner.create(cell.arm),
    runnerRevision,
  );
};

const runFromBackendStartCheckpoint = async (props: {
  repository: string;
  runnerRevision: string;
  requestedCell: IEvidenceBenchmarkCell;
  source: IEvidenceBenchmarkStateFile;
  records: IEvidenceBenchmarkRecordPaths;
}): Promise<void> => {
  const sourceCell: IEvidenceBenchmarkCell = props.source.cell;
  const requested: IEvidenceBenchmarkCell = props.requestedCell;
  if (
    sourceCell.engine !== requested.engine ||
    sourceCell.subject !== requested.subject ||
    sourceCell.arm !== requested.arm ||
    sourceCell.model !== requested.model ||
    sourceCell.effort !== requested.effort
  )
    throw new Error("Checkpoint source cell does not match the invocation.");
  const sourceRoot: string = evidenceBenchmarkOutputPath(
    props.repository,
    sourceCell.subject,
    sourceCell.engine,
    sourceCell.arm,
    sourceCell.runId,
  );
  if (
    !sameEvidenceBenchmarkRecordPaths(
      props.source.records,
      evidenceBenchmarkRecordPaths(sourceRoot),
    )
  )
    throw new Error("Checkpoint source record paths do not match the run.");
  if (
    (sourceCell.arm === "evidence" &&
      !/^[0-9a-f]{64}$/i.test(sourceCell.evidenceArtifactSha256 ?? "")) ||
    (sourceCell.arm === "plain" &&
      sourceCell.evidenceArtifactSha256 !== undefined)
  )
    throw new Error("Checkpoint source has an invalid artifact identity.");

  const checkpoint: IEvidenceBenchmarkCheckpoint | undefined =
    props.source.state.checkpoints?.find(
      (candidate) => candidate.name === "backend-start",
    );
  const start = props.source.state.goals.find((goal) => goal.index === 0);
  if (
    checkpoint === undefined ||
    start === undefined ||
    start.name !== "backend-start" ||
    start.goal?.status !== "complete" ||
    start.goal.threadId !== checkpoint.sourceSessionId ||
    start.terminalTurnId !== checkpoint.terminalTurnId ||
    !start.terminalTurnCompleted ||
    !start.threadIdle ||
    start.tokenUsageTurnId !== start.terminalTurnId ||
    start.tokenUsageEnd === null ||
    props.source.state.sessionId !== checkpoint.sourceSessionId ||
    checkpoint.cliVersion !== props.source.state.cliVersion
  )
    throw new Error("Checkpoint source lacks an exact backend-start boundary.");
  requested.benchmarkRevision = sourceCell.benchmarkRevision;
  requested.evidenceArtifactSha256 = sourceCell.evidenceArtifactSha256;
  requested.checkpointSource = {
    runId: sourceCell.runId,
    name: "backend-start",
    inheritedWallElapsedMs: checkpoint.inheritedWallElapsedMs,
  };
  let workspace: string;
  let restored = false;
  try {
    workspace = EvidenceBenchmarkCheckpoint.restoreWorkspaceSnapshot({
      sourceRunRoot: sourceRoot,
      workspaceRelativePath: checkpoint.workspaceRelativePath,
      workspaceSha256: checkpoint.workspaceSha256,
      destinationRunRoot: props.records.root,
    });
    restored = true;
    await EvidenceBenchmarkWorkspace.installDependencies(workspace);
    EvidenceBenchmarkCheckpoint.assertRestoredWorkspace({
      workspace,
      materialSha256: checkpoint.workspaceMaterialSha256,
      gitHead: checkpoint.workspaceGitHead,
      gitStatus: checkpoint.workspaceGitStatus,
    });
    EvidenceBenchmarkCheckpoint.applyReviewSkill({
      workspace,
      source: path.join(
        props.repository,
        "benchmark",
        "template",
        requested.arm,
        ".agents",
        "skills",
        "review",
      ),
    });
    initializeAppendOnly(props.records.events);
    initializeAppendOnly(props.records.raw);
  } catch (error) {
    if (restored)
      fs.rmSync(props.records.root, { recursive: true, force: true });
    throw error;
  }
  const initialState: EvidenceBenchmarkState = {
    arm: requested.arm,
    cliVersion: checkpoint.cliVersion,
    nextInstructionIndex: 1,
    status: "ready",
    threadTokenUsage: structuredClone(start.tokenUsageEnd),
    goals: [structuredClone(start)],
    checkpoints: [structuredClone(checkpoint)],
    inheritedProcessElapsedMs: checkpoint.inheritedProcessElapsedMs,
    processes: [],
  };
  await runBenchmark(
    requested,
    props.records,
    initialState,
    props.runnerRevision,
    {
      sourceSessionId: checkpoint.sourceSessionId,
      terminalTurnId: checkpoint.terminalTurnId,
    },
  );
};

const runBenchmark = async (
  cell: IEvidenceBenchmarkCell,
  records: IEvidenceBenchmarkRecordPaths,
  initialState: EvidenceBenchmarkState,
  runnerRevision: string,
  fork?: {
    sourceSessionId: string;
    terminalTurnId: string;
  },
): Promise<void> => {
  cell.launchedAt ??= new Date().toISOString();
  if (initialState.arm !== cell.arm)
    throw new Error("Retained benchmark state uses a different arm.");
  assertDirectory(records.root);
  assertDirectory(records.workspace);
  assertRegularFile(records.events);
  assertRegularFile(records.raw);
  if (cell.arm === "evidence") {
    const archive: string = path.join(
      records.workspace,
      ".benchmark-deps",
      "evidence.tgz",
    );
    assertRegularFile(archive);
    if (sha256(archive) !== cell.evidenceArtifactSha256)
      throw new Error("Evidence benchmark artifact no longer matches its SHA.");
  }
  const repository: string = path.resolve(import.meta.dirname, "../../..");
  const environment: NodeJS.ProcessEnv = sanitizeBenchmarkEnvironment(
    process.env,
  );
  const eventDescriptor: number = fs.openSync(records.events, "a");
  const rawDescriptor: number = fs.openSync(records.raw, "a");
  try {
    const onOutput = (
      processIndex: number,
      output: IEvidenceBenchmarkOutput,
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
    const result = await EvidenceBenchmarkRunner.run({
      state: initialState,
      cwd: records.workspace,
      instructionsRoot: path.join(repository, "benchmark", "instructions"),
      model: cell.model,
      effort: cell.effort,
      runnerRevision,
      fork,
      stopAfterGoal: cell.stopAfter,
      environment,
      onOutput,
      onState,
      onCheckpoint: () =>
        EvidenceBenchmarkCheckpoint.createWorkspaceSnapshot({
          runRoot: records.root,
          workspace: records.workspace,
          inheritedWallElapsedMs: Math.max(
            0,
            Date.now() -
              Date.parse(cell.launchedAt ?? new Date().toISOString()),
          ),
        }),
    });
    if (
      result.status !== "completed" &&
      !(result.status === "checkpointed" && cell.stopAfter === "backend-start")
    )
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

const evidenceBenchmarkOutputPath = (
  repository: string,
  subject: string,
  engine: EvidenceBenchmarkEngine,
  arm: EvidenceBenchmarkArm,
  runId: string,
): string =>
  path.join(
    repository,
    "benchmark",
    "output",
    subject,
    engine,
    arm,
    "runs",
    runId,
  );

const readStateFile = (root: string): IEvidenceBenchmarkStateFile =>
  typia.assert<IEvidenceBenchmarkStateFile>(
    JSON.parse(fs.readFileSync(path.join(root, "state.json"), "utf8")),
  );

const assertSameInputIdentity = (
  retained: IEvidenceBenchmarkInputIdentity | undefined,
  current: IEvidenceBenchmarkInputIdentity,
  message: string,
): void => {
  if (
    retained === undefined ||
    retained.templateSha256 !== current.templateSha256 ||
    retained.requirementsSha256 !== current.requirementsSha256 ||
    retained.instructionsSha256 !== current.instructionsSha256
  )
    throw new Error(message);
};

export const parseEvidenceBenchmarkArguments = (
  input: readonly string[],
): IEvidenceBenchmarkArguments => {
  if (input.length < 5 || input.length > 7)
    throw new Error(
      "Usage: pnpm start codex <subject> <evidence|plain> <model> <effort> [run-id [--stop-after-backend-start] | --stop-after-backend-start | --from-backend-start source-run-id]",
    );
  const engine: string = input[0]!;
  if (engine !== "codex")
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
  const optional: readonly string[] = input.slice(5);
  const checkpointRunId: string | undefined =
    optional[0] === "--from-backend-start" ? optional[1] : undefined;
  const stopAfter: "backend-start" | undefined =
    optional[0] === "--stop-after-backend-start" ||
    optional[1] === "--stop-after-backend-start"
      ? "backend-start"
      : undefined;
  const runId: string | undefined =
    optional[0] !== "--from-backend-start" &&
    optional[0] !== "--stop-after-backend-start"
      ? optional[0]
      : undefined;
  const validOptional: boolean =
    optional.length === 0 ||
    (optional.length === 1 &&
      (runId !== undefined || stopAfter !== undefined)) ||
    (optional.length === 2 &&
      ((checkpointRunId !== undefined && stopAfter === undefined) ||
        (runId !== undefined && stopAfter !== undefined)));
  if (!validOptional)
    throw new Error("Invalid backend-start checkpoint invocation.");
  if (
    runId !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      runId,
    )
  )
    throw new Error(`Invalid benchmark run ID: ${runId}.`);
  if (
    checkpointRunId !== undefined &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      checkpointRunId,
    )
  )
    throw new Error(`Invalid checkpoint source run ID: ${checkpointRunId}.`);
  return {
    engine,
    subject,
    arm,
    model,
    effort,
    runId,
    checkpointRunId,
    stopAfter,
  };
};

export const readEvidenceBenchmarkRevision = (repository: string): string => {
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

export const assertEvidenceBenchmarkRecoveryRevision = (
  repository: string,
  benchmarkRevision: string,
  runnerRevision: string,
): void => {
  if (benchmarkRevision === runnerRevision) return;
  const ancestry = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", benchmarkRevision, runnerRevision],
    {
      cwd: repository,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  if (ancestry.status !== 0)
    throw new Error(
      "Recovery runner revision must descend from the frozen benchmark revision.",
    );
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

export const evidenceBenchmarkRecordPaths = (
  root: string,
): IEvidenceBenchmarkRecordPaths => ({
  root: path.resolve(root),
  workspace: path.join(path.resolve(root), "workspace"),
  state: path.join(path.resolve(root), "state.json"),
  events: path.join(path.resolve(root), "events.jsonl"),
  raw: path.join(path.resolve(root), "raw.log"),
});

export const sameEvidenceBenchmarkRecordPaths = (
  left: IEvidenceBenchmarkRecordPaths,
  right: IEvidenceBenchmarkRecordPaths,
): boolean => {
  const normalize = (value: string): string => {
    const resolved: string = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return (
    normalize(left.root) === normalize(right.root) &&
    normalize(left.workspace) === normalize(right.workspace) &&
    normalize(left.state) === normalize(right.state) &&
    normalize(left.events) === normalize(right.events) &&
    normalize(left.raw) === normalize(right.raw)
  );
};

const assertDirectory = (location: string): void => {
  if (!fs.lstatSync(location).isDirectory())
    throw new Error(`Benchmark path is not a directory: ${location}.`);
};

const assertRegularFile = (location: string): void => {
  if (!fs.lstatSync(location).isFile())
    throw new Error(`Benchmark path is not a regular file: ${location}.`);
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

if (
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
)
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
