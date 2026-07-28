import { spawn, spawnSync } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import * as ts from "typescript-api";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import type { IEvidenceBenchmarkQualityGate } from "../structures/IEvidenceBenchmarkQualityGate.ts";
import { EvidenceBenchmarkArtifactInventory } from "./EvidenceBenchmarkArtifactInventory.ts";

/** Plans and executes sampled syntax-aware mutations with crash recovery. */
export namespace EvidenceBenchmarkMutation {
  /** Direct, shell-free mutation-test invocation. */
  export interface ICommand {
    /** Direct executable path or name. */
    command: string;
    /** Exact argument boundaries. */
    arguments: readonly string[];
    /** Child working directory. */
    cwd: string;
    /** Effective environment, defaulting to the harness environment. */
    env?: NodeJS.ProcessEnv;
    /** Hard process-tree timeout in milliseconds. */
    timeoutMs: number;
  }

  interface IJournal {
    schemaVersion: 1;
    mutationId: string;
    relative: string;
    sourceSha256: string;
    backup: string;
  }

  const OPERATORS: ReadonlyMap<ts.SyntaxKind, string> = new Map([
    [ts.SyntaxKind.EqualsEqualsEqualsToken, "!=="],
    [ts.SyntaxKind.ExclamationEqualsEqualsToken, "==="],
    [ts.SyntaxKind.EqualsEqualsToken, "!="],
    [ts.SyntaxKind.ExclamationEqualsToken, "=="],
    [ts.SyntaxKind.LessThanToken, ">="],
    [ts.SyntaxKind.LessThanEqualsToken, ">"],
    [ts.SyntaxKind.GreaterThanToken, "<="],
    [ts.SyntaxKind.GreaterThanEqualsToken, "<"],
  ]);

  /** Freezes a stable sample from all supported production-source mutations. */
  export function plan(input: {
    workspace: string;
    seed: string;
    sampleSize: number;
  }): IEvidenceBenchmarkQualityGate.IMutationPlan {
    if (!Number.isSafeInteger(input.sampleSize) || input.sampleSize < 1)
      throw new Error("Mutation sample size must be a positive safe integer.");
    if (input.seed.trim().length === 0)
      throw new Error("Mutation seed must not be blank.");
    const authored: Map<string, Uint8Array> =
      EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace);
    const candidates: IEvidenceBenchmarkQualityGate.IMutation[] = [];
    for (const [relative, bytes] of authored) {
      if (
        !/(?:^|\/)src\/.*\.(?:[cm]?ts|tsx)$/u.test(relative) ||
        /\.d\.[cm]?ts$/u.test(relative)
      )
        continue;
      candidates.push(...mutations(relative, bytes));
    }
    if (candidates.length === 0)
      throw new Error(
        "No supported mutation candidates exist in product source.",
      );
    const selected: IEvidenceBenchmarkQualityGate.IMutation[] = [...candidates]
      .sort((left, right) =>
        EvidenceBenchmarkArtifactInventory.compareUtf8(
          EvidenceBenchmarkHash.bytes(`${input.seed}\0${left.id}`),
          EvidenceBenchmarkHash.bytes(`${input.seed}\0${right.id}`),
        ),
      )
      .slice(0, input.sampleSize);
    const core: Omit<
      IEvidenceBenchmarkQualityGate.IMutationPlan,
      "planSha256"
    > = {
      schemaVersion: 1,
      seed: input.seed,
      workspaceSourceTreeSha256:
        EvidenceBenchmarkArtifactInventory.treeSha256(authored),
      candidateCount: candidates.length,
      requestedSampleSize: input.sampleSize,
      mutations: selected,
    };
    return {
      ...core,
      planSha256: EvidenceBenchmarkHash.object(core),
    };
  }

  /** Executes each mutation independently and verifies byte-exact restoration. */
  export async function execute(input: {
    workspace: string;
    output: string;
    plan: IEvidenceBenchmarkQualityGate.IMutationPlan;
    test: ICommand;
  }): Promise<IEvidenceBenchmarkQualityGate.IMutationResult[]> {
    validatePlan(input.workspace, input.plan);
    fs.mkdirSync(input.output, { recursive: true });
    recover(input.workspace, input.output);
    const results: IEvidenceBenchmarkQualityGate.IMutationResult[] = [];
    for (const mutation of input.plan.mutations)
      results.push(
        await executeOne(input.workspace, input.output, mutation, input.test),
      );
    const current: string = EvidenceBenchmarkArtifactInventory.treeSha256(
      EvidenceBenchmarkArtifactInventory.authoredFiles(input.workspace),
    );
    if (current !== input.plan.workspaceSourceTreeSha256)
      throw new Error(
        "Mutation run changed the authored workspace after restoration.",
      );
    return results;
  }

  /** Restores a source file left behind by a terminated mutation process. */
  export function recover(workspace: string, output: string): boolean {
    const journalPath: string = path.join(output, "mutation-recovery.json");
    if (!fs.existsSync(journalPath)) return false;
    const journal: IJournal = JSON.parse(
      fs.readFileSync(journalPath, "utf8"),
    ) as IJournal;
    if (
      journal.schemaVersion !== 1 ||
      typeof journal.relative !== "string" ||
      typeof journal.backup !== "string" ||
      typeof journal.sourceSha256 !== "string"
    )
      throw new Error("Mutation recovery journal is malformed.");
    const source: string = confined(workspace, journal.relative);
    const backup: string = confined(output, journal.backup);
    const bytes: Buffer = fs.readFileSync(backup);
    if (EvidenceBenchmarkHash.bytes(bytes) !== journal.sourceSha256)
      throw new Error(
        "Mutation recovery backup hash does not match its journal.",
      );
    fs.writeFileSync(source, bytes);
    if (EvidenceBenchmarkHash.file(source) !== journal.sourceSha256)
      throw new Error(
        "Mutation recovery could not restore exact source bytes.",
      );
    fs.rmSync(backup);
    fs.rmSync(journalPath);
    return true;
  }

  function mutations(
    relative: string,
    bytes: Uint8Array,
  ): IEvidenceBenchmarkQualityGate.IMutation[] {
    const content: string = Buffer.from(bytes).toString("utf8");
    const kind: ts.ScriptKind = relative.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;
    const source: ts.SourceFile = ts.createSourceFile(
      relative,
      content,
      ts.ScriptTarget.Latest,
      true,
      kind,
    );
    if (
      (
        source as ts.SourceFile & {
          parseDiagnostics: readonly ts.Diagnostic[];
        }
      ).parseDiagnostics.length !== 0
    )
      throw new Error(
        `Cannot mutation-plan syntactically invalid file: ${relative}.`,
      );
    const sourceSha256: string = EvidenceBenchmarkHash.bytes(bytes);
    const output: IEvidenceBenchmarkQualityGate.IMutation[] = [];
    const append = (
      node: ts.Node,
      mutationKind: IEvidenceBenchmarkQualityGate.IMutation["kind"],
      after: string,
    ): void => {
      const start: number = node.getStart(source);
      const end: number = node.getEnd();
      const before: string = content.slice(start, end);
      const identity: string = `${relative}\0${mutationKind}\0${start}\0${end}\0${before}\0${after}`;
      output.push({
        id: `MUT-${EvidenceBenchmarkHash.bytes(identity).slice(0, 20)}`,
        path: relative,
        kind: mutationKind,
        start,
        end,
        before,
        after,
        sourceSha256,
      });
    };
    const visit = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.TrueKeyword)
        append(node, "boolean_literal", "false");
      else if (node.kind === ts.SyntaxKind.FalseKeyword)
        append(node, "boolean_literal", "true");
      else if (ts.isBinaryExpression(node)) {
        const replacement: string | undefined = OPERATORS.get(
          node.operatorToken.kind,
        );
        if (replacement !== undefined)
          append(node.operatorToken, "binary_operator", replacement);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return output;
  }

  function validatePlan(
    workspace: string,
    plan: IEvidenceBenchmarkQualityGate.IMutationPlan,
  ): void {
    const { planSha256: _ignored, ...core } = plan;
    if (EvidenceBenchmarkHash.object(core) !== plan.planSha256)
      throw new Error("Mutation plan hash does not match its content.");
    const authored: Map<string, Uint8Array> =
      EvidenceBenchmarkArtifactInventory.authoredFiles(workspace);
    if (
      EvidenceBenchmarkArtifactInventory.treeSha256(authored) !==
      plan.workspaceSourceTreeSha256
    )
      throw new Error("Mutation plan workspace tree has drifted.");
    const ids: Set<string> = new Set();
    for (const mutation of plan.mutations) {
      if (ids.has(mutation.id))
        throw new Error(`Mutation plan repeats ID ${mutation.id}.`);
      ids.add(mutation.id);
      const bytes: Uint8Array | undefined = authored.get(mutation.path);
      if (bytes === undefined)
        throw new Error(`Mutation source is absent: ${mutation.path}.`);
      if (EvidenceBenchmarkHash.bytes(bytes) !== mutation.sourceSha256)
        throw new Error(`Mutation source hash drifted: ${mutation.path}.`);
      const content: string = Buffer.from(bytes).toString("utf8");
      if (content.slice(mutation.start, mutation.end) !== mutation.before)
        throw new Error(`Mutation source span drifted: ${mutation.id}.`);
    }
  }

  async function executeOne(
    workspace: string,
    output: string,
    mutation: IEvidenceBenchmarkQualityGate.IMutation,
    command: ICommand,
  ): Promise<IEvidenceBenchmarkQualityGate.IMutationResult> {
    const source: string = confined(workspace, mutation.path);
    const original: Buffer = fs.readFileSync(source);
    const content: string = original.toString("utf8");
    if (
      EvidenceBenchmarkHash.bytes(original) !== mutation.sourceSha256 ||
      content.slice(mutation.start, mutation.end) !== mutation.before
    )
      throw new Error(
        `Mutation input drifted before execution: ${mutation.id}.`,
      );
    const mutated: string =
      content.slice(0, mutation.start) +
      mutation.after +
      content.slice(mutation.end);
    assertParses(mutation.path, mutated);
    const backupRelative: string = `backups/${mutation.id}.source`;
    const backup: string = confined(output, backupRelative);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.writeFileSync(backup, original, { flag: "wx" });
    writeJournal(output, {
      schemaVersion: 1,
      mutationId: mutation.id,
      relative: mutation.path,
      sourceSha256: mutation.sourceSha256,
      backup: backupRelative,
    });
    fs.writeFileSync(source, mutated, "utf8");
    let execution: IExecution;
    try {
      execution = await run(command);
    } finally {
      recover(workspace, output);
    }
    const restored: boolean =
      EvidenceBenchmarkHash.file(source) === mutation.sourceSha256;
    const logRoot: string = path.join(output, "logs");
    fs.mkdirSync(logRoot, { recursive: true });
    fs.writeFileSync(
      path.join(logRoot, `${mutation.id}.stdout.log`),
      execution.stdout,
      "utf8",
    );
    fs.writeFileSync(
      path.join(logRoot, `${mutation.id}.stderr.log`),
      execution.stderr,
      "utf8",
    );
    return {
      id: mutation.id,
      status:
        execution.error === true
          ? "infrastructure_failure"
          : execution.timedOut
            ? "timed_out"
            : execution.status === 0
              ? "survived"
              : "killed",
      commandStatus: execution.status,
      elapsedMs: execution.elapsedMs,
      stdoutSha256: EvidenceBenchmarkHash.bytes(execution.stdout),
      stderrSha256: EvidenceBenchmarkHash.bytes(execution.stderr),
      restored,
    };
  }

  interface IExecution {
    status: number | null;
    stdout: string;
    stderr: string;
    elapsedMs: number;
    timedOut: boolean;
    error: boolean;
  }

  async function run(command: ICommand): Promise<IExecution> {
    if (!Number.isSafeInteger(command.timeoutMs) || command.timeoutMs < 1)
      throw new Error("Mutation test timeout must be a positive safe integer.");
    const started: bigint = process.hrtime.bigint();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command.command, command.arguments, {
        cwd: command.cwd,
        env: command.env ?? process.env,
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      });
    } catch (error) {
      return {
        status: null,
        stdout: "",
        stderr: String(error),
        elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
        timedOut: false,
        error: true,
      };
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    let timedOut: boolean = false;
    const timer: NodeJS.Timeout = setTimeout(() => {
      timedOut = true;
      terminate(child);
    }, command.timeoutMs);
    const completed: { status: number | null; error: boolean } =
      await new Promise((resolve) => {
        child.once("error", (error) =>
          resolve({
            status: null,
            error: true,
          }),
        );
        child.once("close", (status) =>
          resolve({
            status,
            error: false,
          }),
        );
      });
    clearTimeout(timer);
    return {
      status: completed.status,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
      elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      timedOut,
      error: completed.error,
    };
  }

  function terminate(child: ChildProcessWithoutNullStreams): void {
    if (child.pid === undefined) return;
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill("SIGKILL");
  }

  function assertParses(relative: string, content: string): void {
    const source: ts.SourceFile = ts.createSourceFile(
      relative,
      content,
      ts.ScriptTarget.Latest,
      true,
      relative.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    if (
      (
        source as ts.SourceFile & {
          parseDiagnostics: readonly ts.Diagnostic[];
        }
      ).parseDiagnostics.length !== 0
    )
      throw new Error(`Mutation creates invalid syntax: ${relative}.`);
  }

  function writeJournal(output: string, journal: IJournal): void {
    const finalPath: string = path.join(output, "mutation-recovery.json");
    const stage: string = `${finalPath}.stage`;
    fs.writeFileSync(stage, `${JSON.stringify(journal, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    fs.renameSync(stage, finalPath);
  }

  function confined(root: string, relative: string): string {
    if (
      relative.length === 0 ||
      relative.includes("\\") ||
      path.posix.isAbsolute(relative) ||
      relative.split("/").some((part) => part === "" || part === "..")
    )
      throw new Error(
        `Harness path is not a confined POSIX path: ${relative}.`,
      );
    const resolvedRoot: string = path.resolve(root);
    const resolved: string = path.resolve(resolvedRoot, ...relative.split("/"));
    const relation: string = path.relative(resolvedRoot, resolved);
    if (relation === ".." || relation.startsWith(`..${path.sep}`))
      throw new Error(`Harness path escapes its root: ${relative}.`);
    return resolved;
  }
}
