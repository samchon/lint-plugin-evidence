import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkEngine } from "./EvidenceBenchmarkEngine.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProject } from "./EvidenceBenchmarkProject.ts";
import { EvidenceBenchmarkState } from "./EvidenceBenchmarkState.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";

/** Applies one recorded common patch to every paused engine and arm in a wave. */
export namespace EvidenceBenchmarkRepair {
  const ARMS = ["evidence", "plain"] as const;
  const MAXIMUM_PATCH_BYTES = 1024 * 1024;

  /** Common workspace repair selected by one run identity and subject set. */
  export interface IRequest {
    /** Existing run whose paused cells receive the patch. */
    runId: string;

    /** Patch below benchmark/.work/repairs, relative to the repository. */
    patch: string;

    /** Subjects whose complete engine and arm matrix receives the same bytes. */
    projects: IEvidenceBenchmarkMaterialization.Project[];
  }

  /** Retained identity and scope of one successfully applied repair. */
  export interface IResult {
    /** Whether the patch preceded every model turn or qualified an active run. */
    kind: "frozen-input-hotfix" | "operator-intervention";

    /** SHA-256 identity of the exact applied patch bytes. */
    patchSha256: string;

    /** Engine, subject, and arm cells changed atomically as one action. */
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
    const targets: string[] = validatePatch(content);
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
      EvidenceBenchmarkEngine.MATRIX.flatMap((engine) =>
        ARMS.map((arm) =>
          readCell(
            resultsRoot,
            request.runId,
            engine.engine,
            project,
            arm,
            patchSha256,
            bytes,
          ),
        ),
      ),
    );
    const sourceCommits: Set<string> = new Set(
      cells.map((cell) => cell.sourceCommit),
    );
    if (sourceCommits.size !== 1)
      throw new Error(
        `Repair cells do not share one frozen source commit: ${[...sourceCommits].join(", ")}.`,
      );
    const retained: IRetainedRecord[] = cells
      .map((cell) => cell.retained)
      .filter((record): record is IRetainedRecord => record !== undefined);
    if (retained.length !== 0 && retained.length !== cells.length)
      throw new Error(
        `Repair patch ${patchSha256} has an incomplete intervention ledger.`,
      );
    if (
      retained.some(
        (record) =>
          record.kind !== retained[0]!.kind ||
          JSON.stringify(record.scope) !== JSON.stringify(retained[0]!.scope),
      )
    )
      throw new Error(
        `Repair patch ${patchSha256} has inconsistent retained records.`,
      );
    const scope: string[] = cells.map((cell) => cell.label);
    if (
      retained.length !== 0 &&
      JSON.stringify(retained[0]!.scope) !== JSON.stringify(scope)
    )
      throw new Error(
        `Repair patch ${patchSha256} has a retained scope mismatch.`,
      );
    const kind: IResult["kind"] =
      retained[0]?.kind ??
      (cells.every((cell) => cell.turns === 0)
        ? "frozen-input-hotfix"
        : "operator-intervention");

    const prepared: IPreparedCell[] = [];
    for (const cell of cells)
      prepared.push(
        await prepareCell(cell, patch, content, targets, retained.length !== 0),
      );

    const changed: IPreparedCell[] = [];
    const records: string[] = [];
    try {
      for (const cell of prepared) {
        changed.push(cell);
        await commitRepair(cell, patch, patchSha256, targets);
      }
      const elapsedMs: number =
        Number(process.hrtime.bigint() - started) / 1_000_000;
      if (retained.length === 0)
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
      const rollbackFailures: unknown[] = [];
      for (const record of records.reverse())
        try {
          fs.rmSync(record, { force: true });
        } catch (rollback) {
          rollbackFailures.push(rollback);
        }
      for (const cell of changed.reverse())
        try {
          await rollbackCell(cell, patch, targets);
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

  interface IRetainedRecord {
    kind: IResult["kind"];
    scope: string[];
  }

  interface ICell {
    label: string;
    root: string;
    workspace: string;
    sourceCommit: string;
    turns: number;
    retained?: IRetainedRecord;
  }

  interface IPreparedCell extends ICell {
    headReference: string;
    previousHead: string;
    patchPresent: boolean;
    patchApplied: boolean;
    indexTouched: boolean;
    committed: boolean;
    repairCommit?: string;
  }

  function readCell(
    resultsRoot: string,
    runId: string,
    engine: EvidenceBenchmarkEngine.Name,
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    patchSha256: string,
    patchBytes: Buffer,
  ): ICell {
    const root: string = path.resolve(
      resultsRoot,
      project,
      engine,
      arm,
      "runs",
      runId,
    );
    assertInside(resultsRoot, root, "repair cell");
    const state = EvidenceBenchmarkState.read<{
      project?: unknown;
      arm?: unknown;
      engine?: unknown;
      status?: unknown;
      sourceCommit?: unknown;
      turns?: unknown[];
    }>(root, "Repair state");
    if (
      state.project !== project ||
      state.arm !== arm ||
      state.engine !== engine ||
      state.status !== "interrupted" ||
      typeof state.sourceCommit !== "string" ||
      !Array.isArray(state.turns)
    )
      throw new Error(
        `Repair requires paused ${engine}/${project}/${arm} state for run ${runId}.`,
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
        `Repair requires the resumable Git workspace for ${engine}/${project}/${arm}.`,
      );
    const directory: string = path.join(root, "interventions");
    const patchPath: string = path.join(directory, `${patchSha256}.patch`);
    const recordPath: string = path.join(directory, `${patchSha256}.json`);
    const patchExists: boolean = fs.existsSync(patchPath);
    const recordExists: boolean = fs.existsSync(recordPath);
    if (patchExists !== recordExists)
      throw new Error(
        `Repair patch ${patchSha256} has no exact patch/record pair for ${engine}/${project}/${arm}.`,
      );
    let retained: IRetainedRecord | undefined;
    if (recordExists) {
      if (!fs.readFileSync(patchPath).equals(patchBytes))
        throw new Error(
          `Repair patch ${patchSha256} drifted for ${engine}/${project}/${arm}.`,
        );
      const value: unknown = JSON.parse(fs.readFileSync(recordPath, "utf8"));
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          `Repair patch ${patchSha256} has an invalid record for ${engine}/${project}/${arm}.`,
        );
      const record = value as Record<string, unknown>;
      const kind: unknown = record.kind;
      if (
        record.schemaVersion !== 1 ||
        (kind !== "frozen-input-hotfix" && kind !== "operator-intervention") ||
        record.patchSha256 !== patchSha256 ||
        record.sourceCommit !== state.sourceCommit ||
        !Array.isArray(record.scope) ||
        record.scope.some((entry) => typeof entry !== "string")
      )
        throw new Error(
          `Repair patch ${patchSha256} has an invalid record for ${engine}/${project}/${arm}.`,
        );
      retained = {
        kind,
        scope: record.scope as string[],
      };
    }
    return {
      label: `${engine}/${project}/${arm}`,
      root,
      workspace,
      sourceCommit: state.sourceCommit,
      turns: state.turns.length,
      retained,
    };
  }

  async function prepareCell(
    cell: ICell,
    patch: string,
    patchContent: string,
    targets: readonly string[],
    reconciling: boolean,
  ): Promise<IPreparedCell> {
    const status = await EvidenceBenchmarkProcess.run(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all", "--", ...targets],
      {
        cwd: cell.workspace,
        label: `${cell.label} repair target admission`,
      },
    );
    const actualDiff: string = (
      await EvidenceBenchmarkProcess.run(
        "git",
        [
          "diff",
          "--no-ext-diff",
          "--no-color",
          "--src-prefix=a/",
          "--dst-prefix=b/",
          "HEAD",
          "--",
          ...targets,
        ],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair target diff admission`,
        },
      )
    ).stdout;
    let patchPresent: boolean = false;
    if (status.stdout.length !== 0) {
      if (
        !reconciling ||
        normalizeDiff(actualDiff) !== normalizeDiff(patchContent)
      )
        throw new Error(
          `Repair targets contain work outside the common patch for ${cell.label}.`,
        );
      patchPresent = true;
    }
    const applicable = await EvidenceBenchmarkProcess.run(
      "git",
      ["apply", "--check", "--whitespace=error-all", patch],
      {
        cwd: cell.workspace,
        label: `${cell.label} repair application admission`,
        allowFailure: true,
      },
    );
    if (patchPresent ? applicable.status === 0 : applicable.status !== 0)
      throw new Error(
        `Repair patch state disagrees with the target diff for ${cell.label}.`,
      );
    if (!reconciling && patchPresent)
      throw new Error(`Repair targets are not clean for ${cell.label}.`);
    const previousHead: string = (
      await EvidenceBenchmarkProcess.run("git", ["rev-parse", "HEAD"], {
        cwd: cell.workspace,
        label: `${cell.label} repair parent identity`,
      })
    ).stdout.trim();
    const headReference: string = (
      await EvidenceBenchmarkProcess.run(
        "git",
        ["symbolic-ref", "--quiet", "HEAD"],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair branch identity`,
        },
      )
    ).stdout.trim();
    return {
      ...cell,
      headReference,
      previousHead,
      patchPresent,
      patchApplied: false,
      indexTouched: false,
      committed: false,
    };
  }

  async function commitRepair(
    cell: IPreparedCell,
    patch: string,
    patchSha256: string,
    targets: readonly string[],
  ): Promise<void> {
    const currentHead: string = (
      await EvidenceBenchmarkProcess.run("git", ["rev-parse", "HEAD"], {
        cwd: cell.workspace,
        label: `${cell.label} repair commit admission`,
      })
    ).stdout.trim();
    if (currentHead !== cell.previousHead)
      throw new Error(
        `Repair parent changed after admission for ${cell.label}.`,
      );
    if (!cell.patchPresent) {
      await EvidenceBenchmarkProcess.run(
        "git",
        ["apply", "--whitespace=error-all", patch],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair application`,
        },
      );
      cell.patchApplied = true;
    }
    await EvidenceBenchmarkProcess.run(
      "git",
      ["add", "--force", "--", ...targets],
      {
        cwd: cell.workspace,
        label: `${cell.label} repair target stage`,
      },
    );
    cell.indexTouched = true;
    const hooks: string = path.join(cell.root, "cache", "disabled-git-hooks");
    fs.mkdirSync(hooks, { recursive: true });
    await EvidenceBenchmarkProcess.run(
      "git",
      [
        "-c",
        "user.name=Evidence Benchmark",
        "-c",
        "user.email=evidence-benchmark@localhost",
        "-c",
        "commit.gpgSign=false",
        "-c",
        `core.hooksPath=${hooks}`,
        "commit",
        "--only",
        "--no-verify",
        "-m",
        `Apply recorded benchmark repair ${patchSha256}`,
        "--",
        ...targets,
      ],
      {
        cwd: cell.workspace,
        label: `${cell.label} repair commit`,
      },
    );
    cell.committed = true;
    cell.repairCommit = (
      await EvidenceBenchmarkProcess.run("git", ["rev-parse", "HEAD"], {
        cwd: cell.workspace,
        label: `${cell.label} repair commit identity`,
      })
    ).stdout.trim();
    const parent: string = (
      await EvidenceBenchmarkProcess.run(
        "git",
        ["rev-parse", `${cell.repairCommit}^`],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair commit parent`,
        },
      )
    ).stdout.trim();
    const changed: string[] = (
      await EvidenceBenchmarkProcess.run(
        "git",
        ["diff-tree", "--no-commit-id", "--name-only", "-r", cell.repairCommit],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair commit scope`,
        },
      )
    ).stdout
      .split(/\r?\n/)
      .filter((entry) => entry.length !== 0)
      .sort();
    if (
      parent !== cell.previousHead ||
      JSON.stringify(changed) !== JSON.stringify([...targets].sort())
    )
      throw new Error(
        `Repair commit changed content outside its admitted patch for ${cell.label}.`,
      );
  }

  async function rollbackCell(
    cell: IPreparedCell,
    patch: string,
    targets: readonly string[],
  ): Promise<void> {
    if (cell.committed)
      await EvidenceBenchmarkProcess.run(
        "git",
        [
          "update-ref",
          cell.headReference,
          cell.previousHead,
          cell.repairCommit!,
        ],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair commit rollback`,
        },
      );
    if (cell.indexTouched)
      await EvidenceBenchmarkProcess.run(
        "git",
        ["restore", "--staged", "--source=HEAD", "--", ...targets],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair index rollback`,
        },
      );
    if (cell.patchApplied)
      await EvidenceBenchmarkProcess.run(
        "git",
        ["apply", "--reverse", "--whitespace=error-all", patch],
        {
          cwd: cell.workspace,
          label: `${cell.label} repair content rollback`,
        },
      );
  }

  function normalizeDiff(content: string): string {
    return `${content
      .replaceAll("\r\n", "\n")
      .split("\n")
      .filter((line) => !line.startsWith("index "))
      .join("\n")
      .trimEnd()}\n`;
  }

  function validatePatch(content: string): string[] {
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
    return [...new Set(newHeaders.map((header) => header.slice(2)))];
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
