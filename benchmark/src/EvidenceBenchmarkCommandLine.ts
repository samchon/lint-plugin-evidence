import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";

/** Prepares and launches retained Codex benchmark waves from one clean revision. */
export namespace EvidenceBenchmarkCommandLine {
  const MODEL = "gpt-5.6-luna";
  const ARMS = ["evidence", "plain"] as const;

  interface ITurn {
    name: "instruction" | "goal" | "review" | "verification";
    elapsedMs: number;
    status: number | null;
    stdout: string;
    stderr: string;
  }

  interface IState {
    schemaVersion: 2;
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    model: typeof MODEL;
    sourceCommit: string;
    runtime: EvidenceBenchmarkRuntime.IAssignment;
    elapsedMs: number;
    status: "running" | "completed";
    threadId?: string;
    turns: ITurn[];
  }

  interface IOptions {
    projects: IEvidenceBenchmarkMaterialization.Project[];
    portBase: number;
  }

  /**
   * Validates arguments or launches every requested subject and arm
   * concurrently.
   */
  export async function main(
    repository: string,
    arguments_: string[],
  ): Promise<void> {
    const options: IOptions = parseOptions(arguments_);
    const cells = options.projects.flatMap((project) =>
      ARMS.map((arm) => ({
        project,
        arm,
        runtime: EvidenceBenchmarkRuntime.assign(
          project,
          arm,
          options.portBase,
        ),
      })),
    );
    if (arguments_[0] === "plan") {
      console.log(
        JSON.stringify(
          { model: MODEL, portBase: options.portBase, cells },
          null,
          2,
        ),
      );
      return;
    }
    if (arguments_[0] !== "start")
      throw new Error(
        "Usage: benchmark <plan|start> [--port-base <number>] <todo|reddit|shopping|erp>...",
      );
    const sourceCommit: string = (
      await EvidenceBenchmarkProcess.run("git", ["rev-parse", "HEAD"], {
        cwd: repository,
        label: "benchmark source revision",
      })
    ).stdout.trim();
    const status: string = (
      await EvidenceBenchmarkProcess.run(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=all"],
        { cwd: repository, label: "benchmark source cleanliness" },
      )
    ).stdout.trim();
    if (status.length !== 0)
      throw new Error(
        `Benchmark start requires a clean source tree:\n${status}`,
      );
    await EvidenceBenchmarkRuntime.assertAvailable(
      cells.map((cell) => cell.runtime),
    );
    const runId: string = `${sourceCommit.slice(0, 12)}-${crypto.randomUUID()}`;
    const artifact: IEvidenceBenchmarkPackageArtifact =
      await EvidenceBenchmarkPackage.prepare({
        repository,
        expectedCommit: sourceCommit,
        output: path.join(repository, "benchmark", ".work", runId, "artifact"),
      });
    const results = await Promise.allSettled(
      cells.map((cell) =>
        runCell({ repository, sourceCommit, runId, artifact, ...cell }),
      ),
    );
    const failures: unknown[] = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length !== 0)
      throw new AggregateError(
        failures,
        `${failures.length} benchmark cells failed.`,
      );
  }

  async function runCell(props: {
    repository: string;
    sourceCommit: string;
    runId: string;
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    runtime: EvidenceBenchmarkRuntime.IAssignment;
    artifact: IEvidenceBenchmarkPackageArtifact;
  }): Promise<void> {
    const started: bigint = process.hrtime.bigint();
    const resultsRoot: string = path.resolve(
      props.repository,
      "benchmark",
      "result",
    );
    const root: string = path.resolve(
      resultsRoot,
      props.project,
      props.arm,
      "runs",
      props.runId,
    );
    const relativeRoot: string = path.relative(resultsRoot, root);
    if (
      relativeRoot === "" ||
      relativeRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeRoot)
    )
      throw new Error(`Benchmark cell root escaped the result tree: ${root}.`);
    let workspace: string | undefined;
    try {
      const materialization = await EvidenceBenchmarkMaterializer.materialize({
        repository: props.repository,
        output: root,
        project: props.project,
        arm: props.arm,
        variables: variables(props.project, props.arm),
        artifact: props.artifact,
      });
      workspace = materialization.workspace;
      EvidenceBenchmarkRuntime.apply(
        materialization.environment,
        props.runtime,
      );
      await EvidenceBenchmarkSetup.prepare({
        materialization,
        arm: props.arm,
      });
      await initializeWorkspace(
        materialization.workspace,
        materialization.environment,
      );
      const logs: string = path.join(root, "logs");
      fs.mkdirSync(logs, { recursive: false });
      const state: IState = {
        schemaVersion: 2,
        project: props.project,
        arm: props.arm,
        model: MODEL,
        sourceCommit: props.sourceCommit,
        runtime: props.runtime,
        elapsedMs: elapsed(started),
        status: "running",
        turns: [],
      };
      writeState(root, state);
      const prompts: ReadonlyArray<{
        name: ITurn["name"];
        relative: string;
      }> = [
        { name: "instruction", relative: "instruction.md" },
        { name: "goal", relative: "goal.md" },
        { name: "review", relative: "review.md" },
        {
          name: "verification",
          relative: path.join(props.arm, "final.md"),
        },
      ];
      for (const entry of prompts) {
        const prompt: string = fs.readFileSync(
          path.join(props.repository, "benchmark", "prompts", entry.relative),
          "utf8",
        );
        const turn: ITurn & { threadId?: string } = await runTurn({
          workspace: materialization.workspace,
          environment: materialization.environment,
          logs,
          name: entry.name,
          prompt,
          threadId: state.threadId,
        });
        state.threadId ??= turn.threadId;
        state.turns.push(turn);
        state.elapsedMs = elapsed(started);
        writeState(root, state);
        if (turn.status !== 0)
          throw new Error(
            `${entry.name} turn exited with status ${String(turn.status)}.`,
          );
      }
      state.status = "completed";
      state.elapsedMs = elapsed(started);
      fs.rmSync(path.join(materialization.workspace, ".git"), {
        recursive: true,
        force: true,
      });
      writeState(root, state);
      promoteWorkspace(
        props.repository,
        props.project,
        props.arm,
        materialization.workspace,
      );
    } catch (error) {
      fs.rmSync(root, { recursive: true, force: true });
      throw error;
    } finally {
      if (workspace !== undefined)
        fs.rmSync(path.join(workspace, ".git"), {
          recursive: true,
          force: true,
        });
    }
  }

  async function runTurn(props: {
    workspace: string;
    environment: NodeJS.ProcessEnv;
    logs: string;
    name: ITurn["name"];
    prompt: string;
    threadId?: string;
  }): Promise<ITurn & { threadId?: string }> {
    const stdoutPath: string = path.join(
      props.logs,
      `${props.name}.stdout.jsonl`,
    );
    const stderrPath: string = path.join(
      props.logs,
      `${props.name}.stderr.log`,
    );
    const stdout = fs.createWriteStream(stdoutPath, { flags: "wx" });
    const stderr = fs.createWriteStream(stderrPath, { flags: "wx" });
    const common: string[] = [
      "--json",
      "--model",
      MODEL,
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
    ];
    const args: string[] =
      props.threadId === undefined
        ? ["exec", ...common, "--cd", props.workspace, "-"]
        : ["exec", "resume", ...common, props.threadId, "-"];
    const started: bigint = process.hrtime.bigint();
    const executable: { command: string; prefix: string[] } = codexExecutable();
    const child = spawn(executable.command, [...executable.prefix, ...args], {
      cwd: props.workspace,
      env: props.environment,
      shell: false,
      windowsHide: true,
      stdio: "pipe",
    });
    let threadId: string | undefined;
    let remainder: string = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.write(chunk);
      remainder += chunk.toString("utf8");
      const lines: string[] = remainder.split(/\r?\n/);
      remainder = lines.pop() ?? "";
      for (const line of lines)
        try {
          const event: unknown = JSON.parse(line);
          if (
            typeof event === "object" &&
            event !== null &&
            "thread_id" in event &&
            typeof event.thread_id === "string"
          )
            threadId = event.thread_id;
        } catch {}
    });
    child.stderr.pipe(stderr);
    child.stdin.end(props.prompt, "utf8");
    const status: number | null = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    await Promise.all([
      new Promise<void>((resolve) => stdout.end(resolve)),
      new Promise<void>((resolve) => stderr.end(resolve)),
    ]);
    return {
      name: props.name,
      elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      status,
      stdout: path.posix.join("logs", path.basename(stdoutPath)),
      stderr: path.posix.join("logs", path.basename(stderrPath)),
      threadId,
    };
  }

  function parseOptions(arguments_: string[]): IOptions {
    const values: string[] = arguments_.slice(1);
    const projects: string[] = [];
    let portBase: number = EvidenceBenchmarkRuntime.DEFAULT_PORT_BASE;
    let hasPortBase: boolean = false;
    for (let index: number = 0; index < values.length; index++) {
      const value: string = values[index]!;
      if (value === "--") continue;
      else if (value === "--port-base") {
        if (hasPortBase)
          throw new Error("Benchmark port base may be specified only once.");
        const input: string | undefined = values[++index];
        if (input === undefined)
          throw new Error("--port-base requires an integer value.");
        portBase = parsePortBase(input);
        hasPortBase = true;
      } else if (value.startsWith("--port-base=")) {
        if (hasPortBase)
          throw new Error("Benchmark port base may be specified only once.");
        portBase = parsePortBase(value.slice("--port-base=".length));
        hasPortBase = true;
      } else if (value.startsWith("--"))
        throw new Error(`Unknown benchmark option: ${value}.`);
      else projects.push(value);
    }
    if (projects.length === 0)
      throw new Error("At least one benchmark project is required.");
    const allowed = new Set(["todo", "reddit", "shopping", "erp"]);
    for (const value of projects)
      if (!allowed.has(value))
        throw new Error(`Unknown benchmark project: ${value}.`);
    EvidenceBenchmarkRuntime.assign("erp", "plain", portBase);
    return {
      projects: [
        ...new Set(projects),
      ] as IEvidenceBenchmarkMaterialization.Project[],
      portBase,
    };
  }

  function parsePortBase(input: string): number {
    if (!/^\d+$/.test(input))
      throw new Error(`Benchmark port base must be an integer: ${input}.`);
    return Number(input);
  }

  function variables(
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IEvidenceBenchmarkMaterialization.IVariables {
    const stem: string = `${project}-${arm}`;
    return {
      name: `evidence-benchmark-${stem}`,
      apiPackageName: `@evidence-benchmark/${stem}-api`,
      backendPackageName: `@evidence-benchmark/${stem}-backend`,
      frontendPackageName: `@evidence-benchmark/${stem}-frontend`,
    };
  }

  function writeState(root: string, state: IState): void {
    const target: string = path.join(root, "run.json");
    const temporary: string = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.rmSync(target, { force: true });
    fs.renameSync(temporary, target);
  }

  function promoteWorkspace(
    repository: string,
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    workspace: string,
  ): void {
    const parent: string = path.join(
      repository,
      "benchmark",
      "result",
      project,
      arm,
    );
    const target: string = path.join(parent, "workspace");
    const temporary: string = path.join(
      parent,
      `.workspace.${process.pid}.tmp`,
    );
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.cpSync(workspace, temporary, {
      recursive: true,
      filter: (source) =>
        ![".git", "node_modules"].includes(path.basename(source)),
    });
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(temporary, target);
  }

  function elapsed(started: bigint): number {
    return Number(process.hrtime.bigint() - started) / 1_000_000;
  }

  function codexExecutable(): { command: string; prefix: string[] } {
    if (process.platform !== "win32") return { command: "codex", prefix: [] };
    const appData: string | undefined = process.env.APPDATA;
    if (appData === undefined)
      throw new Error("Codex launch on Windows requires APPDATA.");
    const entrypoint: string = path.join(
      appData,
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
    if (!fs.existsSync(entrypoint))
      throw new Error(`Codex CLI entrypoint was not found: ${entrypoint}.`);
    return { command: process.execPath, prefix: [entrypoint] };
  }

  async function initializeWorkspace(
    workspace: string,
    environment: NodeJS.ProcessEnv,
  ): Promise<void> {
    await EvidenceBenchmarkProcess.run("git", ["init", "-b", "benchmark"], {
      cwd: workspace,
      env: environment,
      label: "benchmark workspace git initialization",
    });
    await EvidenceBenchmarkProcess.run("git", ["add", "-A"], {
      cwd: workspace,
      env: environment,
      label: "benchmark workspace baseline stage",
    });
    await EvidenceBenchmarkProcess.run(
      "git",
      [
        "-c",
        "user.name=Evidence Benchmark",
        "-c",
        "user.email=evidence-benchmark@localhost",
        "commit",
        "-m",
        "Freeze benchmark starting point",
      ],
      {
        cwd: workspace,
        env: environment,
        label: "benchmark workspace baseline commit",
      },
    );
  }
}
