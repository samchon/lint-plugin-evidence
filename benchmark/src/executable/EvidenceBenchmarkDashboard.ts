import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import typia from "typia";

interface IDashboardCell {
  engine: "codex" | "claude-code";
  subject: string;
  arm: "plain" | "evidence";
  runId: string;
  model: string;
}

interface IDashboardProcess {
  elapsedMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

interface IDashboardInstruction {
  index: number;
  name: string;
}

interface IDashboardState {
  status: "ready" | "running" | "interrupted" | "completed";
  nextInstructionIndex: number;
  threadTokenUsage?: {
    totalTokens: number;
  };
  tokenUsage?: {
    totalTokens: number;
  };
  goals?: IDashboardInstruction[];
  instructions?: IDashboardInstruction[];
  processes: IDashboardProcess[];
}

interface IDashboardStateFile {
  cell: IDashboardCell;
  records: {
    workspace: string;
    events: string;
  };
  state: IDashboardState;
}

interface IDashboardRun {
  file: IDashboardStateFile;
  launchedAt: number;
}

interface IWorktreeDelta {
  files: number;
  additions: number;
  deletions: number;
}

interface IOutputEvent {
  processIndex: number;
  elapsedMs: number;
}

const main = (): void => {
  const repository: string = path.resolve(import.meta.dirname, "../../..");
  const runs: IDashboardRun[] = scanRuns(
    path.join(repository, "benchmark", "result"),
  );
  const latest: IDashboardRun[] = selectLatestRuns(runs);
  const models: Map<string, IDashboardRun[]> = Map.groupBy(
    latest,
    (run) => run.file.cell.model,
  );
  const ordered: [string, IDashboardRun[]][] = [...models].sort(
    ([leftModel, leftRuns], [rightModel, rightRuns]) =>
      Math.min(...leftRuns.map((run) => run.launchedAt)) -
        Math.min(...rightRuns.map((run) => run.launchedAt)) ||
      leftModel.localeCompare(rightModel),
  );
  process.stdout.write(
    `${ordered.map(([model, group]) => renderModel(model, group)).join("\n\n")}\n`,
  );
};

const scanRuns = (result: string): IDashboardRun[] => {
  if (!fs.existsSync(result)) return [];
  const runs: IDashboardRun[] = [];
  for (const subject of directories(result))
    for (const engine of directories(path.join(result, subject)))
      for (const arm of directories(path.join(result, subject, engine))) {
        const root: string = path.join(result, subject, engine, arm, "runs");
        if (!fs.existsSync(root)) continue;
        for (const runId of directories(root)) {
          const statePath: string = path.join(root, runId, "state.json");
          if (!fs.existsSync(statePath)) continue;
          const file: IDashboardStateFile = typia.assert<IDashboardStateFile>(
            JSON.parse(fs.readFileSync(statePath, "utf8")),
          );
          runs.push({
            file,
            launchedAt: readLaunchTime(file.records.events, statePath),
          });
        }
      }
  return runs;
};

const directories = (root: string): string[] =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const readLaunchTime = (events: string, state: string): number => {
  const first: unknown = readFirstJson(events);
  if (isRecord(first) && typeof first.recordedAt === "string") {
    const parsed: number = Date.parse(first.recordedAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fs.statSync(state).birthtimeMs;
};

const readFirstJson = (file: string): unknown => {
  if (!fs.existsSync(file)) return undefined;
  const descriptor: number = fs.openSync(file, "r");
  try {
    const buffer: Buffer = Buffer.alloc(64 * 1024);
    const length: number = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    const line: string = buffer
      .subarray(0, length)
      .toString("utf8")
      .split("\n")[0]!;
    return line.length === 0 ? undefined : JSON.parse(line);
  } finally {
    fs.closeSync(descriptor);
  }
};

const selectLatestRuns = (runs: IDashboardRun[]): IDashboardRun[] => {
  const latest: Map<string, IDashboardRun> = new Map();
  for (const run of runs) {
    const cell: IDashboardCell = run.file.cell;
    const key: string = [cell.model, cell.engine, cell.subject, cell.arm].join(
      "\u0000",
    );
    const previous: IDashboardRun | undefined = latest.get(key);
    if (previous === undefined || previous.launchedAt < run.launchedAt)
      latest.set(key, run);
  }
  return [...latest.values()];
};

const renderModel = (model: string, runs: IDashboardRun[]): string => {
  const rows: string[] = runs
    .sort(compareRuns)
    .map((run) => renderRun(run.file));
  return [
    `## ${displayModel(model)}`,
    "",
    "| Project | Mode | Stage | Progress | Cost | Time |",
    "| ------- | ---- | ----- | -------- | ---- | ---- |",
    ...rows,
  ].join("\n");
};

const compareRuns = (left: IDashboardRun, right: IDashboardRun): number => {
  const subjects: readonly string[] = ["todo", "reddit", "shopping", "erp"];
  const leftSubject: number = subjects.indexOf(left.file.cell.subject);
  const rightSubject: number = subjects.indexOf(right.file.cell.subject);
  return (
    (leftSubject === -1 ? Number.MAX_SAFE_INTEGER : leftSubject) -
      (rightSubject === -1 ? Number.MAX_SAFE_INTEGER : rightSubject) ||
    left.file.cell.subject.localeCompare(right.file.cell.subject) ||
    Number(left.file.cell.arm === "evidence") -
      Number(right.file.cell.arm === "evidence")
  );
};

const renderRun = (file: IDashboardStateFile): string => {
  const delta: IWorktreeDelta = inspectWorktree(file.records.workspace);
  return `| ${[
    title(file.cell.subject),
    title(file.cell.arm),
    stage(file.state),
    formatDelta(delta),
    formatCost(file.state),
    formatTime(elapsed(file)),
  ].join(" | ")} |`;
};

const stage = (state: IDashboardState): string => {
  const records: IDashboardInstruction[] =
    state.goals ?? state.instructions ?? [];
  const instruction: IDashboardInstruction | undefined =
    records.find((record) => record.index === state.nextInstructionIndex) ??
    records.at(-1);
  return instruction === undefined
    ? state.status
    : `\`${instruction.name}\` · ${state.status}`;
};

const inspectWorktree = (workspace: string): IWorktreeDelta => {
  const baseline: string = git(workspace, [
    "rev-list",
    "--max-parents=0",
    "HEAD",
  ]).trim();
  if (baseline.length === 0)
    throw new Error(`Benchmark workspace has no baseline commit: ${workspace}`);
  const gitDirectory: string = path.resolve(
    workspace,
    git(workspace, ["rev-parse", "--git-dir"]).trim(),
  );
  const temporary: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-dashboard-"),
  );
  const index: string = path.join(temporary, "index");
  try {
    fs.copyFileSync(path.join(gitDirectory, "index"), index);
    const environment: NodeJS.ProcessEnv = { GIT_INDEX_FILE: index };
    git(workspace, ["add", "--intent-to-add", "--", "."], environment);
    const numstat: string = git(
      workspace,
      ["diff", "--numstat", baseline, "--"],
      environment,
    );
    let files: number = 0;
    let additions: number = 0;
    let deletions: number = 0;
    for (const line of numstat.split(/\r?\n/u)) {
      if (line.length === 0) continue;
      const [added, deleted] = line.split("\t", 3);
      if (added === undefined || deleted === undefined)
        throw new Error(`Invalid git numstat line: ${line}`);
      ++files;
      if (added !== "-") {
        additions += Number(added);
        deletions += Number(deleted);
      }
    }
    return { files, additions, deletions };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
};

const git = (
  workspace: string,
  args: string[],
  environment: NodeJS.ProcessEnv = {},
): string => {
  const result = spawnSync(
    "git",
    [
      "-c",
      "core.quotepath=false",
      "--no-optional-locks",
      "-C",
      workspace,
      ...args,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", ...environment },
      windowsHide: true,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Git dashboard query failed (${args.join(" ")}): ${result.stderr}`,
    );
  return result.stdout;
};

const formatDelta = (delta: IWorktreeDelta): string =>
  `${delta.files} files · +${compact(delta.additions)}/−${compact(delta.deletions)} LOC`;

const formatCost = (state: IDashboardState): string => {
  const total: number =
    state.threadTokenUsage?.totalTokens ?? state.tokenUsage?.totalTokens ?? 0;
  return `${Math.round(total / 1_000_000)}M`;
};

const elapsed = (file: IDashboardStateFile): number => {
  const unresolved: Set<number> = new Set(
    file.state.processes.flatMap((process, index) =>
      process.exitCode === null && process.signal === null ? [index] : [],
    ),
  );
  const observed: Map<number, IOutputEvent> = readLastOutputEvents(
    file.records.events,
    unresolved,
  );
  return file.state.processes.reduce(
    (sum, process, index) =>
      sum +
      (process.exitCode !== null || process.signal !== null
        ? process.elapsedMs
        : Math.max(process.elapsedMs, observed.get(index)?.elapsedMs ?? 0)),
    0,
  );
};

const readLastOutputEvents = (
  file: string,
  targets: ReadonlySet<number>,
): Map<number, IOutputEvent> => {
  const found: Map<number, IOutputEvent> = new Map();
  if (!fs.existsSync(file) || targets.size === 0) return found;
  const descriptor: number = fs.openSync(file, "r");
  try {
    const size: number = fs.fstatSync(descriptor).size;
    let position: number = size;
    let suffix: string = "";
    while (position > 0) {
      const length: number = Math.min(64 * 1024, position);
      position -= length;
      const buffer: Buffer = Buffer.alloc(length);
      fs.readSync(descriptor, buffer, 0, length, position);
      const lines: string[] = `${buffer.toString("utf8")}${suffix}`.split("\n");
      const firstComplete: number = position === 0 ? 0 : 1;
      for (let i: number = lines.length - 1; i >= firstComplete; --i) {
        const candidate: string = lines[i]!.trim();
        if (candidate.length === 0) continue;
        try {
          const value: unknown = JSON.parse(candidate);
          if (
            isOutputEvent(value) &&
            targets.has(value.processIndex) &&
            !found.has(value.processIndex)
          )
            found.set(value.processIndex, value);
          if (found.size === targets.size) return found;
        } catch {
          // The writer may have an incomplete final line; use the last complete event.
        }
      }
      suffix = lines[0]!;
    }
    return found;
  } finally {
    fs.closeSync(descriptor);
  }
};

const isOutputEvent = (value: unknown): value is IOutputEvent =>
  isRecord(value) &&
  typeof value.processIndex === "number" &&
  typeof value.elapsedMs === "number";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const formatTime = (elapsedMs: number): string => {
  const minutes: number = Math.round(elapsedMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};

const compact = (value: number): string => {
  if (value < 1_000) return String(value);
  if (value < 1_000_000)
    return `${stripTrailingZero((value / 1_000).toFixed(1))}k`;
  return `${stripTrailingZero((value / 1_000_000).toFixed(1))}M`;
};

const stripTrailingZero = (value: string): string => value.replace(/\.0$/u, "");

const title = (value: string): string =>
  `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const displayModel = (model: string): string =>
  model
    .replace(/^gpt-/iu, "GPT-")
    .replace(/-([^-]+)$/u, (_, family: string) => `-${title(family)}`);

main();
