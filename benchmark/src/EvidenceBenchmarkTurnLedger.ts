import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkEngine } from "./EvidenceBenchmarkEngine.ts";

/** Validates the retained order and native evidence of benchmark turns. */
export namespace EvidenceBenchmarkTurnLedger {
  /** Serializes the exact workspace and cache roots of one Codex cell. */
  export function codexWorkspaceRootsConfig(workspace: string): string {
    const roots: readonly string[] = [
      path.resolve(workspace),
      path.resolve(path.dirname(workspace), "cache"),
    ].sort((left, right) => left.localeCompare(right));
    return `{${roots.map((root) => `${JSON.stringify(root)}=true`).join(",")}}`;
  }

  /** Native terminal verdict that permits a retained same-turn retry. */
  export class PermissionDeniedError extends Error {
    /** Captures the exact structured denial count from the native terminal. */
    public constructor(public readonly denialCount: number) {
      super(
        `Benchmark attempt retained ${denialCount} native permission denial${
          denialCount === 1 ? "" : "s"
        }.`,
      );
    }
  }

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

  /** Builds Claude's absolute, workspace-only permission glob. */
  export function claudeWorkspaceGlob(workspace: string): string {
    const resolved: string = path
      .resolve(workspace)
      .replaceAll("\\", "/")
      .replace(/\/+$/, "");
    const drive: RegExpExecArray | null = /^([A-Za-z]):(\/.*)$/.exec(resolved);
    if (drive !== null) return `//${drive[1]!.toLowerCase()}${drive[2]!}/**`;
    if (resolved.startsWith("/")) return `/${resolved}/**`;
    throw new Error("Claude workspace permissions require an absolute path.");
  }

  /** One canonical benchmark instruction name. */
  export type Name = (typeof NAMES)[number];

  /** Invocation contract used when admitting new or auditing retained work. */
  export type InvocationPolicy = "current" | "retained";

  /** Native outcome of one structurally valid retained attempt. */
  export interface IAttemptInspection {
    /** Whether the native stream established the cell session. */
    sessionLinked: boolean;

    /** Whether the process result may be accepted, retried, or only retained. */
    verdict: "acceptable" | "retryable-incomplete" | "process-failed";

    /** Structured retry cause, present only for a retryable incomplete turn. */
    reason?: "permission-denied";

    /** Number of native permission denials retained by the terminal event. */
    denialCount?: number;

    /** Native usage retained even when an attempt is not accepted. */
    usage?: ISummary["tokens"];
  }

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

  /** Inspects one attempt without mutating its retained ledger. */
  export function inspectAttempt(props: {
    /** Source repository blocked from the measured agent's file tools. */
    repository: string;

    /** Exact retained cell root containing the attempt logs. */
    runRoot: string;

    /** Exact measured workspace used as the process working directory. */
    workspace: string;

    /** Fixed coding engine whose native stream is expected. */
    engine: EvidenceBenchmarkEngine.Name;

    /** Session identifier retained for the cell. */
    sessionId: string;

    /** Exact provider model selected by the fixed engine matrix. */
    model: EvidenceBenchmarkEngine.Model;

    /** Explicit reasoning effort selected by the fixed engine matrix. */
    effort: EvidenceBenchmarkEngine.Effort;

    /** Whether an earlier attempt established the retained session. */
    sessionEstablished: boolean;

    /** Invocation contract applied to this attempt. */
    invocationPolicy: InvocationPolicy;

    /** Retained attempt to inspect. */
    turn: ITurn;
  }): IAttemptInspection {
    return inspectRetainedAttempt(props, new Set());
  }

  /** Audits a complete retained attempt ledger before any recovery mutation. */
  export function inspectAttempts(
    props: Omit<
      Parameters<typeof inspectAttempt>[0],
      "sessionEstablished" | "turn"
    > & {
      /** Complete chronological attempt ledger to audit transactionally. */
      turns: readonly ITurn[];
    },
  ): readonly IAttemptInspection[] {
    const retained: Set<string> = new Set();
    const inspections: IAttemptInspection[] = [];
    let sessionEstablished: boolean = false;
    for (const turn of props.turns) {
      const inspection: IAttemptInspection = inspectRetainedAttempt(
        {
          ...props,
          sessionEstablished,
          turn,
        },
        retained,
      );
      inspections.push(inspection);
      if (inspection.sessionLinked) sessionEstablished = true;
    }
    assertExactLogInventory(props.runRoot, retained);
    return inspections;
  }

  /** Requires one process-success attempt to carry acceptable native evidence. */
  export function assertSuccessfulAttempt(
    props: Omit<Parameters<typeof inspectAttempt>[0], "invocationPolicy">,
  ): void {
    const inspection: IAttemptInspection = inspectAttempt({
      ...props,
      invocationPolicy: "current",
    });
    if (inspection.verdict === "retryable-incomplete")
      throw new PermissionDeniedError(inspection.denialCount!);
    if (inspection.verdict !== "acceptable")
      throw new Error(
        `Benchmark attempt ${String(props.turn.name)} did not exit successfully.`,
      );
  }

  function inspectRetainedAttempt(
    props: Parameters<typeof inspectAttempt>[0],
    retained: Set<string>,
  ): IAttemptInspection {
    const definition: EvidenceBenchmarkEngine.IDefinition =
      EvidenceBenchmarkEngine.definition(props.engine);
    if (props.model !== definition.model || props.effort !== definition.effort)
      throw new Error(
        `Benchmark ${props.engine} attempt does not use its fixed model and effort.`,
      );
    if (
      typeof props.turn.name !== "string" ||
      !NAMES.includes(props.turn.name as Name) ||
      typeof props.turn.elapsedMs !== "number" ||
      !Number.isFinite(props.turn.elapsedMs) ||
      props.turn.elapsedMs < 0 ||
      (props.turn.status !== null &&
        (typeof props.turn.status !== "number" ||
          !Number.isInteger(props.turn.status) ||
          props.turn.status < 0)) ||
      typeof props.turn.accepted !== "boolean" ||
      (props.turn.sessionId !== undefined &&
        (typeof props.turn.sessionId !== "string" ||
          props.turn.sessionId.length === 0)) ||
      typeof props.turn.cwd !== "string" ||
      path.resolve(props.turn.cwd) !== path.resolve(props.workspace)
    )
      throw new Error(
        `Benchmark attempt ${String(props.turn.name)} has an invalid retained ledger entry.`,
      );
    const stdout: string = retainedLog(
      props.runRoot,
      props.turn.stdout,
      ".stdout.jsonl",
      retained,
    );
    const stem: string = path.basename(stdout, ".stdout.jsonl");
    if (
      stem !== props.turn.name &&
      new RegExp(
        `^${props.turn.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.attempt-[2-9][0-9]*$`,
      ).test(stem) === false
    )
      throw new Error(
        `Benchmark attempt ${props.turn.name} retained another instruction's log.`,
      );
    retainedLog(
      props.runRoot,
      props.turn.stderr,
      ".stderr.log",
      retained,
      stem,
    );
    const events: Record<string, unknown>[] = readEvents(stdout, props.turn);
    const evidence: IAttemptEvidence =
      props.engine === "codex"
        ? codexEvidence(events, props.sessionId)
        : claudeEvidence(events, props.sessionId, props.model);
    if (
      !Array.isArray(props.turn.invocation) ||
      props.turn.invocation.some((value) => typeof value !== "string")
    )
      throw new Error(
        `Benchmark attempt ${String(props.turn.name)} has no retained invocation.`,
      );
    assertInvocation({
      engine: props.engine,
      invocation: props.turn.invocation as string[],
      repository: props.repository,
      workspace: props.workspace,
      sessionId: props.sessionId,
      model: props.model,
      effort: props.effort,
      sessionEstablished: props.sessionEstablished,
      invocationPolicy: props.invocationPolicy,
    });
    if (
      (evidence.linked && props.turn.sessionId !== props.sessionId) ||
      (!evidence.linked && props.turn.sessionId !== undefined)
    )
      throw new Error(
        `Benchmark attempt ${String(props.turn.name)} is not linked to its retained session identity.`,
      );
    if (props.turn.status !== 0)
      return {
        sessionLinked: evidence.linked,
        verdict: "process-failed",
        ...(evidence.usage === undefined ? {} : { usage: evidence.usage }),
      };
    if (!evidence.linked || !evidence.terminal)
      throw new Error(
        `Benchmark attempt ${String(props.turn.name)} has no complete native terminal evidence.`,
      );
    if (evidence.permissionDenialCount !== undefined)
      return {
        sessionLinked: true,
        verdict: "retryable-incomplete",
        reason: "permission-denied",
        denialCount: evidence.permissionDenialCount,
        ...(evidence.usage === undefined ? {} : { usage: evidence.usage }),
      };
    if (!evidence.acceptable)
      throw new Error(
        `Benchmark attempt ${String(props.turn.name)} has no acceptable native terminal evidence.`,
      );
    return {
      sessionLinked: true,
      verdict: "acceptable",
      ...(evidence.usage === undefined ? {} : { usage: evidence.usage }),
    };
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
    const inspections: readonly IAttemptInspection[] = inspectAttempts({
      engine: props.engine,
      repository: props.repository,
      runRoot: props.runRoot,
      workspace: props.workspace,
      sessionId: props.sessionId,
      model,
      effort,
      invocationPolicy: "retained",
      turns: props.turns,
    });
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
    props.turns.forEach((turn, index) => {
      const inspection: IAttemptInspection = inspections[index]!;
      summary.elapsedMs += Number(turn.elapsedMs);
      if (!Number.isFinite(summary.elapsedMs))
        throw new Error("Benchmark attempt duration total is not finite.");
      if (turn.accepted === true) summary.accepted++;
      if (turn.accepted === true && inspection.verdict !== "acceptable")
        throw new Error(
          `Benchmark attempt ${turn.name} has no successful terminal model-usage proof.`,
        );
      if (inspection.usage !== undefined)
        for (const category of Object.keys(summary.tokens) as Array<
          keyof ISummary["tokens"]
        >) {
          summary.tokens[category] += inspection.usage[category];
          if (!Number.isSafeInteger(summary.tokens[category]))
            throw new Error(
              `Benchmark token category ${category} exceeds the safe integer range.`,
            );
        }
    });
    return summary;
  }

  interface IAttemptEvidence {
    linked: boolean;
    terminal: boolean;
    acceptable: boolean;
    permissionDenialCount?: number;
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
    const terminal: boolean = completed.length === 1 && usage !== undefined;
    return {
      linked,
      terminal,
      acceptable: terminal,
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
    const permissionDenials: unknown = result?.permission_denials;
    const denialList: unknown[] | undefined = Array.isArray(permissionDenials)
      ? permissionDenials
      : undefined;
    const errors: unknown = result?.errors;
    const noErrors: boolean =
      errors === undefined || (Array.isArray(errors) && errors.length === 0);
    const structuredDenials: boolean =
      denialList !== undefined &&
      denialList.every(
        (denial) =>
          isObject(denial) &&
          typeof denial.tool_name === "string" &&
          denial.tool_name.length !== 0,
      );
    const terminal: boolean =
      result?.subtype === "success" &&
      result.is_error === false &&
      result.terminal_reason === "completed" &&
      result.stop_reason === "end_turn" &&
      result.api_error_status === null &&
      denialList !== undefined &&
      usage !== undefined;
    const permissionDenialCount: number | undefined =
      terminal && noErrors && structuredDenials && denialList!.length !== 0
        ? denialList!.length
        : undefined;
    return {
      linked: initializations.length !== 0,
      terminal,
      acceptable:
        terminal && noErrors && denialList!.length === 0 && usage !== undefined,
      ...(permissionDenialCount === undefined ? {} : { permissionDenialCount }),
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

  function assertExactLogInventory(
    runRoot: string,
    retained: ReadonlySet<string>,
  ): void {
    const logs: string = path.resolve(runRoot, "logs");
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
    invocationPolicy: InvocationPolicy;
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
    invocationPolicy: InvocationPolicy;
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
    const expectedRoots: string = codexWorkspaceRootsConfig(props.workspace);
    const legacyRoots: string = `{${JSON.stringify(
      path.resolve(path.dirname(props.workspace), "cache"),
    )}=true}`;
    const retainedRoots: string | undefined = configValue(
      args,
      "permissions.benchmark.workspace_roots",
    );
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
      ) ||
      configValue(args, "permissions.benchmark.filesystem.:workspace_roots") !==
        '{"."="write"}' ||
      (props.invocationPolicy === "current"
        ? retainedRoots !== expectedRoots
        : retainedRoots !== expectedRoots && retainedRoots !== legacyRoots)
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
    invocationPolicy: InvocationPolicy;
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
    const workspaceGlob: string = claudeWorkspaceGlob(props.workspace);
    const currentAllowedTools: string[] = [
      "Bash",
      `Edit(${workspaceGlob})`,
      `Write(${workspaceGlob})`,
      `Read(${workspaceGlob})`,
      "Agent",
    ];
    const legacyAllowedTools: string[] = [
      "Bash",
      "Edit(./**)",
      "Read(./**)",
      "Agent",
    ];
    const retainedAllowedTools: string | undefined = option(
      args,
      "--allowedTools",
    );
    const allowedTools: string[] | undefined =
      retainedAllowedTools === currentAllowedTools.join(",")
        ? currentAllowedTools
        : props.invocationPolicy === "retained" &&
            retainedAllowedTools === legacyAllowedTools.join(",")
          ? legacyAllowedTools
          : undefined;
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
      allowedTools === undefined ||
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
      allowedTools,
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
    allowedTools: readonly string[],
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
      JSON.stringify(permissions.allow) !== JSON.stringify(allowedTools) ||
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

  function configValue(
    args: readonly string[],
    key: string,
  ): string | undefined {
    const prefix: string = `${key}=`;
    const matches: string[] = args.flatMap((value, index) =>
      value === "--config" && args[index + 1]?.startsWith(prefix) === true
        ? [args[index + 1]!.slice(prefix.length)]
        : [],
    );
    if (matches.length > 1)
      throw new Error(`Benchmark invocation repeats config ${key}.`);
    return matches[0];
  }
}
