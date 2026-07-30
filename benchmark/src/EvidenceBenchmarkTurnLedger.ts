import fs from "node:fs";
import path from "node:path";

/** Validates the retained order of accepted benchmark turns. */
export namespace EvidenceBenchmarkTurnLedger {
  /** Canonical measured turn order shared by both benchmark arms. */
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

  /** Retained fields needed to admit an accepted turn. */
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

    /** Machine-gate acceptance written after the process succeeds. */
    accepted?: unknown;

    /** Thread observed from this attempt's native event stream. */
    threadId?: unknown;
  }

  /** Retained attempt totals bound into the operator report. */
  export interface ISummary {
    elapsedMs: number;
    attempts: number;
    accepted: number;
    tokens: {
      input_tokens: number;
      cached_input_tokens: number;
      output_tokens: number;
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

  /** Verifies retained logs, terminal events, thread linkage, and invocation. */
  export function assertRetainedEvidence(props: {
    runRoot: string;
    workspace: string;
    threadId: string;
    model: string;
    effort: string;
    turns: readonly ITurn[];
  }): ISummary {
    assertAcceptedOrder(props.turns, true);
    const retained: Set<string> = new Set();
    const summary: ISummary = {
      elapsedMs: 0,
      attempts: props.turns.length,
      accepted: 0,
      tokens: {
        input_tokens: 0,
        cached_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
      },
    };
    let threadEstablished: boolean = false;
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
        (turn.threadId !== undefined &&
          (typeof turn.threadId !== "string" || turn.threadId.length === 0)) ||
        !Array.isArray(turn.invocation) ||
        turn.invocation.length === 0 ||
        turn.invocation.some((value) => typeof value !== "string")
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
            `Benchmark attempt ${turn.name} has malformed JSONL output.`,
          );
        }
      });
      const objects: Record<string, unknown>[] = events.filter(
        (event): event is Record<string, unknown> =>
          typeof event === "object" && event !== null && !Array.isArray(event),
      );
      const linked: boolean = objects.some(
        (event) =>
          event.type === "thread.started" && event.thread_id === props.threadId,
      );
      if ((turn.accepted === true || turn.status === 0) && !linked)
        throw new Error(
          `Benchmark attempt ${turn.name} is not linked to the retained thread.`,
        );
      if (
        (turn.accepted === true || turn.status === 0) &&
        turn.threadId !== props.threadId
      )
        throw new Error(
          `Benchmark attempt ${turn.name} retained the wrong thread identity.`,
        );
      const completedEvents: Record<string, unknown>[] = objects.filter(
        (event) => event.type === "turn.completed",
      );
      if (completedEvents.length > 1)
        throw new Error(
          `Benchmark attempt ${turn.name} has multiple terminal events.`,
        );
      const usage: ISummary["tokens"] | undefined =
        completedEvents[0] === undefined
          ? undefined
          : readUsage(completedEvents[0].usage);
      if ((turn.accepted === true || turn.status === 0) && usage === undefined)
        throw new Error(
          `Benchmark attempt ${turn.name} has no terminal model-usage proof.`,
        );
      if (usage !== undefined)
        for (const category of Object.keys(summary.tokens) as Array<
          keyof ISummary["tokens"]
        >) {
          summary.tokens[category] += usage[category];
          if (!Number.isSafeInteger(summary.tokens[category]))
            throw new Error(
              `Benchmark token category ${category} exceeds the safe integer range.`,
            );
        }
      assertInvocation({
        invocation: turn.invocation as string[],
        workspace: props.workspace,
        threadId: props.threadId,
        model: props.model,
        effort: props.effort,
        threadEstablished,
      });
      if (linked) threadEstablished = true;
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

  function readUsage(value: unknown): ISummary["tokens"] | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return undefined;
    const usage = value as Record<string, unknown>;
    const categories = [
      "input_tokens",
      "cached_input_tokens",
      "output_tokens",
      "reasoning_output_tokens",
    ] as const;
    if (
      categories.some(
        (category) =>
          typeof usage[category] !== "number" ||
          !Number.isFinite(usage[category]) ||
          !Number.isSafeInteger(usage[category]) ||
          usage[category] < 0,
      ) ||
      Number(usage.cached_input_tokens) > Number(usage.input_tokens) ||
      Number(usage.input_tokens) + Number(usage.output_tokens) <= 0
    )
      return undefined;
    return Object.fromEntries(
      categories.map((category) => [category, usage[category]]),
    ) as ISummary["tokens"];
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
    invocation: readonly string[];
    workspace: string;
    threadId: string;
    model: string;
    effort: string;
    threadEstablished: boolean;
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
    const option = (name: string): string | undefined => {
      const index: number = args.indexOf(name);
      return index < 0 ? undefined : args[index + 1];
    };
    if (
      !args.includes("--json") ||
      option("--enable") !== "goals" ||
      option("--model") !== props.model ||
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
        "Benchmark attempt does not retain the required model, effort, goal, and isolation invocation.",
      );
    if (
      resumed
        ? !args.includes(props.threadId) || args.at(-1) !== "-"
        : option("--cd") !== props.workspace || args.at(-1) !== "-"
    )
      throw new Error(
        "Benchmark attempt does not retain its workspace or thread invocation.",
      );
    if (props.threadEstablished && !resumed)
      throw new Error(
        "Benchmark attempt started a new thread after the run thread was established.",
      );
  }
}
