import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkEngine } from "./EvidenceBenchmarkEngine.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProject } from "./EvidenceBenchmarkProject.ts";
import { EvidenceBenchmarkPublication } from "./EvidenceBenchmarkPublication.ts";
import { EvidenceBenchmarkRepair } from "./EvidenceBenchmarkRepair.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import { EvidenceBenchmarkState } from "./EvidenceBenchmarkState.ts";
import { EvidenceBenchmarkTurnLedger } from "./EvidenceBenchmarkTurnLedger.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";

/**
 * Prepares and launches retained multi-engine benchmark waves from one clean
 * revision.
 */
export namespace EvidenceBenchmarkCommandLine {
  const WORKFLOW = "backend-first-gated-v2" as const;
  const ARMS = ["evidence", "plain"] as const;
  const CLAUDE_MINIMUM_VERSION = [2, 1, 219] as const;

  type TurnName = EvidenceBenchmarkTurnLedger.Name;

  interface ITurn {
    name: TurnName;
    elapsedMs: number;
    status: number | null;
    stdout: string;
    stderr: string;
    invocation: string[];
    cwd: string;
    accepted?: boolean;
    lintRestorationSha256?: string;
    sessionId?: string;
    acceptanceInvalidation?: {
      code: "permission-denied";
      denialCount: number;
      stdout: string;
    };
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
    schemaVersion: 8;
    workflow: typeof WORKFLOW;
    instructionsTreeSha256: string;
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    engine: EvidenceBenchmarkEngine.Name;
    model: EvidenceBenchmarkEngine.IDefinition["model"];
    effort: EvidenceBenchmarkEngine.IDefinition["effort"];
    cliVersion: string;
    sourceCommit: string;
    lintBaselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[];
    runtime: EvidenceBenchmarkRuntime.IAssignment;
    nonAgentElapsedMs: number;
    agentElapsedMs: number;
    timingNormalization?: {
      legacyControllerElapsedMs: number;
      excludedNonAgentElapsedMs: number;
    };
    status: "prepared" | "running" | "interrupted" | "completed";
    completedWorkspaceTreeSha256?: string;
    sessionId?: string;
    turns: ITurn[];
  }

  interface ILegacyState extends Omit<
    IState,
    | "schemaVersion"
    | "nonAgentElapsedMs"
    | "agentElapsedMs"
    | "timingNormalization"
  > {
    schemaVersion: 7;
    elapsedMs: number;
  }

  interface IOptions {
    projects: IEvidenceBenchmarkMaterialization.Project[];
    portBase: number;
  }

  interface ICell {
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    engine: EvidenceBenchmarkEngine.IDefinition;
    instructions: IInstructionSet;
    runtime: EvidenceBenchmarkRuntime.IAssignment;
  }

  interface IPreparedCell extends ICell {
    repository: string;
    runId: string;
    root: string;
    workspace: string;
    environment: NodeJS.ProcessEnv;
    state: IState;
  }

  /**
   * Builds the exact least-privilege Codex configuration for one measured cell.
   *
   * The Codex process retains its own authentication, while model-launched
   * commands can read only the minimal runtime and can write only the measured
   * workspace plus its run-owned cache tree.
   */
  export function codexIsolationArguments(
    workspace: string,
    environment: NodeJS.ProcessEnv,
  ): string[] {
    const cache: string = path.join(path.dirname(workspace), "cache");
    const home: string = path.join(cache, "agent-home");
    const temporary: string = path.join(cache, "os-temp");
    const explicit: Record<string, string> = {
      CI: "1",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      GOTOOLCHAIN: "local",
      HOME: home,
      USERPROFILE: home,
      TEMP: temporary,
      TMP: temporary,
      TMPDIR: temporary,
      XDG_CACHE_HOME: path.join(cache, "xdg"),
    };
    for (const name of [
      "API_PORT",
      "COREPACK_HOME",
      "GOCACHE",
      "GOMODCACHE",
      "GOPATH",
      "GOTMPDIR",
      "npm_config_cache",
      "npm_config_store_dir",
      "PLAYWRIGHT_BROWSERS_PATH",
      "PLAYWRIGHT_TEST_PORT",
      "SWAGGER_PORT",
      "TTSC_CACHE_DIR",
      "TTSC_GO_CACHE_DIR",
      "VITE_API_HOST",
      "VITE_DEV_PORT",
    ] as const) {
      const value: string | undefined = environment[name];
      if (value !== undefined) explicit[name] = value;
    }
    return [
      "--ignore-user-config",
      "--ignore-rules",
      "--strict-config",
      "--config",
      'approval_policy="never"',
      "--config",
      'default_permissions="benchmark"',
      "--config",
      'permissions.benchmark.extends=":workspace"',
      "--config",
      'permissions.benchmark.filesystem.:root="deny"',
      "--config",
      'permissions.benchmark.filesystem.:minimal="read"',
      "--config",
      'permissions.benchmark.filesystem.:tmpdir="deny"',
      "--config",
      'permissions.benchmark.filesystem.:slash_tmp="deny"',
      "--config",
      `permissions.benchmark.workspace_roots={${tomlString(cache)}=true}`,
      "--config",
      'permissions.benchmark.filesystem.:workspace_roots={"."="write"}',
      "--config",
      "permissions.benchmark.network.enabled=true",
      "--config",
      "permissions.benchmark.network.allow_upstream_proxy=false",
      "--config",
      'permissions.benchmark.network.domains={localhost="allow","127.0.0.1"="allow"}',
      "--config",
      'shell_environment_policy.inherit="core"',
      "--config",
      "shell_environment_policy.ignore_default_excludes=false",
      "--config",
      'shell_environment_policy.exclude=["*_PROXY","OPENAI_*","AZURE_*","AWS_*","GITHUB_TOKEN","GH_TOKEN","*KEY*","*SECRET*","*TOKEN*"]',
      "--config",
      `shell_environment_policy.set=${tomlStringMap(explicit)}`,
    ];
  }

  /**
   * Builds the strict Claude Code settings and tool surface for one measured
   * cell. POSIX hosts add Claude's OS sandbox; native Windows retains the same
   * non-interactive tool policy around the disposable measured workspace.
   */
  export function claudeIsolationArguments(
    repository: string,
    workspace: string,
    environment: NodeJS.ProcessEnv,
  ): string[] {
    const runRoot: string = path.dirname(workspace);
    const cache: string = path.join(runRoot, "cache");
    const sandboxSupported: boolean = process.platform !== "win32";
    const protectedEnvironment: string[] = [
      ...new Set([
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
        "AWS_SESSION_TOKEN",
        "AZURE_API_KEY",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "OPENAI_API_KEY",
        ...Object.keys(environment).filter((name) =>
          /(?:^|_)(?:KEY|SECRET|TOKEN|PASSWORD|PROXY)(?:_|$)/i.test(name),
        ),
      ]),
    ].sort();
    const tools: string = "Bash,Edit,Write,Read,Glob,Grep,Agent";
    const workspaceGlob: string =
      EvidenceBenchmarkTurnLedger.claudeWorkspaceGlob(workspace);
    const allowedTools: string[] = [
      "Bash",
      `Edit(${workspaceGlob})`,
      `Write(${workspaceGlob})`,
      `Read(${workspaceGlob})`,
      "Agent",
    ];
    const settings = {
      permissions: {
        allow: allowedTools,
        deny: ["WebFetch", "WebSearch"],
      },
      sandbox: {
        enabled: sandboxSupported,
        failIfUnavailable: sandboxSupported,
        autoAllowBashIfSandboxed: true,
        allowUnsandboxedCommands: false,
        filesystem: {
          denyRead: ["~/", path.resolve(repository), runRoot],
          allowRead: [workspace, cache],
          allowWrite: [cache],
        },
        credentials: {
          envVars: protectedEnvironment.map((name) => ({
            name,
            mode: "deny",
          })),
        },
        network: {
          allowedDomains: ["localhost", "127.0.0.1"],
          strictAllowlist: true,
          allowLocalBinding: true,
        },
      },
      autoMemoryEnabled: false,
      env: {
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-sonnet-5",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-5",
        CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-5",
        CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: "0",
        CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1",
      },
      attribution: {
        commit: "",
        pr: "",
        sessionUrl: false,
      },
    };
    return [
      "--permission-mode",
      "dontAsk",
      "--tools",
      tools,
      "--allowedTools",
      allowedTools.join(","),
      "--disallowedTools",
      "WebFetch,WebSearch",
      "--setting-sources",
      "",
      "--settings",
      JSON.stringify(settings),
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--disable-slash-commands",
      "--no-chrome",
      "--prompt-suggestions",
      "false",
    ];
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
    const cells: ICell[] = options.projects.flatMap((project, projectIndex) =>
      EvidenceBenchmarkEngine.MATRIX.flatMap((engine, engineIndex) =>
        ARMS.map((arm, armIndex) => ({
          project,
          arm,
          engine,
          instructions: instructionSets[arm],
          runtime: EvidenceBenchmarkRuntime.assign(
            (projectIndex * EvidenceBenchmarkEngine.MATRIX.length +
              engineIndex) *
              ARMS.length +
              armIndex,
            options.portBase,
          ),
        })),
      ),
    );
    if (arguments_[0] === "plan") {
      console.log(
        JSON.stringify(
          {
            engines: EvidenceBenchmarkEngine.MATRIX,
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
        "Usage: benchmark <plan|start> [--port-base <number>] <project>... | benchmark resume <engine> <project> <arm> <run-id> | benchmark repair --patch <file> <run-id> <project>... | benchmark publish --repository <owner/name> --checkout <local-path> --public <engine> <project> <arm> <run-id>",
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
    const cliVersions: ReadonlyMap<EvidenceBenchmarkEngine.Name, string> =
      new Map(
        EvidenceBenchmarkEngine.MATRIX.map((engine) => [
          engine.engine,
          engineVersion(engine.engine),
        ]),
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
    const preparations = await Promise.allSettled(
      cells.map((cell) =>
        prepareCell({
          repository,
          sourceCommit,
          runId,
          artifact,
          cliVersion: cliVersions.get(cell.engine.engine)!,
          ...cell,
        }),
      ),
    );
    const preparationFailures: unknown[] = preparations.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (preparationFailures.length !== 0) {
      for (const result of preparations)
        if (result.status === "fulfilled")
          fs.rmSync(result.value.root, { recursive: true, force: true });
      throw new AggregateError(
        preparationFailures,
        `${preparationFailures.length} benchmark cells failed before the all-cell launch barrier.`,
      );
    }
    const prepared: IPreparedCell[] = preparations.map(
      (result) => (result as PromiseFulfilledResult<IPreparedCell>).value,
    );
    const executions = await Promise.allSettled(
      prepared.map((cell) => runPreparedCell(cell)),
    );
    const executionFailures: unknown[] = executions.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (executionFailures.length !== 0)
      throw new AggregateError(
        executionFailures,
        `${executionFailures.length} benchmark cells failed after the all-cell launch barrier.`,
      );
  }

  async function resumeCell(
    repository: string,
    arguments_: readonly string[],
  ): Promise<void> {
    if (arguments_.length !== 4)
      throw new Error(
        "Usage: benchmark resume <engine> <project> <evidence|plain> <run-id>",
      );
    const [engineInput, projectInput, armInput, runId] = arguments_;
    const engine: EvidenceBenchmarkEngine.IDefinition =
      EvidenceBenchmarkEngine.definition(
        EvidenceBenchmarkEngine.parse(engineInput!),
      );
    if (!ARMS.includes(armInput as (typeof ARMS)[number]))
      throw new Error(`Unknown benchmark arm: ${armInput}.`);
    const project: IEvidenceBenchmarkMaterialization.Project =
      EvidenceBenchmarkProject.parse(projectInput!);
    const arm = armInput as IEvidenceBenchmarkMaterialization.Arm;
    const resultsRoot: string = path.resolve(repository, "benchmark", "result");
    const root: string = path.resolve(
      resultsRoot,
      project,
      engine.engine,
      arm,
      "runs",
      runId!,
    );
    assertInside(resultsRoot, root, "resume root");
    const retainedState: IState | ILegacyState = EvidenceBenchmarkState.read(
      root,
      "Resumable state",
    );
    if (
      (retainedState.schemaVersion !== 7 &&
        retainedState.schemaVersion !== 8) ||
      retainedState.workflow !== WORKFLOW ||
      retainedState.engine !== engine.engine ||
      retainedState.model !== engine.model ||
      retainedState.effort !== engine.effort ||
      retainedState.cliVersion !== engineVersion(engine.engine) ||
      !Array.isArray(retainedState.lintBaselines) ||
      !Array.isArray(retainedState.turns)
    )
      throw new Error(
        `Run ${runId} does not use the resumable ${WORKFLOW} state schema.`,
      );
    if (
      retainedState.project !== project ||
      retainedState.arm !== arm ||
      retainedState.engine !== engine.engine
    )
      throw new Error(
        `Run ${runId} does not belong to ${engine.engine}/${project}/${arm}.`,
      );
    if (retainedState.status !== "interrupted")
      throw new Error(
        retainedState.status === "completed"
          ? `Run ${runId} is already complete.`
          : `Run ${runId} is still running; refusing a parallel resume controller.`,
      );
    const state: IState =
      retainedState.schemaVersion === 7
        ? normalizeLegacyTiming(root, retainedState)
        : retainedState;
    assertTimingState(state);

    const workspace: string = path.join(root, "workspace");
    const logs: string = path.join(root, "logs");
    if (!fs.existsSync(workspace) || !fs.existsSync(logs))
      throw new Error(`Run ${runId} has no resumable workspace and logs.`);
    assertStateBaselines(root, state);
    const instructions: IInstruction[] = readFrozenInstructions(root, arm);
    EvidenceBenchmarkTurnLedger.assertAcceptedOrder(state.turns);
    const environment: NodeJS.ProcessEnv = resumeEnvironment(root);
    EvidenceBenchmarkRuntime.apply(environment, state.runtime);
    state.sessionId ??= recoverSessionId(logs, engine.engine);
    if (
      state.sessionId === undefined &&
      state.turns.some((turn) => turn.status === 0)
    )
      throw new Error(
        `Run ${runId} completed a turn but has no recoverable session ID.`,
      );
    const sessionEstablishedByAudit: boolean =
      auditAndInvalidateUnacceptableAcceptedTurns({
        engine,
        instructions,
        repository,
        root,
        state,
        workspace,
      });
    let sessionEstablished: boolean = sessionEstablishedByAudit;
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
            restoration = verifyLintRestoration({
              workspace,
              arm,
              name: entry.name,
              baselines: state.lintBaselines,
            });
            restorationVerified = true;
          } catch {}
          if (
            restorationVerified &&
            restoration === accepted.lintRestorationSha256
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
            }
          writeState(root, state);
        }
        state.status = "running";
        writeState(root, state);
        phase = entry.name;
        const expectedSessionId: string | undefined = state.sessionId;
        const priorSessionEstablished: boolean = sessionEstablished;
        const turn: ITurn = await runTurn({
          repository,
          engine,
          workspace,
          environment,
          logs,
          name: entry.name,
          prompt: entry.content,
          sessionId: state.sessionId,
          resume: sessionEstablished,
        });
        state.sessionId ??= turn.sessionId;
        turn.accepted = false;
        state.turns.push(turn);
        state.agentElapsedMs = sumTurnElapsedMs(state.turns);
        writeState(root, state);
        if (
          turn.status === 0 &&
          (turn.sessionId === undefined ||
            (expectedSessionId !== undefined &&
              turn.sessionId !== expectedSessionId))
        )
          throw new Error(
            `${entry.name} resume attempt did not retain the expected session.`,
          );
        if (turn.status !== 0) {
          state.status = "interrupted";
          writeState(root, state);
          throw new Error(
            `${entry.name} resume attempt exited with status ${String(turn.status)}.`,
          );
        }
        EvidenceBenchmarkTurnLedger.assertSuccessfulAttempt({
          repository,
          runRoot: root,
          workspace,
          engine: engine.engine,
          sessionId: state.sessionId!,
          model: engine.model,
          effort: engine.effort,
          sessionEstablished: priorSessionEstablished,
          turn,
        });
        sessionEstablished ||= turn.sessionId === state.sessionId;
        turn.lintRestorationSha256 = verifyLintRestoration({
          workspace,
          arm,
          name: entry.name,
          baselines: state.lintBaselines,
        });
        turn.accepted = true;
        writeState(root, state);
      }
      state.completedWorkspaceTreeSha256 =
        EvidenceBenchmarkPublication.workspaceSha256(workspace);
      EvidenceBenchmarkTurnLedger.assertAcceptedOrder(state.turns, true);
      promoteWorkspace(repository, engine.engine, project, arm, workspace);
      state.status = "completed";
      writeState(root, state);
    } catch (error) {
      state.status = "interrupted";
      writeState(root, state);
      recordFailure({
        repository,
        runId: runId!,
        root,
        engine: engine.engine,
        project,
        arm,
        phase,
        elapsedMs: state.agentElapsedMs,
        error,
        cleanup: "retained-for-resume",
      });
      throw error;
    }
  }

  function auditAndInvalidateUnacceptableAcceptedTurns(props: {
    engine: EvidenceBenchmarkEngine.IDefinition;
    instructions: readonly IInstruction[];
    repository: string;
    root: string;
    state: IState;
    workspace: string;
  }): boolean {
    if (props.state.sessionId === undefined) return false;
    let sessionEstablished: boolean = false;
    let invalidIndex: number | undefined;
    let invalidName: TurnName | undefined;
    let invalidReason: string | undefined;
    let invalidDenialCount: number | undefined;
    let invalidTurn: ITurn | undefined;
    const inspections: readonly EvidenceBenchmarkTurnLedger.IAttemptInspection[] =
      EvidenceBenchmarkTurnLedger.inspectAttempts({
        repository: props.repository,
        runRoot: props.root,
        workspace: props.workspace,
        engine: props.engine.engine,
        sessionId: props.state.sessionId,
        model: props.engine.model,
        effort: props.engine.effort,
        invocationPolicy: "retained",
        turns: props.state.turns,
      });
    props.state.turns.forEach((turn, turnIndex) => {
      const inspection: EvidenceBenchmarkTurnLedger.IAttemptInspection =
        inspections[turnIndex]!;
      if (
        turn.accepted === true &&
        inspection.verdict === "retryable-incomplete"
      ) {
        const index: number = props.instructions.findIndex(
          (instruction) => instruction.name === turn.name,
        );
        if (index < 0)
          throw new Error(
            `Accepted turn ${turn.name} is outside the frozen workflow.`,
          );
        if (invalidIndex === undefined || index < invalidIndex) {
          invalidIndex = index;
          invalidName = turn.name;
          invalidDenialCount = inspection.denialCount;
          invalidReason = `retained ${String(inspection.denialCount)} native permission denial${
            inspection.denialCount === 1 ? "" : "s"
          }`;
          invalidTurn = turn;
        }
      } else if (
        turn.accepted === true &&
        inspection.verdict !== "acceptable"
      ) {
        throw new Error(
          `Accepted turn ${turn.name} has no acceptable native terminal evidence.`,
        );
      }
      if (inspection.sessionLinked) sessionEstablished = true;
    });
    if (
      invalidIndex === undefined ||
      invalidName === undefined ||
      invalidReason === undefined ||
      invalidDenialCount === undefined ||
      invalidTurn === undefined
    )
      return sessionEstablished;
    for (const turn of props.state.turns)
      if (
        turn.accepted === true &&
        props.instructions.findIndex(
          (instruction) => instruction.name === turn.name,
        ) >= invalidIndex
      ) {
        turn.accepted = false;
        delete turn.lintRestorationSha256;
      }
    invalidTurn.acceptanceInvalidation = {
      code: "permission-denied",
      denialCount: invalidDenialCount,
      stdout: invalidTurn.stdout,
    };
    EvidenceBenchmarkTurnLedger.assertAcceptedOrder(props.state.turns);
    writeState(props.root, props.state);
    process.stderr.write(
      `Invalidated accepted ${invalidName} turn before resume: ${invalidReason}\n`,
    );
    return sessionEstablished;
  }

  async function prepareCell(
    props: ICell & {
      repository: string;
      sourceCommit: string;
      runId: string;
      artifact: IEvidenceBenchmarkPackageArtifact;
      cliVersion: string;
    },
  ): Promise<IPreparedCell> {
    const started: bigint = process.hrtime.bigint();
    const resultsRoot: string = path.resolve(
      props.repository,
      "benchmark",
      "result",
    );
    const root: string = path.resolve(
      resultsRoot,
      props.project,
      props.engine.engine,
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
      const state: IState = {
        schemaVersion: 8,
        workflow: WORKFLOW,
        instructionsTreeSha256: freezeInstructions(root, props.instructions),
        project: props.project,
        arm: props.arm,
        engine: props.engine.engine,
        model: props.engine.model,
        effort: props.engine.effort,
        cliVersion: props.cliVersion,
        sourceCommit: props.sourceCommit,
        lintBaselines: materialization.lintBaselines,
        runtime: props.runtime,
        nonAgentElapsedMs: elapsed(started),
        agentElapsedMs: 0,
        status: "prepared",
        sessionId:
          props.engine.engine === "claude-code"
            ? crypto.randomUUID()
            : undefined,
        turns: [],
      };
      writeState(root, state);
      return {
        repository: props.repository,
        runId: props.runId,
        root,
        project: props.project,
        arm: props.arm,
        engine: props.engine,
        instructions: props.instructions,
        runtime: props.runtime,
        workspace: materialization.workspace,
        environment: materialization.environment,
        state,
      };
    } catch (error) {
      const elapsedMs: number = elapsed(started);
      recordFailure({
        repository: props.repository,
        runId: props.runId,
        root,
        engine: props.engine.engine,
        project: props.project,
        arm: props.arm,
        phase: "setup",
        elapsedMs,
        error,
        cleanup: "cell-removed",
      });
      fs.rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }

  async function runPreparedCell(cell: IPreparedCell): Promise<void> {
    const logs: string = path.join(cell.root, "logs");
    let phase: string = "launch";
    let sessionEstablished: boolean = false;
    try {
      if (
        cell.state.status !== "prepared" ||
        cell.state.turns.length !== 0 ||
        !fs.existsSync(cell.workspace) ||
        !fs.existsSync(logs)
      )
        throw new Error(
          `Benchmark launch barrier found an unprepared ${cell.engine.engine}/${cell.project}/${cell.arm} cell.`,
        );
      cell.state.status = "running";
      writeState(cell.root, cell.state);
      for (const entry of cell.instructions.entries) {
        phase = entry.name;
        const expectedSessionId: string | undefined = cell.state.sessionId;
        const priorSessionEstablished: boolean = sessionEstablished;
        const turn: ITurn = await runTurn({
          repository: cell.repository,
          engine: cell.engine,
          workspace: cell.workspace,
          environment: cell.environment,
          logs,
          name: entry.name,
          prompt: entry.content,
          sessionId: cell.state.sessionId,
          resume: sessionEstablished,
        });
        cell.state.sessionId ??= turn.sessionId;
        turn.accepted = false;
        cell.state.turns.push(turn);
        cell.state.agentElapsedMs = sumTurnElapsedMs(cell.state.turns);
        writeState(cell.root, cell.state);
        if (
          turn.status === 0 &&
          (turn.sessionId === undefined ||
            (expectedSessionId !== undefined &&
              turn.sessionId !== expectedSessionId))
        )
          throw new Error(
            `${entry.name} turn did not retain the expected session.`,
          );
        if (turn.status !== 0)
          throw new Error(
            `${entry.name} turn exited with status ${String(turn.status)}.`,
          );
        EvidenceBenchmarkTurnLedger.assertSuccessfulAttempt({
          repository: cell.repository,
          runRoot: cell.root,
          workspace: cell.workspace,
          engine: cell.engine.engine,
          sessionId: cell.state.sessionId!,
          model: cell.engine.model,
          effort: cell.engine.effort,
          sessionEstablished: priorSessionEstablished,
          turn,
        });
        sessionEstablished ||= turn.sessionId === cell.state.sessionId;
        turn.lintRestorationSha256 = verifyLintRestoration({
          workspace: cell.workspace,
          arm: cell.arm,
          name: entry.name,
          baselines: cell.state.lintBaselines,
        });
        turn.accepted = true;
        writeState(cell.root, cell.state);
      }
      cell.state.completedWorkspaceTreeSha256 =
        EvidenceBenchmarkPublication.workspaceSha256(cell.workspace);
      EvidenceBenchmarkTurnLedger.assertAcceptedOrder(cell.state.turns, true);
      promoteWorkspace(
        cell.repository,
        cell.engine.engine,
        cell.project,
        cell.arm,
        cell.workspace,
      );
      cell.state.status = "completed";
      writeState(cell.root, cell.state);
    } catch (error) {
      cell.state.status = "interrupted";
      writeState(cell.root, cell.state);
      recordFailure({
        repository: cell.repository,
        runId: cell.runId,
        root: cell.root,
        engine: cell.engine.engine,
        project: cell.project,
        arm: cell.arm,
        phase,
        elapsedMs: cell.state.agentElapsedMs,
        error,
        cleanup: "retained-for-resume",
      });
      throw error;
    }
  }

  async function runTurn(props: {
    repository: string;
    engine: EvidenceBenchmarkEngine.IDefinition;
    workspace: string;
    environment: NodeJS.ProcessEnv;
    logs: string;
    name: ITurn["name"];
    prompt: string;
    sessionId?: string;
    resume: boolean;
  }): Promise<ITurn> {
    const cache: string = path.join(path.dirname(props.workspace), "cache");
    fs.mkdirSync(path.join(cache, "agent-home"), { recursive: true });
    fs.mkdirSync(path.join(cache, "os-temp"), { recursive: true });
    const stem: string = logStem(props.logs, props.name);
    const stdoutPath: string = path.join(props.logs, `${stem}.stdout.jsonl`);
    const stderrPath: string = path.join(props.logs, `${stem}.stderr.log`);
    const stdout = fs.createWriteStream(stdoutPath, { flags: "wx" });
    const stderr = fs.createWriteStream(stderrPath, { flags: "wx" });
    const args: string[] =
      props.engine.engine === "codex"
        ? codexTurnArguments(props)
        : claudeTurnArguments(props);
    const executable: { command: string; prefix: string[] } =
      props.engine.engine === "codex" ? codexExecutable() : claudeExecutable();
    const environment: NodeJS.ProcessEnv =
      props.engine.engine === "codex"
        ? props.environment
        : claudeEnvironment(cache, props.environment);
    const child = spawn(executable.command, [...executable.prefix, ...args], {
      cwd: props.workspace,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: "pipe",
    });
    const outcome = new Promise<{
      started: bigint;
      stopped: bigint;
      status: number | null;
    }>((resolve, reject) => {
      let started: bigint | undefined;
      child.once("spawn", () => {
        started = process.hrtime.bigint();
      });
      child.once("error", reject);
      child.once("close", (status) => {
        if (started === undefined)
          reject(new Error("Benchmark engine process closed before spawning."));
        else
          resolve({
            started,
            stopped: process.hrtime.bigint(),
            status,
          });
      });
    });
    let sessionId: string | undefined;
    let remainder: string = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.write(chunk);
      remainder += chunk.toString("utf8");
      const lines: string[] = remainder.split(/\r?\n/);
      remainder = lines.pop() ?? "";
      for (const line of lines)
        try {
          const event: unknown = JSON.parse(line);
          const observed: string | undefined = eventSessionId(
            props.engine.engine,
            event,
          );
          if (observed !== undefined) sessionId = observed;
        } catch {}
    });
    child.stderr.pipe(stderr);
    child.stdin.end(props.prompt, "utf8");
    let result: {
      started: bigint;
      stopped: bigint;
      status: number | null;
    };
    try {
      result = await outcome;
    } finally {
      await Promise.all([
        new Promise<void>((resolve) => stdout.end(resolve)),
        new Promise<void>((resolve) => stderr.end(resolve)),
      ]);
    }
    return {
      name: props.name,
      elapsedMs: Number(result.stopped - result.started) / 1_000_000,
      status: result.status,
      stdout: path.posix.join("logs", path.basename(stdoutPath)),
      stderr: path.posix.join("logs", path.basename(stderrPath)),
      invocation: [executable.command, ...executable.prefix, ...args],
      cwd: props.workspace,
      sessionId,
    };
  }

  function codexTurnArguments(props: {
    repository: string;
    engine: EvidenceBenchmarkEngine.IDefinition;
    workspace: string;
    environment: NodeJS.ProcessEnv;
    sessionId?: string;
    resume: boolean;
  }): string[] {
    const common: string[] = [
      "--json",
      "--enable",
      "goals",
      "--model",
      props.engine.model,
      "--config",
      `model_reasoning_effort=${props.engine.effort}`,
      ...codexIsolationArguments(props.workspace, props.environment),
      "--skip-git-repo-check",
    ];
    if (!props.resume) return ["exec", ...common, "--cd", props.workspace, "-"];
    if (props.sessionId === undefined)
      throw new Error("Codex resume requires a retained session ID.");
    return ["exec", "resume", ...common, props.sessionId, "-"];
  }

  function claudeTurnArguments(props: {
    repository: string;
    engine: EvidenceBenchmarkEngine.IDefinition;
    workspace: string;
    environment: NodeJS.ProcessEnv;
    sessionId?: string;
    resume: boolean;
  }): string[] {
    if (props.sessionId === undefined)
      throw new Error(
        "Claude Code turns require a controller-owned session ID.",
      );
    return [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--forward-subagent-text",
      "--include-hook-events",
      "--model",
      props.engine.model,
      "--effort",
      props.engine.effort,
      ...claudeIsolationArguments(
        props.repository,
        props.workspace,
        props.environment,
      ),
      props.resume ? "--resume" : "--session-id",
      props.sessionId,
    ];
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
      selected.length * EvidenceBenchmarkEngine.MATRIX.length * ARMS.length - 1,
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

  function verifyLintRestoration(props: {
    workspace: string;
    arm: IEvidenceBenchmarkMaterialization.Arm;
    name: TurnName;
    baselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[];
  }): string | undefined {
    if (props.arm !== "evidence") return undefined;
    const selected: readonly string[] | undefined =
      props.name === "backend-final"
        ? EvidenceBenchmarkLintBaseline.BACKEND_PATHS
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

  function normalizeLegacyTiming(root: string, state: ILegacyState): IState {
    const agentElapsedMs: number = sumTurnElapsedMs(state.turns);
    if (!Number.isFinite(state.elapsedMs) || state.elapsedMs < agentElapsedMs)
      throw new Error(
        `Run ${path.basename(root)} has an invalid legacy timing ledger.`,
      );
    const { elapsedMs: legacyControllerElapsedMs, ...retained } = state;
    const normalized: IState = {
      ...retained,
      schemaVersion: 8,
      nonAgentElapsedMs: legacyControllerElapsedMs - agentElapsedMs,
      agentElapsedMs,
      timingNormalization: {
        legacyControllerElapsedMs,
        excludedNonAgentElapsedMs: legacyControllerElapsedMs - agentElapsedMs,
      },
    };
    writeState(root, normalized);
    return normalized;
  }

  function assertTimingState(state: IState): void {
    const retainedAgentElapsedMs: number = sumTurnElapsedMs(state.turns);
    if (
      !Number.isFinite(state.nonAgentElapsedMs) ||
      state.nonAgentElapsedMs < 0 ||
      !Number.isFinite(state.agentElapsedMs) ||
      state.agentElapsedMs < 0 ||
      state.agentElapsedMs !== retainedAgentElapsedMs
    )
      throw new Error(
        "Benchmark state timing must separate non-agent work from exact retained turn time.",
      );
  }

  function writeState(root: string, state: IState): void {
    EvidenceBenchmarkState.write(root, state);
  }

  function sumTurnElapsedMs(turns: readonly ITurn[]): number {
    return turns.reduce((sum, turn) => {
      if (
        typeof turn.elapsedMs !== "number" ||
        !Number.isFinite(turn.elapsedMs) ||
        turn.elapsedMs < 0
      )
        throw new Error("Benchmark turn has an invalid agent duration.");
      const total: number = sum + turn.elapsedMs;
      if (!Number.isFinite(total))
        throw new Error("Benchmark agent duration total is not finite.");
      return total;
    }, 0);
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
    const state: IState = EvidenceBenchmarkState.read(
      root,
      "Frozen instruction state",
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
    };
    EvidenceBenchmarkSetup.configureEnvironment(
      root,
      environment,
      manifest.caches,
    );
    EvidenceBenchmarkProcess.pinEnvironment(
      environment,
      manifest.caches.toolchain,
    );
    return environment;
  }

  function recoverSessionId(
    logs: string,
    engine: EvidenceBenchmarkEngine.Name,
  ): string | undefined {
    for (const file of fs
      .readdirSync(logs)
      .filter((entry) => entry.endsWith(".stdout.jsonl"))
      .sort()) {
      const lines: string[] = fs
        .readFileSync(path.join(logs, file), "utf8")
        .split(/\r?\n/);
      for (const line of lines)
        try {
          const sessionId: string | undefined = eventSessionId(
            engine,
            JSON.parse(line) as unknown,
          );
          if (sessionId !== undefined) return sessionId;
        } catch {}
    }
    return undefined;
  }

  function eventSessionId(
    engine: EvidenceBenchmarkEngine.Name,
    event: unknown,
  ): string | undefined {
    if (typeof event !== "object" || event === null || Array.isArray(event))
      return undefined;
    const record = event as Record<string, unknown>;
    const value: unknown =
      engine === "codex" ? record.thread_id : record.session_id;
    return typeof value === "string" && value.length !== 0 ? value : undefined;
  }

  function claudeEnvironment(
    cache: string,
    environment: NodeJS.ProcessEnv,
  ): NodeJS.ProcessEnv {
    const output: NodeJS.ProcessEnv = {
      ...environment,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-sonnet-5",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-5",
      CLAUDE_CODE_AUTO_CONNECT_IDE: "false",
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: "0",
      CLAUDE_CODE_SUBAGENT_MODEL: "claude-sonnet-5",
      CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1",
      DISABLE_AUTOUPDATER: "1",
    };
    return output;
  }

  function tomlString(value: string): string {
    return JSON.stringify(value);
  }

  function tomlStringMap(values: Readonly<Record<string, string>>): string {
    return `{${Object.entries(values)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${tomlString(key)}=${tomlString(value)}`)
      .join(",")}}`;
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
    engine: EvidenceBenchmarkEngine.Name;
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
        file.startsWith(
          `${props.engine}-${props.project}-${props.arm}-attempt-`,
        ),
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
    let state: unknown;
    try {
      state = EvidenceBenchmarkState.read(props.root, "Failure state");
    } catch {
      state = undefined;
    }
    const target: string = path.join(
      failures,
      `${props.engine}-${props.project}-${props.arm}-attempt-${attempts + 1}.json`,
    );
    fs.writeFileSync(
      target,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          engine: props.engine,
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
      `Benchmark ${props.engine}/${props.project}/${props.arm} failed during ${props.phase}; report: ${target}`,
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
    engine: EvidenceBenchmarkEngine.Name,
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    workspace: string,
  ): void {
    const parent: string = path.join(
      repository,
      "benchmark",
      "result",
      project,
      engine,
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

  function claudeExecutable(): { command: string; prefix: string[] } {
    if (process.platform !== "win32") return { command: "claude", prefix: [] };
    const appData: string | undefined = process.env.APPDATA;
    if (appData === undefined)
      throw new Error("Claude Code discovery on Windows requires APPDATA.");
    const executable: string = path.join(
      appData,
      "npm",
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe",
    );
    if (!fs.existsSync(executable))
      throw new Error(
        `Claude Code CLI executable was not found: ${executable}.`,
      );
    return { command: executable, prefix: [] };
  }

  function claudeVersion(): string {
    const executable: { command: string; prefix: string[] } =
      claudeExecutable();
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
        `Unable to read Claude Code CLI version: ${(result.stderr ?? "").trim()}`,
      );
    const version: string = (result.stdout ?? "").trim();
    const match: RegExpMatchArray | null = version.match(
      /^(\d+)\.(\d+)\.(\d+)(?:\s|$)/,
    );
    if (match === null)
      throw new Error(`Claude Code returned an invalid version: ${version}.`);
    const actual: readonly number[] = match.slice(1).map(Number);
    for (
      let index: number = 0;
      index < CLAUDE_MINIMUM_VERSION.length;
      index++
    ) {
      if (actual[index]! > CLAUDE_MINIMUM_VERSION[index]!) break;
      if (actual[index]! < CLAUDE_MINIMUM_VERSION[index]!)
        throw new Error(
          `Claude Code ${CLAUDE_MINIMUM_VERSION.join(".")} or newer is required for the benchmark adapter; found ${version}.`,
        );
    }
    return version;
  }

  function engineVersion(engine: EvidenceBenchmarkEngine.Name): string {
    return engine === "codex" ? codexVersion() : claudeVersion();
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
