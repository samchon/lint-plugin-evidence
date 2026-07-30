import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkEngine } from "./EvidenceBenchmarkEngine.ts";

/** Validates the retained order and native evidence of benchmark turns. */
export namespace EvidenceBenchmarkTurnLedger {
  /** Canonical measured turn order shared by both benchmark arms and engines. */
  export const NAMES = [
    "skills-contract",
    "backend-start",
    "backend-review",
    "backend-final",
    "frontend-start",
    "frontend-review",
    "frontend-final",
    "overall-review",
    "overall-final",
  ] as const;

  /** One canonical benchmark instruction name. */
  export type Name = (typeof NAMES)[number];

  /** Retained fields needed to admit and audit one model-process attempt. */
  export interface ITurn {
    /** Reported instruction name. */
    name?: unknown;

    /** Child-process exit status. */
    status?: unknown;

    /** Measured child-process duration. */
    elapsedMs?: unknown;

    /** Relative retained standard-output log. */
    stdout?: unknown;

    /** Relative retained standard-error log. */
    stderr?: unknown;

    /** Exact child-process command and arguments. */
    invocation?: unknown;

    /** Exact child-process working directory. */
    cwd?: unknown;

    /** Machine-gate acceptance written after the process succeeds. */
    accepted?: unknown;

    /** Engine session observed from this attempt's native event stream. */
    sessionId?: unknown;
  }

  /** Retained attempt totals bound into the operator report. */
  export interface ISummary {
    /** Sum of every measured model-process attempt. */
    elapsedMs: number;

    /** Number of retained attempts, including rejected work. */
    attempts: number;

    /** Number of machine-gate accepted attempts. */
    accepted: number;

    /** Superset of the native token categories emitted by both fixed engines. */
    tokens: {
      /** Non-cached input tokens reported by the engine. */
      input_tokens: number;

      /** Cached input reads, including Claude's cache-read category. */
      cached_input_tokens: number;

      /** Claude cache-creation input tokens; zero for Codex. */
      cache_creation_input_tokens: number;

      /** Generated output tokens reported by the engine. */
      output_tokens: number;

      /** Codex reasoning output tokens; zero for Claude Code. */
      reasoning_output_tokens: number;
    };
  }

  /** Requires accepted successes to form a canonical prefix or complete ledger. */
  export function assertAcceptedOrder(
    turns: readonly ITurn[],
    complete: boolean = false,
  ): void {
    const accepted: readonly ITurn[] = turns.filter(
      (turn) => turn.accepted === true,
    );
    if (
      accepted.some(
        (turn) =>
          turn.status !== 0 ||
          !Array.isArray(turn.invocation) ||
          turn.invocation.some((value) => typeof value !== "string"),
      )
    )
      throw new Error(
        "Accepted benchmark turns must retain successful invocations.",
      );
    const actual: readonly unknown[] = accepted.map((turn) => turn.name);
    const expected: readonly Name[] = NAMES.slice(0, accepted.length);
    if (
      accepted.length > NAMES.length ||
      JSON.stringify(actual) !== JSON.stringify(expected) ||
      (complete && accepted.length !== NAMES.length)
    )
      throw new Error(
        "Accepted benchmark turns do not form the canonical instruction prefix.",
      );
  }

  /** Verifies retained logs, terminal events, session linkage, and invocation. */
  export function assertRetainedEvidence(props: {
    /** Source repository blocked from the measured agent's file tools. */
    repository: string;

    /** Exact retained cell root containing the attempt ledger and logs. */
    runRoot: string;

    /** Exact measured workspace used as every model process's working tree. */
    workspace: string;

    /** Fixed coding engine whose native stream and invocation are expected. */
    engine: EvidenceBenchmarkEngine.Name;

    /** Session identifier shared by every accepted turn in this cell. */
    sessionId: string;

    /** Exact provider model selected by the fixed engine matrix. */
    model: unknown;

    /** Explicit reasoning effort selected by the fixed engine matrix. */
    effort: unknown;

    /** Complete retained attempt sequence, including rejected work. */
    turns: readonly ITurn[];
  }): ISummary {
    const definition: EvidenceBenchmarkEngine.IDefinition =
      EvidenceBenchmarkEngine.definition(props.engine);
    if (props.model !== definition.model || props.effort !== definition.effort)
      throw new Error(
        `Benchmark ${props.engine} attempt does not use its fixed model and effort.`,
      );
    const model: EvidenceBenchmarkEngine.Model = definition.model;
    const effort: EvidenceBenchmarkEngine.Effort = definition.effort;
    assertAcceptedOrder(props.turns, true);
    const retained: Set<string> = new Set();
    const summary: ISummary = {
      elapsedMs: 0,
      attempts: props.turns.length,
      accepted: 0,
      tokens: {
        input_tokens: 0,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
      },
    };
    let sessionEstablished: boolean = false;
    for (const turn of props.turns) {
      if (
        typeof turn.name !== "string" ||
        !NAMES.includes(turn.name as Name) ||
        typeof turn.elapsedMs !== "number" ||
        !Number.isFinite(turn.elapsedMs) ||
        turn.elapsedMs < 0 ||
        (turn.status !== null &&
          (typeof turn.status !== "number" ||
            !Number.isInteger(turn.status) ||
            turn.status < 0)) ||
        typeof turn.accepted !== "boolean" ||
        (turn.sessionId !== undefined &&
          (typeof turn.sessionId !== "string" ||
            turn.sessionId.length === 0)) ||
        !Array.isArray(turn.invocation) ||
        turn.invocation.length === 0 ||
        turn.invocation.some((value) => typeof value !== "string") ||
        typeof turn.cwd !== "string" ||
        path.resolve(turn.cwd) !== path.resolve(props.workspace)
      )
        throw new Error(
          `Benchmark attempt ${String(turn.name)} has an invalid retained ledger entry.`,
        );
      summary.elapsedMs += turn.elapsedMs;
      if (!Number.isFinite(summary.elapsedMs))
        throw new Error("Benchmark attempt duration total is not finite.");
      if (turn.accepted === true) summary.accepted++;

      const stdout: string = retainedLog(
        props.runRoot,
        turn.stdout,
        ".stdout.jsonl",
        retained,
      );
      const stem: string = path.basename(stdout, ".stdout.jsonl");
      if (
        stem !== turn.name &&
        new RegExp(
          `^${turn.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.attempt-[2-9][0-9]*$`,
        ).test(stem) === false
      )
        throw new Error(
          `Benchmark attempt ${turn.name} retained another instruction's log.`,
        );
      retainedLog(props.runRoot, turn.stderr, ".stderr.log", retained, stem);
      const objects: Record<string, unknown>[] = readEvents(stdout, turn);
      const evidence: IAttemptEvidence =
        props.engine === "codex"
          ? codexEvidence(objects, props.sessionId)
          : claudeEvidence(objects, props.sessionId, model);
      if ((turn.accepted === true || turn.status === 0) && !evidence.linked)
        throw new Error(
          `Benchmark attempt ${turn.name} is not linked to the retained ${props.engine} session.`,
        );
      if (
        (turn.accepted === true || turn.status === 0) &&
        turn.sessionId !== props.sessionId
      )
        throw new Error(
          `Benchmark attempt ${turn.name} retained the wrong session identity.`,
        );
      if ((turn.accepted === true || turn.status === 0) && !evidence.completed)
        throw new Error(
          `Benchmark attempt ${turn.name} has no successful terminal model-usage proof.`,
        );
      if (evidence.usage !== undefined)
        for (const category of Object.keys(summary.tokens) as Array<
          keyof ISummary["tokens"]
        >) {
          summary.tokens[category] += evidence.usage[category];
          if (!Number.isSafeInteger(summary.tokens[category]))
            throw new Error(
              `Benchmark token category ${category} exceeds the safe integer range.`,
            );
        }
      assertInvocation({
        engine: props.engine,
        invocation: turn.invocation as string[],
        repository: props.repository,
        workspace: props.workspace,
        sessionId: props.sessionId,
        model,
        effort,
        sessionEstablished,
      });
      if (evidence.linked) sessionEstablished = true;
    }
    const logs: string = path.resolve(props.runRoot, "logs");
    const actualLogs: string[] = fs
      .readdirSync(logs, { withFileTypes: true })
      .map((entry) => {
        if (!entry.isFile() || entry.isSymbolicLink())
          throw new Error(
            `Benchmark log inventory contains a non-regular entry: ${entry.name}.`,
          );
        return path.resolve(logs, entry.name);
      })
      .sort();
    if (JSON.stringify(actualLogs) !== JSON.stringify([...retained].sort()))
      throw new Error(
        "Benchmark log inventory does not exactly match the retained attempt ledger.",
      );
    return summary;
  }

  interface IAttemptEvidence {
    linked: boolean;
    completed: boolean;
    usage?: ISummary["tokens"];
  }

  function readEvents(stdout: string, turn: ITurn): Record<string, unknown>[] {
    const lines: string[] = fs
      .readFileSync(stdout, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.length !== 0);
    const events: unknown[] = [];
    lines.forEach((line, index) => {
      try {
        events.push(JSON.parse(line) as unknown);
      } catch {
        if (
          turn.accepted === false &&
          turn.status !== 0 &&
          index === lines.length - 1
        )
          return;
        throw new Error(
          `Benchmark attempt ${String(turn.name)} has malformed JSONL output.`,
        );
      }
    });
    return events.filter(
      (event): event is Record<string, unknown> =>
        typeof event === "object" && event !== null && !Array.isArray(event),
    );
  }

  function codexEvidence(
    events: readonly Record<string, unknown>[],
    sessionId: string,
  ): IAttemptEvidence {
    const starts: readonly Record<string, unknown>[] = events.filter(
      (event) => event.type === "thread.started",
    );
    if (starts.some((event) => event.thread_id !== sessionId))
      throw new Error("Benchmark Codex attempt has the wrong thread identity.");
    const linked: boolean = starts.length !== 0;
    const completed: readonly Record<string, unknown>[] = events.filter(
      (event) => event.type === "turn.completed",
    );
    if (completed.length > 1)
      throw new Error("Benchmark Codex attempt has multiple terminal events.");
    const usage: ISummary["tokens"] | undefined =
      completed[0] === undefined
        ? undefined
        : readCodexUsage(completed[0].usage);
    return {
      linked,
      completed: completed.length === 1 && usage !== undefined,
      ...(usage === undefined ? {} : { usage }),
    };
  }

  function claudeEvidence(
    events: readonly Record<string, unknown>[],
    sessionId: string,
    model: string,
  ): IAttemptEvidence {
    const systems: readonly Record<string, unknown>[] = events.filter(
      (event) => event.type === "system",
    );
    if (systems.some((event) => event.session_id !== sessionId))
      throw new Error(
        "Benchmark Claude Code system event has the wrong session identity.",
      );
    const initializations: readonly Record<string, unknown>[] = systems.filter(
      (event) => event.type === "system" && event.subtype === "init",
    );
    if (
      initializations.some(
        (event) => event.session_id !== sessionId || event.model !== model,
      )
    )
      throw new Error(
        "Benchmark Claude Code attempt has a mismatched session or model initialization.",
      );
    const results: readonly Record<string, unknown>[] = events.filter(
      (event) => event.type === "result",
    );
    if (results.length > 1)
      throw new Error(
        "Benchmark Claude Code attempt has multiple terminal events.",
      );
    const result: Record<string, unknown> | undefined = results[0];
    if (result !== undefined && result.session_id !== sessionId)
      throw new Error(
        "Benchmark Claude Code terminal event has the wrong session identity.",
      );
    const usage: ISummary["tokens"] | undefined =
      result === undefined ? undefined : readClaudeUsage(result, model);
    return {
      linked: initializations.length !== 0,
      completed:
        result?.subtype === "success" &&
        result.is_error === false &&
        usage !== undefined,
      ...(usage === undefined ? {} : { usage }),
    };
  }

  function readCodexUsage(value: unknown): ISummary["tokens"] | undefined {
    if (!isObject(value)) return undefined;
    const categories = [
      "input_tokens",
      "cached_input_tokens",
      "output_tokens",
      "reasoning_output_tokens",
    ] as const;
    if (
      categories.some((category) => !isTokenCount(value[category])) ||
      Number(value.cached_input_tokens) > Number(value.input_tokens) ||
      Number(value.input_tokens) + Number(value.output_tokens) <= 0
    )
      return undefined;
    return {
      input_tokens: Number(value.input_tokens),
      cached_input_tokens: Number(value.cached_input_tokens),
      cache_creation_input_tokens: 0,
      output_tokens: Number(value.output_tokens),
      reasoning_output_tokens: Number(value.reasoning_output_tokens),
    };
  }

  function readClaudeUsage(
    result: Readonly<Record<string, unknown>>,
    model: string,
  ): ISummary["tokens"] | undefined {
    const modelUsage: unknown = result.modelUsage;
    if (!isObject(modelUsage))
      throw new Error(
        "Benchmark Claude Code terminal event has no per-model usage ledger.",
      );
    const models: string[] = Object.keys(modelUsage);
    if (models.some((candidate) => candidate !== model))
      throw new Error(
        `Benchmark Claude Code attempt used an unselected model: ${models.join(", ")}.`,
      );
    const usage: unknown = result.usage;
    if (!isObject(usage)) return undefined;
    const categories = [
      "input_tokens",
      "cache_creation_input_tokens",
      "cache_read_input_tokens",
      "output_tokens",
    ] as const;
    if (
      categories.some((category) => !isTokenCount(usage[category])) ||
      Number(usage.input_tokens) +
        Number(usage.cache_creation_input_tokens) +
        Number(usage.cache_read_input_tokens) +
        Number(usage.output_tokens) <=
        0 ||
      (result.subtype === "success" &&
        (models.length !== 1 || models[0] !== model))
    )
      return undefined;
    return {
      input_tokens: Number(usage.input_tokens),
      cached_input_tokens: Number(usage.cache_read_input_tokens),
      cache_creation_input_tokens: Number(usage.cache_creation_input_tokens),
      output_tokens: Number(usage.output_tokens),
      reasoning_output_tokens: 0,
    };
  }

  function isTokenCount(value: unknown): value is number {
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isSafeInteger(value) &&
      value >= 0
    );
  }

  function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function retainedLog(
    runRoot: string,
    relative: unknown,
    suffix: string,
    retained: Set<string>,
    expectedStem?: string,
  ): string {
    if (
      typeof relative !== "string" ||
      path.isAbsolute(relative) ||
      !relative.startsWith("logs/") ||
      !relative.endsWith(suffix) ||
      relative.includes("\\") ||
      path.posix.normalize(relative) !== relative
    )
      throw new Error(`Benchmark attempt has an unsafe ${suffix} log.`);
    const logs: string = path.resolve(runRoot, "logs");
    const logsStat: fs.Stats | undefined = fs.lstatSync(logs, {
      throwIfNoEntry: false,
    });
    if (!logsStat?.isDirectory() || logsStat.isSymbolicLink())
      throw new Error("Benchmark log root is not retained.");
    const location: string = path.resolve(runRoot, ...relative.split("/"));
    const relation: string = path.relative(logs, location);
    if (
      relation === "" ||
      relation === ".." ||
      relation.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relation) ||
      retained.has(location)
    )
      throw new Error(`Benchmark attempt has a reused ${suffix} log.`);
    const stat: fs.Stats | undefined = fs.lstatSync(location, {
      throwIfNoEntry: false,
    });
    if (!stat?.isFile() || stat.isSymbolicLink())
      throw new Error(`Benchmark attempt log is not retained: ${relative}.`);
    if (
      expectedStem !== undefined &&
      path.basename(location, suffix) !== expectedStem
    )
      throw new Error("Benchmark attempt stdout and stderr logs do not pair.");
    retained.add(location);
    return location;
  }

  function assertInvocation(props: {
    engine: EvidenceBenchmarkEngine.Name;
    invocation: readonly string[];
    repository: string;
    workspace: string;
    sessionId: string;
    model: string;
    effort: string;
    sessionEstablished: boolean;
  }): void {
    if (props.engine === "codex") assertCodexInvocation(props);
    else assertClaudeInvocation(props);
  }

  function assertCodexInvocation(props: {
    invocation: readonly string[];
    repository: string;
    workspace: string;
    sessionId: string;
    model: string;
    effort: string;
    sessionEstablished: boolean;
  }): void {
    const execIndex: number = props.invocation.indexOf("exec");
    const launcherTrusted: boolean =
      (execIndex === 1 &&
        /^(?:codex|codex\.exe)$/i.test(path.basename(props.invocation[0]!))) ||
      (execIndex === 2 &&
        path.resolve(props.invocation[0]!) === path.resolve(process.execPath) &&
        path.basename(props.invocation[1]!).toLowerCase() === "codex.js" &&
        props.invocation[1]!.replaceAll("\\", "/").includes(
          "/@openai/codex/bin/",
        ));
    if (!launcherTrusted)
      throw new Error("Benchmark attempt has an untrusted Codex launcher.");
    const args: readonly string[] = props.invocation.slice(execIndex + 1);
    const resumed: boolean = args[0] === "resume";
    if (
      !args.includes("--json") ||
      option(args, "--enable") !== "goals" ||
      option(args, "--model") !== props.model ||
      !args.includes(`model_reasoning_effort=${props.effort}`) ||
      !args.includes("--ignore-user-config") ||
      !args.includes("--ignore-rules") ||
      !args.includes("--strict-config") ||
      !args.includes('approval_policy="never"') ||
      args.includes("--dangerously-bypass-approvals-and-sandbox") ||
      args.some((value) =>
        value.includes("shell_environment_policy.inherit=all"),
      )
    )
      throw new Error(
        "Benchmark Codex attempt does not retain the required model, effort, goal, and isolation invocation.",
      );
    if (
      resumed
        ? !args.includes(props.sessionId) || args.at(-1) !== "-"
        : option(args, "--cd") !== props.workspace || args.at(-1) !== "-"
    )
      throw new Error(
        "Benchmark Codex attempt does not retain its workspace or session invocation.",
      );
    if (props.sessionEstablished && !resumed)
      throw new Error(
        "Benchmark Codex attempt started a new session after the run session was established.",
      );
  }

  function assertClaudeInvocation(props: {
    invocation: readonly string[];
    repository: string;
    workspace: string;
    sessionId: string;
    model: string;
    effort: string;
    sessionEstablished: boolean;
  }): void {
    const launcher: string = props.invocation[0]!;
    const basename: string = path.basename(launcher).toLowerCase();
    const trusted: boolean =
      process.platform === "win32"
        ? basename === "claude.exe" &&
          path.isAbsolute(launcher) &&
          launcher
            .replaceAll("\\", "/")
            .toLowerCase()
            .includes("/@anthropic-ai/claude-code/bin/claude.exe")
        : basename === "claude" || basename === "claude.exe";
    if (!trusted)
      throw new Error(
        "Benchmark attempt has an untrusted Claude Code launcher.",
      );
    const args: readonly string[] = props.invocation.slice(1);
    const forbidden: readonly string[] = [
      "--allow-dangerously-skip-permissions",
      "--bare",
      "--continue",
      "--dangerously-skip-permissions",
      "--fork-session",
      "--no-session-persistence",
    ];
    if (
      !args.includes("-p") ||
      option(args, "--output-format") !== "stream-json" ||
      !args.includes("--verbose") ||
      !args.includes("--forward-subagent-text") ||
      !args.includes("--include-hook-events") ||
      option(args, "--model") !== props.model ||
      option(args, "--effort") !== props.effort ||
      option(args, "--permission-mode") !== "dontAsk" ||
      option(args, "--tools") !== "Bash,Edit,Write,Read,Glob,Grep,Agent" ||
      option(args, "--allowedTools") !== "Bash,Edit(./**),Read(./**),Agent" ||
      option(args, "--disallowedTools") !== "WebFetch,WebSearch" ||
      option(args, "--setting-sources") !== "" ||
      !args.includes("--strict-mcp-config") ||
      !args.includes("--disable-slash-commands") ||
      !args.includes("--no-chrome") ||
      option(args, "--prompt-suggestions") !== "false" ||
      forbidden.some((flag) => args.includes(flag)) ||
      args.some(
        (value) =>
          value === "--fallback-model" || value.startsWith("--fallback-model="),
      )
    )
      throw new Error(
        "Benchmark Claude Code attempt does not retain the required model, effort, tools, and isolation invocation.",
      );
    assertClaudeMcpConfig(option(args, "--mcp-config"));
    assertClaudeSettings(
      option(args, "--settings"),
      props.repository,
      props.workspace,
      !(path.isAbsolute(launcher) && basename === "claude.exe"),
    );
    const resumed: boolean = option(args, "--resume") !== undefined;
    if (
      resumed
        ? option(args, "--resume") !== props.sessionId ||
          option(args, "--session-id") !== undefined
        : option(args, "--session-id") !== props.sessionId
    )
      throw new Error(
        "Benchmark Claude Code attempt does not retain its exact session invocation.",
      );
    if (props.sessionEstablished && !resumed)
      throw new Error(
        "Benchmark Claude Code attempt started a new session after the run session was established.",
      );
  }

  function assertClaudeMcpConfig(value: string | undefined): void {
    let parsed: unknown;
    try {
      parsed = value === undefined ? undefined : JSON.parse(value);
    } catch {
      parsed = undefined;
    }
    if (
      !isObject(parsed) ||
      !isObject(parsed.mcpServers) ||
      Object.keys(parsed.mcpServers).length !== 0
    )
      throw new Error(
        "Benchmark Claude Code attempt does not retain an empty strict MCP configuration.",
      );
  }

  function assertClaudeSettings(
    value: string | undefined,
    repository: string,
    workspace: string,
    sandboxSupported: boolean,
  ): void {
    let parsed: unknown;
    try {
      parsed = value === undefined ? undefined : JSON.parse(value);
    } catch {
      parsed = undefined;
    }
    const settings: Record<string, unknown> | undefined = isObject(parsed)
      ? parsed
      : undefined;
    const sandbox: unknown = settings?.sandbox;
    const permissions: unknown = settings?.permissions;
    const environment: unknown = settings?.env;
    const filesystem: unknown = isObject(sandbox)
      ? sandbox.filesystem
      : undefined;
    const credentials: unknown = isObject(sandbox)
      ? sandbox.credentials
      : undefined;
    const envVariables: unknown = isObject(credentials)
      ? credentials.envVars
      : undefined;
    const network: unknown = isObject(sandbox) ? sandbox.network : undefined;
    const domains: unknown = isObject(network)
      ? network.allowedDomains
      : undefined;
    const excluded: unknown = isObject(sandbox)
      ? sandbox.excludedCommands
      : undefined;
    if (
      !isObject(sandbox) ||
      !isObject(permissions) ||
      JSON.stringify(permissions.allow) !==
        JSON.stringify(["Bash", "Edit(./**)", "Read(./**)", "Agent"]) ||
      JSON.stringify(permissions.deny) !==
        JSON.stringify(["WebFetch", "WebSearch"]) ||
      sandbox.enabled !== sandboxSupported ||
      sandbox.failIfUnavailable !== sandboxSupported ||
      sandbox.allowUnsandboxedCommands !== false ||
      !isObject(filesystem) ||
      JSON.stringify(filesystem.denyRead) !==
        JSON.stringify([
          "~/",
          path.resolve(repository),
          path.dirname(workspace),
        ]) ||
      JSON.stringify(filesystem.allowRead) !==
        JSON.stringify([
          workspace,
          path.join(path.dirname(workspace), "cache"),
        ]) ||
      JSON.stringify(filesystem.allowWrite) !==
        JSON.stringify([path.join(path.dirname(workspace), "cache")]) ||
      !Array.isArray(envVariables) ||
      envVariables.some(
        (entry) =>
          !isObject(entry) ||
          typeof entry.name !== "string" ||
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name) ||
          entry.mode !== "deny",
      ) ||
      ![
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "OPENAI_API_KEY",
      ].every((name) =>
        envVariables.some((entry) => isObject(entry) && entry.name === name),
      ) ||
      !isObject(environment) ||
      environment.ANTHROPIC_DEFAULT_HAIKU_MODEL !== "claude-sonnet-5" ||
      environment.ANTHROPIC_DEFAULT_SONNET_MODEL !== "claude-sonnet-5" ||
      environment.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS !== "0" ||
      environment.CLAUDE_CODE_SUBAGENT_MODEL !== "claude-sonnet-5" ||
      environment.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB !== "1" ||
      settings?.autoMemoryEnabled !== false ||
      (excluded !== undefined &&
        (!Array.isArray(excluded) || excluded.length !== 0)) ||
      !Array.isArray(domains) ||
      domains.some((domain) => typeof domain !== "string") ||
      JSON.stringify([...domains].sort()) !==
        JSON.stringify(["127.0.0.1", "localhost"]) ||
      (isObject(network) &&
        (network.httpProxyPort !== undefined ||
          network.socksProxyPort !== undefined ||
          network.allowAllUnixSockets === true))
    )
      throw new Error(
        "Benchmark Claude Code attempt does not retain the required local policy and supported-host sandbox settings.",
      );
  }

  function option(args: readonly string[], name: string): string | undefined {
    const indexes: number[] = args.flatMap((value, index) =>
      value === name ? [index] : [],
    );
    if (indexes.length > 1)
      throw new Error(`Benchmark invocation repeats option ${name}.`);
    return indexes[0] === undefined ? undefined : args[indexes[0] + 1];
  }
}
