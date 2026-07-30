import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProject } from "./EvidenceBenchmarkProject.ts";
import { EvidenceBenchmarkState } from "./EvidenceBenchmarkState.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Applies one recorded common patch to every paused arm in a benchmark wave. */
export namespace EvidenceBenchmarkRepair {
  const ARMS = ["evidence", "plain"] as const;
  const MAXIMUM_PATCH_BYTES = 1024 * 1024;

  /** Common workspace repair selected by one run identity and subject set. */
  export interface IRequest {
    /** Existing run whose paused cells receive the patch. */
    runId: string;

    /** Patch below benchmark/.work/repairs, relative to the repository. */
    patch: string;

    /** Subjects whose evidence and plain workspaces receive the same bytes. */
    projects: IEvidenceBenchmarkMaterialization.Project[];
  }

  /** Retained identity and scope of one successfully applied repair. */
  export interface IResult {
    /** Whether the patch preceded every model turn or qualified an active run. */
    kind: "frozen-input-hotfix" | "operator-intervention";

    /** SHA-256 identity of the exact applied patch bytes. */
    patchSha256: string;

    /** Subject and arm cells changed atomically as one operator action. */
    cells: string[];

    /** Harness time excluded from measured coding-agent wall time. */
    elapsedMs: number;
  }

  /** Parses one common-patch repair request. */
  export function parse(arguments_: readonly string[]): IRequest {
    const values: string[] = arguments_.filter((value) => value !== "--");
    const positional: string[] = [];
    let patch: string | undefined;
    for (let index: number = 0; index < values.length; index++) {
      const value: string = values[index]!;
      if (value === "--patch") {
        if (patch !== undefined)
          throw new Error("Repair patch may be specified only once.");
        patch = values[++index];
        if (patch === undefined)
          throw new Error(
            "--patch requires a file below benchmark/.work/repairs.",
          );
      } else if (value.startsWith("--patch=")) {
        if (patch !== undefined)
          throw new Error("Repair patch may be specified only once.");
        patch = value.slice("--patch=".length);
      } else if (value.startsWith("--"))
        throw new Error(`Unknown repair option: ${value}.`);
      else positional.push(value);
    }
    if (patch === undefined)
      throw new Error(
        "Repair requires --patch benchmark/.work/repairs/<file>.patch.",
      );
    if (positional.length < 2)
      throw new Error(
        "Usage: benchmark repair --patch <file> <run-id> <project>...",
      );
    const [runId, ...projectInputs] = positional;
    if (
      runId === undefined ||
      !/^[0-9a-f]{12}-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        runId,
      )
    )
      throw new Error(`Invalid benchmark run ID: ${runId ?? ""}.`);
    return {
      runId,
      patch,
      projects: [...new Set(projectInputs.map(EvidenceBenchmarkProject.parse))],
    };
  }

  /**
   * Applies and records one patch only after every comparable cell passes
   * admission.
   */
  export async function apply(
    repository: string,
    request: IRequest,
  ): Promise<IResult> {
    const started: bigint = process.hrtime.bigint();
    const projects: IEvidenceBenchmarkMaterialization.Project[] = [
      ...new Set(request.projects.map(EvidenceBenchmarkProject.parse)),
    ];
    const repositoryRoot: string = path.resolve(repository);
    const repairRoot: string = path.resolve(
      repositoryRoot,
      "benchmark",
      ".work",
      "repairs",
    );
    const patch: string = path.resolve(repositoryRoot, request.patch);
    assertInside(repairRoot, patch, "repair patch");
    const patchStat: fs.Stats | undefined = fs.lstatSync(patch, {
      throwIfNoEntry: false,
    });
    if (!patchStat?.isFile() || patchStat.isSymbolicLink())
      throw new Error(`Repair patch was not found: ${patch}.`);
    assertInside(
      fs.realpathSync(repairRoot),
      fs.realpathSync(patch),
      "resolved repair patch",
    );
    if (patchStat.size === 0 || patchStat.size > MAXIMUM_PATCH_BYTES)
      throw new Error(
        `Repair patch must contain between 1 and ${MAXIMUM_PATCH_BYTES} bytes.`,
      );
    const bytes: Buffer = fs.readFileSync(patch);
    const content: string = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes,
    );
    validatePatch(content);
    const patchSha256: string = crypto
      .createHash("sha256")
      .update(bytes)
      .digest("hex");
    const resultsRoot: string = path.resolve(
      repositoryRoot,
      "benchmark",
      "result",
    );
    const cells: ICell[] = projects.flatMap((project) =>
      ARMS.map((arm) =>
        readCell(resultsRoot, request.runId, project, arm, patchSha256),
      ),
    );
    const sourceCommits: Set<string> = new Set(
      cells.map((cell) => cell.sourceCommit),
    );
    if (sourceCommits.size !== 1)
      throw new Error(
        `Repair cells do not share one frozen source commit: ${[...sourceCommits].join(", ")}.`,
      );
    const kind: IResult["kind"] = cells.every((cell) => cell.turns === 0)
      ? "frozen-input-hotfix"
      : "operator-intervention";
    for (const cell of cells)
      await EvidenceBenchmarkProcess.run(
        "git",
        ["apply", "--check", "--whitespace=error-all", patch],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair admission`,
        },
      );

    const applied: ICell[] = [];
    const records: string[] = [];
    try {
      for (const cell of cells) {
        await EvidenceBenchmarkProcess.run(
          "git",
          ["apply", "--whitespace=error-all", patch],
          { cwd: cell.workspace, label: `${cell.label} repair application` },
        );
        applied.push(cell);
      }
      const elapsedMs: number =
        Number(process.hrtime.bigint() - started) / 1_000_000;
      const scope: string[] = cells.map((cell) => cell.label);
      for (const cell of cells) {
        const directory: string = path.join(cell.root, "interventions");
        fs.mkdirSync(directory, { recursive: true });
        const patchTarget: string = path.join(
          directory,
          `${patchSha256}.patch`,
        );
        const recordTarget: string = path.join(
          directory,
          `${patchSha256}.json`,
        );
        fs.writeFileSync(patchTarget, bytes, { flag: "wx" });
        records.push(patchTarget);
        fs.writeFileSync(
          recordTarget,
          `${JSON.stringify(
            {
              schemaVersion: 1,
              kind,
              patchSha256,
              patch: path.posix.join("interventions", `${patchSha256}.patch`),
              scope,
              sourceCommit: cell.sourceCommit,
              elapsedMs,
              measurement:
                kind === "frozen-input-hotfix"
                  ? "clean"
                  : "qualified-by-recorded-operator-intervention",
            },
            null,
            2,
          )}\n`,
          { encoding: "utf8", flag: "wx" },
        );
        records.push(recordTarget);
      }
      return { kind, patchSha256, cells: scope, elapsedMs };
    } catch (error) {
      for (const record of records.reverse())
        fs.rmSync(record, { force: true });
      const rollbackFailures: unknown[] = [];
      for (const cell of applied.reverse())
        try {
          await EvidenceBenchmarkProcess.run(
            "git",
            ["apply", "--reverse", "--whitespace=error-all", patch],
            {
              cwd: cell.workspace,
              label: `${cell.label} repair rollback`,
            },
          );
        } catch (rollback) {
          rollbackFailures.push(rollback);
        }
      if (rollbackFailures.length !== 0)
        throw new AggregateError(
          [error, ...rollbackFailures],
          "Repair failed and one or more already changed cells could not be rolled back.",
        );
      throw error;
    }
  }

  interface ICell {
    label: string;
    root: string;
    workspace: string;
    sourceCommit: string;
    turns: number;
  }

  function readCell(
    resultsRoot: string,
    runId: string,
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    patchSha256: string,
  ): ICell {
    const root: string = path.resolve(resultsRoot, project, arm, "runs", runId);
    assertInside(resultsRoot, root, "repair cell");
    const state = EvidenceBenchmarkState.read<{
      project?: unknown;
      arm?: unknown;
      status?: unknown;
      sourceCommit?: unknown;
      turns?: unknown[];
    }>(root, "Repair state");
    if (
      state.project !== project ||
      state.arm !== arm ||
      state.status !== "interrupted" ||
      typeof state.sourceCommit !== "string" ||
      !Array.isArray(state.turns)
    )
      throw new Error(
        `Repair requires paused ${project}/${arm} state for run ${runId}.`,
      );
    const workspace: string = path.join(root, "workspace");
    const workspaceStat: fs.Stats | undefined = fs.lstatSync(workspace, {
      throwIfNoEntry: false,
    });
    if (
      !workspaceStat?.isDirectory() ||
      workspaceStat.isSymbolicLink() ||
      !fs.existsSync(path.join(workspace, ".git"))
    )
      throw new Error(
        `Repair requires the resumable Git workspace for ${project}/${arm}.`,
      );
    if (fs.existsSync(path.join(root, "interventions", `${patchSha256}.json`)))
      throw new Error(
        `Repair patch ${patchSha256} was already applied to ${project}/${arm}.`,
      );
    return {
      label: `${project}/${arm}`,
      root,
      workspace,
      sourceCommit: state.sourceCommit,
      turns: state.turns.length,
    };
  }

  function validatePatch(content: string): void {
    if (
      /\b(?:new|old) file mode 120000\b/.test(content) ||
      /^(?:old mode|new mode) /m.test(content) ||
      /^GIT binary patch$/m.test(content) ||
      /^(?:rename|copy) (?:from|to) /m.test(content) ||
      /^deleted file mode /m.test(content) ||
      /^\+\+\+ \/dev\/null$/m.test(content)
    )
      throw new Error(
        "Repair patches may add or modify regular text files only.",
      );
    const lines: string[] = content.split(/\r?\n/);
    const oldHeaders: string[] = lines
      .filter((line) => line.startsWith("--- "))
      .map((line) => line.slice(4));
    const newHeaders: string[] = lines
      .filter((line) => line.startsWith("+++ "))
      .map((line) => line.slice(4));
    if (newHeaders.length === 0)
      throw new Error("Repair patch contains no workspace file targets.");
    if (oldHeaders.length !== newHeaders.length)
      throw new Error("Repair patch has unmatched file headers.");
    for (let index: number = 0; index < newHeaders.length; index++) {
      const oldHeader: string = oldHeaders[index]!;
      const newHeader: string = newHeaders[index]!;
      if (!newHeader.startsWith("b/"))
        throw new Error(
          `Repair patch has a non-workspace target: ${newHeader}.`,
        );
      const target: string = newHeader.slice(2);
      const segments: string[] = target.split("/");
      if (
        oldHeader !== "/dev/null" &&
        (!oldHeader.startsWith("a/") || oldHeader.slice(2) !== target)
      )
        throw new Error(
          `Repair patch may not move a file: ${oldHeader} -> ${newHeader}.`,
        );
      const normalized: string = target.normalize("NFC");
      if (
        target !== normalized ||
        target.includes("\\") ||
        path.posix.isAbsolute(target) ||
        segments.some(
          (part) =>
            part === "" ||
            part === "." ||
            part === ".." ||
            part === ".git" ||
            part === "node_modules" ||
            part === ".benchmark-deps",
        ) ||
        target === "docs/analysis" ||
        target.startsWith("docs/analysis/")
      )
        throw new Error(`Repair patch has a forbidden target: ${target}.`);
    }
  }

  function assertInside(parent: string, target: string, label: string): void {
    const relative: string = path.relative(parent, target);
    if (
      relative === "" ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      throw new Error(`${label} escaped its parent: ${target}.`);
  }
}
