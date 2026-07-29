import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProject } from "./EvidenceBenchmarkProject.ts";
import { EvidenceBenchmarkPublication } from "./EvidenceBenchmarkPublication.ts";
import { EvidenceBenchmarkRepair } from "./EvidenceBenchmarkRepair.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import { EvidenceBenchmarkSandbox } from "./EvidenceBenchmarkSandbox.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import { EvidenceBenchmarkTurnLedger } from "./EvidenceBenchmarkTurnLedger.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";

/** Prepares and launches retained Codex benchmark waves from one clean revision. */
export namespace EvidenceBenchmarkCommandLine {
  const ENGINE = "codex" as const;
  const MODEL = "gpt-5.6-terra";
  const EFFORT = "high" as const;
  const WORKFLOW = "backend-first-gated-v2" as const;
  const ARMS = ["evidence", "plain"] as const;

  type TurnName = EvidenceBenchmarkTurnLedger.Name;

  interface ITurn {
    name: TurnName;
    elapsedMs: number;
    status: number | null;
    stdout: string;
    stderr: string;
    invocation: string[];
    accepted: boolean;
    threadId?: string;
    modelPid?: number;
    workspaceRestorationSha256?: string;
    lintRestorationSha256?: string;
    installationReproductionSha256?: string;
  }

  interface IInstruction {
    name: TurnName;
    relative: string;
    content: string;
  }

  interface IInstructionSet {
    entries: readonly IInstruction[];
    sha256: string;
  }

  interface IState {
    schemaVersion: 9;
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
    controllerPid: number;
    initialWorkspaceTreeSha256: string;
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
    const options: IOptions = parseOptions(repository, arguments_);
    const instructionSets: Readonly<
      Record<IEvidenceBenchmarkMaterialization.Arm, IInstructionSet>
    > = readInstructionSets(repository);
    const cells = options.projects.flatMap((project, projectIndex) =>
      ARMS.map((arm, armIndex) => ({
        project,
        arm,
        instructions: instructionSets[arm],
        runtime: EvidenceBenchmarkRuntime.assign(
          projectIndex * ARMS.length + armIndex,
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
              instructions: instructions.entries.map(
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
    const upstreamCommit: string = (
      await EvidenceBenchmarkProcess.run(
        "git",
        ["rev-parse", "--verify", "@{upstream}"],
        { cwd: repository, label: "benchmark pushed source revision" },
      )
    ).stdout.trim();
    if (upstreamCommit !== sourceCommit)
      throw new Error(
        `Benchmark start requires the exact source commit to be pushed: local=${sourceCommit} upstream=${upstreamCommit}.`,
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
        "Usage: benchmark resume <project> <evidence|plain> <run-id>",
      );
    const [projectInput, armInput, runId] = arguments_;
    if (!ARMS.includes(armInput as (typeof ARMS)[number]))
      throw new Error(`Unknown benchmark arm: ${armInput}.`);
    const project: IEvidenceBenchmarkMaterialization.Project =
      EvidenceBenchmarkProject.parse(projectInput!);
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
      state.schemaVersion !== 9 ||
      state.workflow !== WORKFLOW ||
      state.engine !== ENGINE ||
      state.model !== MODEL ||
      state.effort !== EFFORT ||
      state.cliVersion !== EvidenceBenchmarkSandbox.version() ||
      !Number.isSafeInteger(state.controllerPid) ||
      state.controllerPid <= 0 ||
      typeof state.initialWorkspaceTreeSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(state.initialWorkspaceTreeSha256) ||
      !Array.isArray(state.lintBaselines) ||
      !Array.isArray(state.turns)
    )
      throw new Error(
        `Run ${runId} does not use the resumable ${WORKFLOW} state schema.`,
      );
    if (state.project !== project || state.arm !== arm)
      throw new Error(`Run ${runId} does not belong to ${project}/${arm}.`);
    EvidenceBenchmarkRuntime.assertAssignment(state.runtime);
    const currentCommit: string = (
      await EvidenceBenchmarkProcess.run("git", ["rev-parse", "HEAD"], {
        cwd: repository,
        label: "benchmark resume source revision",
      })
    ).stdout.trim();
    const sourceStatus: string = (
      await EvidenceBenchmarkProcess.run(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=all"],
        { cwd: repository, label: "benchmark resume source cleanliness" },
      )
    ).stdout.trim();
    const upstreamCommit: string = (
      await EvidenceBenchmarkProcess.run(
        "git",
        ["rev-parse", "--verify", "@{upstream}"],
        { cwd: repository, label: "benchmark resume pushed source revision" },
      )
    ).stdout.trim();
    if (
      currentCommit !== state.sourceCommit ||
      upstreamCommit !== state.sourceCommit ||
      sourceStatus.length !== 0
    )
      throw new Error(
        `Run ${runId} requires its clean pushed source commit ${state.sourceCommit}; local=${currentCommit} upstream=${upstreamCommit}${sourceStatus.length === 0 ? "" : ` dirty=${JSON.stringify(sourceStatus)}`}.`,
      );
    if (state.status === "completed")
      throw new Error(`Run ${runId} is already complete.`);
    const workspace: string = path.join(root, "workspace");
    const logs: string = path.join(root, "logs");
    if (!fs.existsSync(workspace) || !fs.existsSync(logs))
      throw new Error(`Run ${runId} has no resumable workspace and logs.`);
    if (
      state.controllerPid !== process.pid &&
      processAlive(state.controllerPid)
    )
      throw new Error(
        `Run ${runId} is still owned by live controller ${state.controllerPid}; refusing a parallel resume controller.`,
      );
    stopOrphanedModels(state.turns, workspace);
    if (state.status === "running") {
      state.status = "interrupted";
      writeState(root, state);
    } else if (state.status !== "interrupted")
      throw new Error(`Run ${runId} has an invalid resume status.`);
    state.controllerPid = process.pid;
    writeState(root, state);
    assertStateBaselines(root, state);
    EvidenceBenchmarkMaterializer.assertRequirementsRestored(workspace, root);
    EvidenceBenchmarkRuntime.assertRestored(workspace, state.runtime);
    EvidenceBenchmarkSetup.assertRestored(workspace, root, arm);
    const currentInstallation: string =
      await EvidenceBenchmarkSetup.assertReproducible(workspace, root);
    const latestAccepted: ITurn | undefined = state.turns.findLast(
      (turn) => turn.accepted === true,
    );
    if (
      latestAccepted !== undefined &&
      latestAccepted.installationReproductionSha256 !== currentInstallation
    )
      throw new Error(
        "Benchmark resume installation drifted from its latest accepted turn.",
      );
    EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
      workspace,
      arm,
      state.lintBaselines,
    );
    const instructions: IInstruction[] = readFrozenInstructions(root, arm);
    EvidenceBenchmarkTurnLedger.assertAcceptedOrder(state.turns);
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
          let restorationVerified: boolean = false;
          try {
            restoration = await verifyLintRestoration({
              workspace,
              arm,
              name: entry.name,
              baselines: state.lintBaselines,
              runtime: state.runtime,
            });
            restorationVerified = true;
          } catch {}
          if (
            restorationVerified &&
            restoration === accepted.lintRestorationSha256 &&
            (entry.name !== "skills-contract" ||
              (accepted.workspaceRestorationSha256 ===
                state.initialWorkspaceTreeSha256 &&
                EvidenceBenchmarkPublication.workspaceSha256(workspace) ===
                  state.initialWorkspaceTreeSha256))
          )
            continue;
          const index: number = instructions.findIndex(
            (instruction) => instruction.name === entry.name,
          );
          for (const turn of state.turns)
            if (
              turn.accepted === true &&
              instructions.findIndex(
                (instruction) => instruction.name === turn.name,
              ) >= index
            ) {
              turn.accepted = false;
              delete turn.lintRestorationSha256;
              delete turn.workspaceRestorationSha256;
            }
          writeState(root, state);
        }
        state.status = "running";
        state.elapsedMs = baseElapsedMs + elapsed(resumed);
        writeState(root, state);
        phase = entry.name;
        const turn: ITurn = await runTurn({
          workspace,
          environment,
          logs,
          name: entry.name,
          prompt: entry.content,
          threadId: state.threadId,
          retain: (active) => {
            state.threadId ??= active.threadId;
            if (!state.turns.includes(active)) state.turns.push(active);
            state.elapsedMs = baseElapsedMs + elapsed(resumed);
            writeState(root, state);
          },
        });
        EvidenceBenchmarkSetup.resetMutableCaches(workspace);
        if (turn.status !== 0) {
          state.status = "interrupted";
          writeState(root, state);
          throw new Error(
            `${entry.name} resume attempt exited with status ${String(turn.status)}.`,
          );
        }
        if (state.threadId === undefined)
          throw new Error(
            `${entry.name} resume attempt succeeded without a resumable thread ID.`,
          );
        if (entry.name === "skills-contract")
          turn.workspaceRestorationSha256 = assertSkillsContractRestored(
            workspace,
            state.initialWorkspaceTreeSha256,
          );
        turn.installationReproductionSha256 =
          await EvidenceBenchmarkSetup.assertReproducible(
            workspace,
            root,
            entry.name === "overall-final",
          );
        turn.lintRestorationSha256 = await verifyLintRestoration({
          workspace,
          arm,
          name: entry.name,
          baselines: state.lintBaselines,
          runtime: state.runtime,
        });
        turn.accepted = true;
        writeState(root, state);
      }
      state.elapsedMs = baseElapsedMs + elapsed(resumed);
      state.completedWorkspaceTreeSha256 =
        EvidenceBenchmarkPublication.workspaceSha256(workspace);
      EvidenceBenchmarkTurnLedger.assertAcceptedOrder(state.turns, true);
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
    instructions: IInstructionSet;
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
      EvidenceBenchmarkRuntime.assertRestored(
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
      materialization.environment.CODEX_HOME = prepareModelHome(root);
      await verifyPermissionProfile({
        workspace: materialization.workspace,
        root,
        environment: materialization.environment,
        runtime: props.runtime,
      });
      await EvidenceBenchmarkSetup.assertReproducible(
        materialization.workspace,
        root,
      );
      const logs: string = path.join(root, "logs");
      fs.mkdirSync(logs, { recursive: false });
      state = {
        schemaVersion: 9,
        workflow: WORKFLOW,
        instructionsTreeSha256: freezeInstructions(root, props.instructions),
        project: props.project,
        arm: props.arm,
        engine: ENGINE,
        model: MODEL,
        effort: EFFORT,
        cliVersion: EvidenceBenchmarkSandbox.version(),
        sourceCommit: props.sourceCommit,
        lintBaselines: materialization.lintBaselines,
        runtime: props.runtime,
        elapsedMs: elapsed(started),
        status: "running",
        controllerPid: process.pid,
        initialWorkspaceTreeSha256:
          EvidenceBenchmarkPublication.workspaceSha256(
            materialization.workspace,
          ),
        turns: [],
      };
      writeState(root, state);
      for (const entry of props.instructions.entries) {
        phase = entry.name;
        const turn: ITurn = await runTurn({
          workspace: materialization.workspace,
          environment: materialization.environment,
          logs,
          name: entry.name,
          prompt: entry.content,
          threadId: state.threadId,
          retain: (active) => {
            state!.threadId ??= active.threadId;
            if (!state!.turns.includes(active)) state!.turns.push(active);
            state!.elapsedMs = elapsed(started);
            writeState(root, state!);
          },
        });
        EvidenceBenchmarkSetup.resetMutableCaches(materialization.workspace);
        if (turn.status !== 0)
          throw new Error(
            `${entry.name} turn exited with status ${String(turn.status)}.`,
          );
        if (state.threadId === undefined)
          throw new Error(
            `${entry.name} turn succeeded without a resumable thread ID.`,
          );
        if (entry.name === "skills-contract")
          turn.workspaceRestorationSha256 = assertSkillsContractRestored(
            materialization.workspace,
            state.initialWorkspaceTreeSha256,
          );
        turn.installationReproductionSha256 =
          await EvidenceBenchmarkSetup.assertReproducible(
            materialization.workspace,
            root,
            entry.name === "overall-final",
          );
        turn.lintRestorationSha256 = await verifyLintRestoration({
          workspace: materialization.workspace,
          arm: props.arm,
          name: entry.name,
          baselines: state.lintBaselines,
          runtime: props.runtime,
        });
        turn.accepted = true;
        writeState(root, state);
      }
      state.elapsedMs = elapsed(started);
      state.completedWorkspaceTreeSha256 =
        EvidenceBenchmarkPublication.workspaceSha256(materialization.workspace);
      EvidenceBenchmarkTurnLedger.assertAcceptedOrder(state.turns, true);
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
    retain: (turn: ITurn) => void;
  }): Promise<ITurn> {
    const stem: string = logStem(props.logs, props.name);
    const stdoutPath: string = path.join(props.logs, `${stem}.stdout.jsonl`);
    const stderrPath: string = path.join(props.logs, `${stem}.stderr.log`);
    const args: string[] = EvidenceBenchmarkTurnLedger.invocationArguments({
      workspace: props.workspace,
      threadId: props.threadId,
      model: MODEL,
      effort: EFFORT,
      writable: props.name !== "skills-contract",
    });
    const executable: EvidenceBenchmarkSandbox.IExecutable =
      EvidenceBenchmarkSandbox.resolveExecutable();
    fs.writeFileSync(stdoutPath, "", { flag: "wx" });
    try {
      fs.writeFileSync(stderrPath, "", { flag: "wx" });
    } catch (error) {
      fs.rmSync(stdoutPath, { force: true });
      throw error;
    }
    const started: bigint = process.hrtime.bigint();
    const turn: ITurn = {
      name: props.name,
      elapsedMs: 0,
      status: null,
      stdout: path.posix.join("logs", path.basename(stdoutPath)),
      stderr: path.posix.join("logs", path.basename(stderrPath)),
      invocation: [executable.command, ...executable.prefix, ...args],
      accepted: false,
    };
    props.retain(turn);
    const stdout = fs.createWriteStream(stdoutPath, { flags: "a" });
    const stderr = fs.createWriteStream(stderrPath, { flags: "a" });
    const child = spawn(executable.command, [...executable.prefix, ...args], {
      cwd: props.workspace,
      env: props.environment,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: "pipe",
    });
    if (child.pid !== undefined) turn.modelPid = child.pid;
    let retentionError: unknown;
    const retain = (): void => {
      turn.elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      try {
        props.retain(turn);
      } catch (error) {
        retentionError ??= error;
        if (child.pid !== undefined)
          try {
            terminateProcessTree(child.pid);
          } catch (termination) {
            retentionError = new AggregateError(
              [retentionError, termination],
              "Active benchmark attempt retention and process termination both failed.",
            );
          }
      }
    };
    retain();
    const heartbeat: NodeJS.Timeout = setInterval(retain, 1_000);
    heartbeat.unref();
    let remainder: string = "";
    const readThreadId = (line: string): void => {
      try {
        const event: unknown = JSON.parse(line);
        if (
          typeof event === "object" &&
          event !== null &&
          "type" in event &&
          event.type === "thread.started" &&
          "thread_id" in event &&
          typeof event.thread_id === "string" &&
          event.thread_id.length !== 0
        ) {
          turn.threadId = event.thread_id;
          retain();
        }
      } catch {}
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.write(chunk);
      remainder += chunk.toString("utf8");
      const lines: string[] = remainder.split(/\r?\n/);
      remainder = lines.pop() ?? "";
      for (const line of lines) readThreadId(line);
    });
    child.stderr.pipe(stderr);
    child.stdin.end(props.prompt, "utf8");
    let processError: unknown;
    try {
      turn.status = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      if (remainder.length !== 0) readThreadId(remainder);
    } catch (error) {
      processError = error;
    } finally {
      clearInterval(heartbeat);
      retain();
      await Promise.all([
        new Promise<void>((resolve) => stdout.end(resolve)),
        new Promise<void>((resolve) => stderr.end(resolve)),
      ]);
    }
    if (retentionError !== undefined) throw retentionError;
    if (processError !== undefined) throw processError;
    return turn;
  }

  async function verifyPermissionProfile(props: {
    workspace: string;
    root: string;
    environment: NodeJS.ProcessEnv;
    runtime: EvidenceBenchmarkRuntime.IAssignment;
  }): Promise<void> {
    assertNoLegacyManagedSandbox();
    const scratch: string = path.join(
      props.workspace,
      ".benchmark-cache",
      "permission-preflight",
    );
    const probe: string = path.join(scratch, "probe.cjs");
    const writable: string = path.join(scratch, "workspace-write.txt");
    const modelSentinel: string = path.join(
      props.root,
      "model-home",
      "sandbox-denied.txt",
    );
    fs.mkdirSync(scratch, { recursive: true });
    fs.writeFileSync(modelSentinel, "denied\n", {
      encoding: "utf8",
      flag: "wx",
    });
    fs.writeFileSync(
      probe,
      [
        'const fs = require("node:fs");',
        'const net = require("node:net");',
        "const [writable, npmrc, toolchain, corepack, controller, model, port] = process.argv.slice(2);",
        "const denied = (operation, label) => {",
        "  try { operation(); } catch { return; }",
        "  throw new Error(`permission preflight unexpectedly accessed ${label}`);",
        "};",
        "fs.writeFileSync(writable, 'workspace\\n');",
        "fs.readFileSync(npmrc);",
        "fs.readFileSync(toolchain);",
        "fs.readFileSync(corepack);",
        "denied(() => fs.appendFileSync(npmrc, 'forbidden\\n'), 'retained npm config for write');",
        "denied(() => fs.readFileSync(controller), 'controller state');",
        "denied(() => fs.readFileSync(model), 'model authentication home');",
        "new Promise((resolve, reject) => {",
        "  const socket = net.connect(Number(port), '127.0.0.1');",
        "  socket.setTimeout(5000);",
        "  socket.once('connect', () => { socket.end(); resolve(); });",
        "  socket.once('timeout', () => reject(new Error('loopback permission preflight timed out')));",
        "  socket.once('error', reject);",
        "}).catch((error) => { console.error(error); process.exitCode = 1; });",
        "",
      ].join("\n"),
      { encoding: "utf8", flag: "wx" },
    );
    const server: net.Server = net.createServer((socket) => socket.end());
    let listening: boolean = false;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(props.runtime.apiPort, "127.0.0.1", resolve);
      });
      listening = true;
      const executable: EvidenceBenchmarkSandbox.IExecutable =
        EvidenceBenchmarkSandbox.resolveExecutable();
      const authority: EvidenceBenchmarkSandbox.IAuthority = {
        workspace: props.workspace,
        toolchain: path.join(props.root, "cache", "toolchain-bin"),
        corepack: path.join(props.root, "cache", "corepack"),
        npmConfig: EvidenceBenchmarkMaterializer.npmConfig(props.root),
        gitConfig: EvidenceBenchmarkMaterializer.gitConfig(props.root),
      };
      await EvidenceBenchmarkProcess.run(
        executable.command,
        [
          ...executable.prefix,
          ...EvidenceBenchmarkSandbox.argumentsFor(
            authority,
            process.execPath,
            [
              probe,
              writable,
              EvidenceBenchmarkMaterializer.npmConfig(props.root),
              path.join(
                props.root,
                "cache",
                "toolchain-bin",
                process.platform === "win32" ? "pnpm.cmd" : "pnpm",
              ),
              firstRegularFile(path.join(props.root, "cache", "corepack")),
              path.join(props.root, "setup.json"),
              modelSentinel,
              String(props.runtime.apiPort),
            ],
          ),
        ],
        {
          cwd: props.workspace,
          env: props.environment,
          label: "benchmark Codex permission profile preflight",
        },
      );
    } finally {
      try {
        if (listening)
          await new Promise<void>((resolve, reject) =>
            server.close((error) =>
              error === undefined ? resolve() : reject(error),
            ),
          );
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
        fs.rmSync(modelSentinel, { force: true });
      }
    }
  }

  function assertNoLegacyManagedSandbox(): void {
    const candidates: readonly string[] =
      process.platform === "win32"
        ? [path.join(os.homedir(), ".codex", "managed_config.toml")]
        : ["/etc/codex/managed_config.toml"];
    for (const candidate of candidates)
      if (
        fs.existsSync(candidate) &&
        /^\s*["']?sandbox_mode["']?\s*=/m.test(
          fs.readFileSync(candidate, "utf8"),
        )
      )
        throw new Error(
          `Benchmark permission profiles cannot run with managed legacy sandbox_mode: ${candidate}.`,
        );
    if (process.platform !== "darwin") return;
    const managed = spawnSync(
      "defaults",
      ["read", "com.openai.codex", "config_toml_base64"],
      { encoding: "utf8", shell: false },
    );
    if (
      managed.status === 0 &&
      /^\s*["']?sandbox_mode["']?\s*=/m.test(
        Buffer.from((managed.stdout ?? "").trim(), "base64").toString("utf8"),
      )
    )
      throw new Error(
        "Benchmark permission profiles cannot run with managed macOS legacy sandbox_mode.",
      );
  }

  function firstRegularFile(directory: string): string {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const location: string = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested: string | undefined =
          firstRegularFileOrUndefined(location);
        if (nested !== undefined) return nested;
      } else if (entry.isFile()) return location;
    }
    throw new Error(
      `Benchmark permission preflight found no retained file: ${directory}.`,
    );
  }

  function firstRegularFileOrUndefined(directory: string): string | undefined {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const location: string = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested: string | undefined =
          firstRegularFileOrUndefined(location);
        if (nested !== undefined) return nested;
      } else if (entry.isFile()) return location;
    }
    return undefined;
  }

  function readInstructionSets(
    repository: string,
  ): Readonly<Record<IEvidenceBenchmarkMaterialization.Arm, IInstructionSet>> {
    const root: string = path.join(repository, "benchmark", "instructions");
    const inventory: ReadonlyMap<string, string> = new Map(
      [
        ...new Set(
          ARMS.flatMap((arm) =>
            instructionEntries(arm).map((entry) => entry.relative),
          ),
        ),
      ].map((relative) => [
        relative,
        fs.readFileSync(path.join(root, relative), "utf8"),
      ]),
    );
    const create = (
      arm: IEvidenceBenchmarkMaterialization.Arm,
    ): IInstructionSet => {
      const entries: readonly IInstruction[] = Object.freeze(
        instructionEntries(arm).map((entry) =>
          Object.freeze({
            ...entry,
            content: inventory.get(entry.relative)!,
          }),
        ),
      );
      return Object.freeze({
        entries,
        sha256: EvidenceBenchmarkHash.tree(
          new Map(
            entries.map((entry) => [
              entry.relative,
              Buffer.from(entry.content, "utf8"),
            ]),
          ),
        ),
      });
    };
    return Object.freeze({
      evidence: create("evidence"),
      plain: create("plain"),
    });
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
    instructions: IInstructionSet,
  ): string {
    const files: Map<string, Uint8Array> = new Map(
      instructions.entries.map((entry) => [
        entry.relative,
        Buffer.from(entry.content, "utf8"),
      ]),
    );
    const sha256: string = EvidenceBenchmarkHash.tree(files);
    if (sha256 !== instructions.sha256)
      throw new Error("Shared benchmark instruction snapshot drifted.");
    const destination: string = path.join(root, "inputs", "instructions");
    fs.mkdirSync(destination, { recursive: false });
    for (const [relative, content] of files) {
      const target: string = path.join(destination, ...relative.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, { flag: "wx" });
    }
    return sha256;
  }

  function parseOptions(repository: string, arguments_: string[]): IOptions {
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
    const selected: IEvidenceBenchmarkMaterialization.Project[] = [
      ...new Set(
        projects.map((project) =>
          EvidenceBenchmarkProject.requireCorpus(repository, project),
        ),
      ),
    ];
    EvidenceBenchmarkRuntime.assign(
      selected.length * ARMS.length - 1,
      portBase,
    );
    return {
      projects: selected,
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

  function assertSkillsContractRestored(
    workspace: string,
    expected: string,
  ): string {
    const actual: string =
      EvidenceBenchmarkPublication.workspaceSha256(workspace);
    if (actual !== expected)
      throw new Error(
        `The read-only skills-contract turn changed the measured workspace: expected ${expected}, received ${actual}.`,
      );
    return actual;
  }

  async function verifyLintRestoration(props: {
    workspace: string;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    name: TurnName;
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[];
    runtime: EvidenceBenchmarkRuntime.IAssignment;
  }): Promise<string | undefined> {
    EvidenceBenchmarkMaterializer.assertRequirementsRestored(
      props.workspace,
      path.dirname(props.workspace),
    );
    EvidenceBenchmarkRuntime.assertRestored(props.workspace, props.runtime);
    EvidenceBenchmarkSetup.assertRestored(
      props.workspace,
      path.dirname(props.workspace),
      props.arm,
    );
    const infrastructure: string =
      EvidenceBenchmarkLintBaseline.assertInfrastructureRestored(
        props.workspace,
        props.arm,
        props.baselines,
      );
    if (props.arm === "plain")
      return EvidenceBenchmarkLintBaseline.assertRestored(
        props.workspace,
        props.arm,
        props.baselines,
      );
    const selected: readonly string[] | undefined =
      props.name === "skills-contract"
        ? undefined
        : props.name.startsWith("backend-")
          ? EvidenceBenchmarkLintBaseline.BACKEND_PATHS
          : EvidenceBenchmarkLintBaseline.PATHS;
    if (selected === undefined) return infrastructure;
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
      manifest.schemaVersion !== 6 ||
      manifest.artifact.sourceCommit !== state.sourceCommit ||
      !path.basename(root).startsWith(`${state.sourceCommit.slice(0, 12)}-`) ||
      manifest.inputSha256 !==
        EvidenceBenchmarkHash.object({
          treeAlgorithm: manifest.treeAlgorithm,
          project: manifest.project,
          arm: manifest.arm,
          variables: manifest.variables,
          base: manifest.baseTreeSha256,
          overlay: manifest.armTreeSha256,
          requirements: manifest.requirementsTreeSha256,
          product: manifest.artifact.sha256,
          workspace: manifest.workspaceTreeSha256,
          lintBaselines: manifest.lintBaselines,
        }) ||
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
    const descriptor: number = fs.openSync(temporary, "w");
    try {
      fs.writeFileSync(
        descriptor,
        `${JSON.stringify(state, null, 2)}\n`,
        "utf8",
      );
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, target);
  }

  function processAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EPERM"
      );
    }
  }

  function stopOrphanedModels(
    turns: readonly ITurn[],
    workspace: string,
  ): void {
    for (const turn of turns)
      if (
        turn.status === null &&
        turn.accepted === false &&
        Number.isSafeInteger(turn.modelPid) &&
        turn.modelPid! > 0 &&
        processAlive(turn.modelPid!)
      ) {
        const commandLine: string | undefined = processCommandLine(
          turn.modelPid!,
        );
        if (commandLine === undefined && !processAlive(turn.modelPid!))
          continue;
        const normalized: string = (commandLine ?? "").toLowerCase();
        const workspaceCandidates: string[] = [
          path.resolve(workspace),
          path.resolve(workspace).replaceAll("\\", "\\\\"),
          path.resolve(workspace).replaceAll("\\", "/"),
        ].map((value) => value.toLowerCase());
        if (
          commandLine === undefined ||
          !normalized.includes("codex") ||
          workspaceCandidates.every(
            (candidate) => !normalized.includes(candidate),
          )
        )
          throw new Error(
            `Refusing to terminate unverified model process ${turn.modelPid}.`,
          );
        terminateProcessTree(turn.modelPid!);
      }
  }

  function processCommandLine(pid: number): string | undefined {
    if (process.platform === "win32") {
      const script: string = [
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"`,
        "if ($null -ne $p) { [Console]::Out.Write($p.CommandLine) }",
      ].join("; ");
      const result = spawnSync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
        {
          encoding: "utf8",
          shell: false,
          windowsHide: true,
        },
      );
      const output: string = (result.stdout ?? "").toString();
      return result.status === 0 && output.trim().length !== 0
        ? output
        : undefined;
    }
    const proc: string = `/proc/${pid}/cmdline`;
    if (fs.existsSync(proc))
      try {
        return fs.readFileSync(proc).toString("utf8").replaceAll("\0", " ");
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ENOENT"
        )
          return undefined;
        throw error;
      }
    const result = spawnSync(
      "ps",
      ["-ww", "-p", String(pid), "-o", "command="],
      {
        encoding: "utf8",
        shell: false,
      },
    );
    const output: string = (result.stdout ?? "").toString();
    return result.status === 0 && output.trim().length !== 0
      ? output
      : undefined;
  }

  function terminateProcessTree(pid: number): void {
    if (process.platform === "win32") {
      const result = spawnSync(
        "taskkill.exe",
        ["/PID", String(pid), "/T", "/F"],
        {
          encoding: "utf8",
          shell: false,
          windowsHide: true,
        },
      );
      if (result.status !== 0 && processAlive(pid))
        throw new Error(
          `Could not terminate owned model process ${pid}: ${(result.stderr ?? "").toString().trim()}.`,
        );
      return;
    }
    for (const signal of ["SIGTERM", "SIGKILL"] as const)
      try {
        process.kill(-pid, signal);
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "ESRCH"
        )
          throw error;
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
      ...EvidenceBenchmarkMaterializer.hostEnvironment(),
      HOME: manifest.caches.home,
      USERPROFILE: manifest.caches.home,
      APPDATA: path.join(manifest.caches.home, "appdata", "roaming"),
      LOCALAPPDATA: path.join(manifest.caches.home, "appdata", "local"),
      XDG_CACHE_HOME: path.join(manifest.caches.home, ".cache"),
      XDG_CONFIG_HOME: path.join(manifest.caches.home, ".config"),
      COREPACK_HOME: manifest.caches.corepack,
      TTSC_CACHE_DIR: manifest.caches.ttsc,
      TTSC_GO_CACHE_DIR: manifest.caches.go,
      GOCACHE: manifest.caches.go,
      GOENV: "off",
      GOMODCACHE: manifest.caches.goModules,
      GOPATH: manifest.caches.goPath,
      GOTMPDIR: path.join(manifest.caches.temp, "go"),
      PLAYWRIGHT_BROWSERS_PATH: manifest.caches.playwright,
      TMPDIR: manifest.caches.temp,
      TEMP: manifest.caches.temp,
      TMP: manifest.caches.temp,
      CODEX_HOME: assertModelHome(root),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: EvidenceBenchmarkMaterializer.gitConfig(root),
    };
    for (const key of Object.keys(environment))
      if (key.toLowerCase().startsWith("npm_config_")) delete environment[key];
    environment.npm_config_store_dir = manifest.caches.pnpm;
    environment.npm_config_userconfig =
      EvidenceBenchmarkMaterializer.npmConfig(root);
    environment.npm_config_globalconfig =
      EvidenceBenchmarkMaterializer.npmConfig(root);
    // Resume must not inherit Nestia's loader-only rule bypass from its caller.
    delete environment.NESTIA_SDK_TRANSFORM;
    EvidenceBenchmarkProcess.pinEnvironment(
      environment,
      manifest.caches.toolchain,
    );
    return environment;
  }

  /**
   * Gives the measured CLI authentication without host instructions or config.
   *
   * The retained home stays outside the writable workspace so resumed threads
   * preserve their native session while model tools cannot rewrite authority.
   */
  function prepareModelHome(root: string): string {
    const target: string = path.join(root, "model-home");
    if (fs.existsSync(target))
      throw new Error(`Benchmark model home already exists: ${target}.`);
    fs.mkdirSync(target, { recursive: false });
    const source: string =
      process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
    const authentication: string = path.join(source, "auth.json");
    if (fs.existsSync(authentication))
      fs.copyFileSync(authentication, path.join(target, "auth.json"));
    else if (
      [process.env.OPENAI_API_KEY, process.env.CODEX_API_KEY].every(
        (key) => typeof key !== "string" || key.length === 0,
      )
    )
      throw new Error(
        "Benchmark Codex authentication requires auth.json, OPENAI_API_KEY, or CODEX_API_KEY.",
      );
    return assertModelHome(root);
  }

  function assertModelHome(root: string): string {
    const target: string = path.join(root, "model-home");
    const stat: fs.Stats | undefined = fs.lstatSync(target, {
      throwIfNoEntry: false,
    });
    if (!stat?.isDirectory() || stat.isSymbolicLink())
      throw new Error(
        `Benchmark model home is not a real directory: ${target}.`,
      );
    for (const forbidden of ["AGENTS.md", "AGENTS.override.md", "config.toml"])
      if (fs.existsSync(path.join(target, forbidden)))
        throw new Error(
          `Benchmark model home contains forbidden host policy: ${forbidden}.`,
        );
    return target;
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
            typeof event.thread_id === "string" &&
            event.thread_id.length !== 0
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
        ![".benchmark-cache", ".git", "node_modules"].includes(
          path.basename(source).toLowerCase(),
        ),
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
