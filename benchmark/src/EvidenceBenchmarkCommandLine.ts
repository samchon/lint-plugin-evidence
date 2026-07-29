import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkPublication } from "./EvidenceBenchmarkPublication.ts";
import { EvidenceBenchmarkRepair } from "./EvidenceBenchmarkRepair.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";

/** Prepares and launches retained Codex benchmark waves from one clean revision. */
export namespace EvidenceBenchmarkCommandLine {
  const ENGINE = "codex" as const;
  const MODEL = "gpt-5.6-terra";
  const EFFORT = "high" as const;
  const WORKFLOW = "backend-first-gated-v2" as const;
  const ARMS = ["evidence", "plain"] as const;

  type TurnName =
    | "skills-contract"
    | "backend-start"
    | "backend-review"
    | "backend-final"
    | "frontend-start"
    | "frontend-review"
    | "frontend-final"
    | "overall-review"
    | "overall-final";

  interface ITurn {
    name: TurnName;
    elapsedMs: number;
    status: number | null;
    stdout: string;
    stderr: string;
    invocation: string[];
    accepted?: boolean;
    lintRestorationSha256?: string;
  }

  interface IInstruction {
    name: TurnName;
    relative: string;
    content: string;
  }

  interface IState {
    schemaVersion: 6;
    workflow: typeof WORKFLOW;
    instructionsTreeSha256: string;
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    engine: typeof ENGINE;
    model: typeof MODEL;
    effort: typeof EFFORT;
    cliVersion: string;
    sourceCommit: string;
    lintBaselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[];
    runtime: EvidenceBenchmarkRuntime.IAssignment;
    elapsedMs: number;
    status: "running" | "interrupted" | "completed";
    completedWorkspaceTreeSha256?: string;
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
    if (arguments_[0] === "resume") {
      await resumeCell(
        repository,
        arguments_.slice(1).filter((value) => value !== "--"),
      );
      return;
    }
    if (arguments_[0] === "repair") {
      console.log(
        JSON.stringify(
          await EvidenceBenchmarkRepair.apply(
            repository,
            EvidenceBenchmarkRepair.parse(arguments_.slice(1)),
          ),
          null,
          2,
        ),
      );
      return;
    }
    if (arguments_[0] === "publish") {
      console.log(
        JSON.stringify(
          await EvidenceBenchmarkPublication.publish(
            repository,
            EvidenceBenchmarkPublication.parse(arguments_.slice(1)),
          ),
          null,
          2,
        ),
      );
      return;
    }
    const options: IOptions = parseOptions(arguments_);
    const cells = options.projects.flatMap((project) =>
      ARMS.map((arm) => ({
        project,
        arm,
        instructions: readInstructions(repository, arm),
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
          {
            engine: ENGINE,
            model: MODEL,
            effort: EFFORT,
            workflow: WORKFLOW,
            portBase: options.portBase,
            cells: cells.map(({ instructions, ...cell }) => ({
              ...cell,
              instructions: instructions.map(
                ({ content: _content, ...entry }) => entry,
              ),
            })),
          },
          null,
          2,
        ),
      );
      return;
    }
    if (arguments_[0] !== "start")
      throw new Error(
        "Usage: benchmark <plan|start> [--port-base <number>] <project>... | benchmark resume <project> <arm> <run-id> | benchmark repair --patch <file> <run-id> <project>... | benchmark publish --repository <owner/name> --checkout <local-path> --public <project> <arm> <run-id>",
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

  async function resumeCell(
    repository: string,
    arguments_: readonly string[],
  ): Promise<void> {
    if (arguments_.length !== 3)
      throw new Error(
        "Usage: benchmark resume <todo|reddit|shopping|erp> <evidence|plain> <run-id>",
      );
    const [projectInput, armInput, runId] = arguments_;
    const projects = new Set(["todo", "reddit", "shopping", "erp"]);
    if (!projects.has(projectInput!))
      throw new Error(`Unknown benchmark project: ${projectInput}.`);
    if (!ARMS.includes(armInput as (typeof ARMS)[number]))
      throw new Error(`Unknown benchmark arm: ${armInput}.`);
    const project = projectInput as IEvidenceBenchmarkMaterialization.Project;
    const arm = armInput as IEvidenceBenchmarkMaterialization.Arm;
    const resultsRoot: string = path.resolve(repository, "benchmark", "result");
    const root: string = path.resolve(
      resultsRoot,
      project,
      arm,
      "runs",
      runId!,
    );
    assertInside(resultsRoot, root, "resume root");
    const statePath: string = path.join(root, "run.json");
    if (!fs.existsSync(statePath))
      throw new Error(`Resumable state was not found: ${statePath}.`);
    const state: IState = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (
      state.schemaVersion !== 6 ||
      state.workflow !== WORKFLOW ||
      state.engine !== ENGINE ||
      state.model !== MODEL ||
      state.effort !== EFFORT ||
      state.cliVersion !== codexVersion() ||
      !Array.isArray(state.lintBaselines)
    )
      throw new Error(
        `Run ${runId} does not use the resumable ${WORKFLOW} state schema.`,
      );
    if (state.project !== project || state.arm !== arm)
      throw new Error(`Run ${runId} does not belong to ${project}/${arm}.`);
    if (state.status !== "interrupted")
      throw new Error(
        state.status === "completed"
          ? `Run ${runId} is already complete.`
          : `Run ${runId} is still running; refusing a parallel resume controller.`,
      );

    const workspace: string = path.join(root, "workspace");
    const logs: string = path.join(root, "logs");
    if (!fs.existsSync(workspace) || !fs.existsSync(logs))
      throw new Error(`Run ${runId} has no resumable workspace and logs.`);
    assertStateBaselines(root, state);
    const instructions: IInstruction[] = readFrozenInstructions(root, arm);
    const environment: NodeJS.ProcessEnv = resumeEnvironment(root);
    EvidenceBenchmarkRuntime.apply(environment, state.runtime);
    state.threadId ??= recoverThreadId(logs);
    if (
      state.threadId === undefined &&
      state.turns.some((turn) => turn.status === 0)
    )
      throw new Error(
        `Run ${runId} completed a turn but has no recoverable thread ID.`,
      );
    const baseElapsedMs: number = state.elapsedMs;
    const resumed: bigint = process.hrtime.bigint();
    let phase: string = "resume-admission";

    try {
      await EvidenceBenchmarkRuntime.assertAvailable([state.runtime]);
      for (const entry of instructions) {
        const accepted: ITurn | undefined = state.turns.findLast(
          (turn) =>
            turn.name === entry.name &&
            turn.status === 0 &&
            turn.accepted === true,
        );
        if (accepted !== undefined) {
          let restoration: string | undefined;
          try {
            restoration = verifyLintRestoration({
              workspace,
              arm,
              name: entry.name,
              baselines: state.lintBaselines,
            });
          } catch {}
          if (restoration === accepted.lintRestorationSha256) continue;
          accepted.accepted = false;
          delete accepted.lintRestorationSha256;
          writeState(root, state);
        }
        state.status = "running";
        state.elapsedMs = baseElapsedMs + elapsed(resumed);
        writeState(root, state);
        phase = entry.name;
        const turn: ITurn & { threadId?: string } = await runTurn({
          workspace,
          environment,
          logs,
          name: entry.name,
          prompt: entry.content,
          threadId: state.threadId,
        });
        state.threadId ??= turn.threadId;
        turn.accepted = false;
        state.turns.push(turn);
        state.elapsedMs = baseElapsedMs + elapsed(resumed);
        writeState(root, state);
        if (turn.status !== 0) {
          state.status = "interrupted";
          writeState(root, state);
          throw new Error(
            `${entry.name} resume attempt exited with status ${String(turn.status)}.`,
          );
        }
        turn.lintRestorationSha256 = verifyLintRestoration({
          workspace,
          arm,
          name: entry.name,
          baselines: state.lintBaselines,
        });
        turn.accepted = true;
        writeState(root, state);
      }
      state.elapsedMs = baseElapsedMs + elapsed(resumed);
      state.completedWorkspaceTreeSha256 =
        EvidenceBenchmarkPublication.workspaceSha256(workspace);
      promoteWorkspace(repository, project, arm, workspace);
      state.status = "completed";
      writeState(root, state);
    } catch (error) {
      state.status = "interrupted";
      state.elapsedMs = baseElapsedMs + elapsed(resumed);
      writeState(root, state);
      recordFailure({
        repository,
        runId: runId!,
        root,
        project,
        arm,
        phase,
        elapsedMs: state.elapsedMs,
        error,
        cleanup: "retained-for-resume",
      });
      throw error;
    }
  }

  async function runCell(props: {
    repository: string;
    sourceCommit: string;
    runId: string;
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    runtime: EvidenceBenchmarkRuntime.IAssignment;
    instructions: readonly IInstruction[];
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
    let state: IState | undefined;
    let phase: string = "setup";
    try {
      const materialization = await EvidenceBenchmarkMaterializer.materialize({
        repository: props.repository,
        output: root,
        project: props.project,
        arm: props.arm,
        variables: variables(props.project, props.arm),
        artifact: props.artifact,
      });
      EvidenceBenchmarkRuntime.apply(
        materialization.environment,
        props.runtime,
      );
      EvidenceBenchmarkRuntime.persist(
        materialization.workspace,
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
      state = {
        schemaVersion: 6,
        workflow: WORKFLOW,
        instructionsTreeSha256: freezeInstructions(root, props.instructions),
        project: props.project,
        arm: props.arm,
        engine: ENGINE,
        model: MODEL,
        effort: EFFORT,
        cliVersion: codexVersion(),
        sourceCommit: props.sourceCommit,
        lintBaselines: materialization.lintBaselines,
        runtime: props.runtime,
        elapsedMs: elapsed(started),
        status: "running",
        turns: [],
      };
      writeState(root, state);
      for (const entry of props.instructions) {
        phase = entry.name;
        const turn: ITurn & { threadId?: string } = await runTurn({
          workspace: materialization.workspace,
          environment: materialization.environment,
          logs,
          name: entry.name,
          prompt: entry.content,
          threadId: state.threadId,
        });
        state.threadId ??= turn.threadId;
        turn.accepted = false;
        state.turns.push(turn);
        state.elapsedMs = elapsed(started);
        writeState(root, state);
        if (turn.status !== 0)
          throw new Error(
            `${entry.name} turn exited with status ${String(turn.status)}.`,
          );
        turn.lintRestorationSha256 = verifyLintRestoration({
          workspace: materialization.workspace,
          arm: props.arm,
          name: entry.name,
          baselines: state.lintBaselines,
        });
        turn.accepted = true;
        writeState(root, state);
      }
      state.elapsedMs = elapsed(started);
      state.completedWorkspaceTreeSha256 =
        EvidenceBenchmarkPublication.workspaceSha256(materialization.workspace);
      promoteWorkspace(
        props.repository,
        props.project,
        props.arm,
        materialization.workspace,
      );
      state.status = "completed";
      writeState(root, state);
    } catch (error) {
      const elapsedMs: number = elapsed(started);
      if (state === undefined) {
        recordFailure({
          repository: props.repository,
          runId: props.runId,
          root,
          project: props.project,
          arm: props.arm,
          phase: "setup",
          elapsedMs,
          error,
          cleanup: "cell-removed",
        });
        fs.rmSync(root, { recursive: true, force: true });
      } else {
        state.status = "interrupted";
        state.elapsedMs = elapsedMs;
        writeState(root, state);
        recordFailure({
          repository: props.repository,
          runId: props.runId,
          root,
          project: props.project,
          arm: props.arm,
          phase,
          elapsedMs,
          error,
          cleanup: "retained-for-resume",
        });
      }
      throw error;
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
    const stem: string = logStem(props.logs, props.name);
    const stdoutPath: string = path.join(props.logs, `${stem}.stdout.jsonl`);
    const stderrPath: string = path.join(props.logs, `${stem}.stderr.log`);
    const stdout = fs.createWriteStream(stdoutPath, { flags: "wx" });
    const stderr = fs.createWriteStream(stderrPath, { flags: "wx" });
    const common: string[] = [
      "--json",
      "--enable",
      "goals",
      "--model",
      MODEL,
      "--config",
      `model_reasoning_effort=${EFFORT}`,
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
      "--config",
      "shell_environment_policy.inherit=all",
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
    let status: number | null;
    try {
      status = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
    } finally {
      await Promise.all([
        new Promise<void>((resolve) => stdout.end(resolve)),
        new Promise<void>((resolve) => stderr.end(resolve)),
      ]);
    }
    return {
      name: props.name,
      elapsedMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      status,
      stdout: path.posix.join("logs", path.basename(stdoutPath)),
      stderr: path.posix.join("logs", path.basename(stderrPath)),
      invocation: [executable.command, ...executable.prefix, ...args],
      threadId,
    };
  }

  function readInstructions(
    repository: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IInstruction[] {
    const entries: readonly Omit<IInstruction, "content">[] =
      instructionEntries(arm);
    const root: string = path.join(repository, "benchmark", "instructions");
    return entries.map((entry) => ({
      ...entry,
      content: fs.readFileSync(path.join(root, entry.relative), "utf8"),
    }));
  }

  function instructionEntries(
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): readonly Omit<IInstruction, "content">[] {
    return [
      { name: "skills-contract", relative: "skills-contract.md" },
      { name: "backend-start", relative: "backend/start.md" },
      { name: "backend-review", relative: "backend/review.md" },
      { name: "backend-final", relative: `backend/${arm}-final.md` },
      { name: "frontend-start", relative: "frontend/start.md" },
      { name: "frontend-review", relative: "frontend/review.md" },
      { name: "frontend-final", relative: `frontend/${arm}-final.md` },
      { name: "overall-review", relative: "overall/review.md" },
      { name: "overall-final", relative: `overall/${arm}-final.md` },
    ];
  }

  function freezeInstructions(
    root: string,
    instructions: readonly IInstruction[],
  ): string {
    const files: Map<string, Uint8Array> = new Map(
      instructions.map((entry) => [
        entry.relative,
        Buffer.from(entry.content, "utf8"),
      ]),
    );
    const destination: string = path.join(root, "inputs", "instructions");
    fs.mkdirSync(destination, { recursive: false });
    for (const [relative, content] of files) {
      const target: string = path.join(destination, ...relative.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, { flag: "wx" });
    }
    return EvidenceBenchmarkHash.tree(files);
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

  function verifyLintRestoration(props: {
    workspace: string;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    name: TurnName;
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[];
  }): string | undefined {
    if (props.arm !== "evidence") return undefined;
    const selected: readonly string[] | undefined =
      props.name === "backend-final"
        ? ["packages/api/lint.config.ts", "packages/backend/lint.config.ts"]
        : props.name === "frontend-final" || props.name === "overall-final"
          ? EvidenceBenchmarkLintBaseline.PATHS
          : undefined;
    if (selected === undefined) return undefined;
    return EvidenceBenchmarkLintBaseline.assertRestored(
      props.workspace,
      props.arm,
      props.baselines,
      selected,
    );
  }

  function assertStateBaselines(root: string, state: IState): void {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "materialization.json"), "utf8"),
    ) as Omit<IEvidenceBenchmarkMaterialization.IManifest, "schemaVersion"> & {
      schemaVersion: unknown;
    };
    if (
      manifest.schemaVersion !== 5 ||
      EvidenceBenchmarkHash.object(manifest.lintBaselines) !==
        EvidenceBenchmarkHash.object(state.lintBaselines)
    )
      throw new Error(
        `Run ${path.basename(root)} does not retain its materialized lint baselines.`,
      );
  }

  function writeState(root: string, state: IState): void {
    const target: string = path.join(root, "run.json");
    const temporary: string = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.rmSync(target, { force: true });
    fs.renameSync(temporary, target);
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

  function readFrozenInstructions(
    root: string,
    arm: IEvidenceBenchmarkMaterialization.Arm,
  ): IInstruction[] {
    const frozen: string = path.join(root, "inputs", "instructions");
    const entries: IInstruction[] = instructionEntries(arm).map((entry) => ({
      ...entry,
      content: fs.readFileSync(
        path.join(frozen, ...entry.relative.split("/")),
        "utf8",
      ),
    }));
    const actual: string = EvidenceBenchmarkHash.tree(
      new Map(
        entries.map((entry) => [
          entry.relative,
          Buffer.from(entry.content, "utf8"),
        ]),
      ),
    );
    const state: IState = JSON.parse(
      fs.readFileSync(path.join(root, "run.json"), "utf8"),
    );
    if (actual !== state.instructionsTreeSha256)
      throw new Error(`Frozen instruction tree drifted for ${root}.`);
    return entries;
  }

  function resumeEnvironment(root: string): NodeJS.ProcessEnv {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "materialization.json"), "utf8"),
    ) as IEvidenceBenchmarkMaterialization.IManifest;
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      npm_config_store_dir: manifest.caches.pnpm,
      TTSC_CACHE_DIR: manifest.caches.ttsc,
      TTSC_GO_CACHE_DIR: manifest.caches.go,
      GOCACHE: manifest.caches.go,
      GOTMPDIR: path.join(root, "cache", "go-tmp"),
      PLAYWRIGHT_BROWSERS_PATH: manifest.caches.playwright,
    };
    EvidenceBenchmarkProcess.pinEnvironment(
      environment,
      manifest.caches.toolchain,
    );
    return environment;
  }

  function recoverThreadId(logs: string): string | undefined {
    for (const file of fs
      .readdirSync(logs)
      .filter((entry) => entry.endsWith(".stdout.jsonl"))
      .sort()) {
      const lines: string[] = fs
        .readFileSync(path.join(logs, file), "utf8")
        .split(/\r?\n/);
      for (const line of lines)
        try {
          const event = JSON.parse(line) as {
            type?: unknown;
            thread_id?: unknown;
          };
          if (
            event.type === "thread.started" &&
            typeof event.thread_id === "string"
          )
            return event.thread_id;
        } catch {}
    }
    return undefined;
  }

  function logStem(logs: string, name: TurnName): string {
    for (let attempt: number = 1; ; attempt++) {
      const stem: string = attempt === 1 ? name : `${name}.attempt-${attempt}`;
      if (
        !fs.existsSync(path.join(logs, `${stem}.stdout.jsonl`)) &&
        !fs.existsSync(path.join(logs, `${stem}.stderr.log`))
      )
        return stem;
    }
  }

  function recordFailure(props: {
    repository: string;
    runId: string;
    root: string;
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    phase: string;
    elapsedMs: number;
    error: unknown;
    cleanup: "cell-removed" | "retained-for-resume";
  }): void {
    const failures: string = path.join(
      props.repository,
      "benchmark",
      ".work",
      props.runId,
      "failures",
    );
    fs.mkdirSync(failures, { recursive: true });
    const attempts: number = fs
      .readdirSync(failures)
      .filter((file) =>
        file.startsWith(`${props.project}-${props.arm}-attempt-`),
      ).length;
    const error =
      props.error instanceof Error
        ? {
            name: props.error.name,
            message: props.error.message,
            stack: props.error.stack,
            cause: String(props.error.cause ?? ""),
          }
        : { name: "Unknown", message: String(props.error) };
    const logs: string = path.join(props.root, "logs");
    const tails: Record<string, string> = {};
    if (fs.existsSync(logs))
      for (const file of fs.readdirSync(logs).sort()) {
        const location: string = path.join(logs, file);
        if (!fs.statSync(location).isFile()) continue;
        tails[file] = readTail(location, 16_384);
      }
    const statePath: string = path.join(props.root, "run.json");
    const state: unknown = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, "utf8"))
      : undefined;
    const target: string = path.join(
      failures,
      `${props.project}-${props.arm}-attempt-${attempts + 1}.json`,
    );
    fs.writeFileSync(
      target,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          project: props.project,
          arm: props.arm,
          phase: props.phase,
          elapsedMs: props.elapsedMs,
          cleanup: props.cleanup,
          error,
          state,
          logs: tails,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    console.error(
      `Benchmark ${props.project}/${props.arm} failed during ${props.phase}; report: ${target}`,
    );
  }

  function readTail(location: string, maximumBytes: number): string {
    const size: number = fs.statSync(location).size;
    const length: number = Math.min(size, maximumBytes);
    const buffer: Buffer = Buffer.alloc(length);
    const descriptor: number = fs.openSync(location, "r");
    try {
      fs.readSync(descriptor, buffer, 0, length, size - length);
    } finally {
      fs.closeSync(descriptor);
    }
    return buffer.toString("utf8");
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
    const backup: string = path.join(
      parent,
      `.workspace.${process.pid}.backup`,
    );
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(backup, { recursive: true, force: true });
    fs.cpSync(workspace, temporary, {
      recursive: true,
      filter: (source) =>
        ![".git", "node_modules"].includes(path.basename(source)),
    });
    if (fs.existsSync(target)) fs.renameSync(target, backup);
    try {
      fs.renameSync(temporary, target);
      fs.rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      fs.rmSync(target, { recursive: true, force: true });
      if (fs.existsSync(backup)) fs.renameSync(backup, target);
      fs.rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
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

  function codexVersion(): string {
    const executable: { command: string; prefix: string[] } = codexExecutable();
    const result = spawnSync(
      executable.command,
      [...executable.prefix, "--version"],
      {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
      },
    );
    if (result.status !== 0)
      throw new Error(
        `Unable to read Codex CLI version: ${(result.stderr ?? "").trim()}`,
      );
    const version: string = (result.stdout ?? "").trim();
    if (version.length === 0)
      throw new Error("Codex CLI returned an empty version.");
    return version;
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
