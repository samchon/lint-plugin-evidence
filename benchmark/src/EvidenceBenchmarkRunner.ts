import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export namespace EvidenceBenchmarkRunner {
  export type EvidenceBenchmarkArm = "evidence" | "plain";

  export interface IEvidenceBenchmarkTokenUsage {
    totalTokens: number;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteInputTokens: number;
    outputTokens: number;
    reasoningOutputTokens: number;
  }

  export interface IEvidenceBenchmarkOutput {
    sequence: number;
    elapsedMs: number;
    stream: "stdin" | "stdout" | "stderr";
    text: string;
  }

  export interface IEvidenceBenchmarkProcessRecord {
    command: string;
    arguments: string[];
    elapsedMs: number;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }

  export interface IEvidenceBenchmarkInterruption {
    name: string;
    message: string;
    stack?: string;
    detail?: unknown;
  }

  export interface IEvidenceBenchmarkGoalRecord {
    index: number;
    name: string;
    relativePath: string;
    prescribedText: string;
    continuationText: string;
    objectiveText: string;
    goal: Record<string, unknown> | null;
    terminalTurnId: string | null;
    terminalTurnCompleted: boolean;
    threadIdle: boolean;
    tokenUsageStart: IEvidenceBenchmarkTokenUsage;
    tokenUsageEnd: IEvidenceBenchmarkTokenUsage | null;
    tokenUsage: IEvidenceBenchmarkTokenUsage;
    elapsedMs: number;
  }

  export interface IEvidenceBenchmarkRunState {
    arm: EvidenceBenchmarkArm;
    sessionId?: string;
    cliVersion?: string;
    nextInstructionIndex: number;
    status: "ready" | "running" | "interrupted" | "completed";
    threadTokenUsage: IEvidenceBenchmarkTokenUsage;
    goals: IEvidenceBenchmarkGoalRecord[];
    processes: IEvidenceBenchmarkProcessRecord[];
    interruption?: IEvidenceBenchmarkInterruption;
  }

  export interface IEvidenceBenchmarkRunProps {
    state: IEvidenceBenchmarkRunState;
    cwd: string;
    instructionsRoot: string;
    model: string;
    effort: "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
    environment?: NodeJS.ProcessEnv;
    command?: string;
    commandPrefixArguments?: readonly string[];
    onOutput: (
      processIndex: number,
      output: IEvidenceBenchmarkOutput,
    ) => void | Promise<void>;
    onState?: (state: IEvidenceBenchmarkRunState) => void | Promise<void>;
  }

  export function create(
    arm: EvidenceBenchmarkArm,
  ): IEvidenceBenchmarkRunState {
    return {
      arm,
      nextInstructionIndex: 0,
      status: "ready",
      threadTokenUsage: zeroUsage(),
      goals: [],
      processes: [],
    };
  }

  export async function run(
    props: IEvidenceBenchmarkRunProps,
  ): Promise<IEvidenceBenchmarkRunState> {
    const state: IEvidenceBenchmarkRunState = structuredClone(props.state);
    const entries = instructionEntries(state.arm);
    if (state.nextInstructionIndex >= entries.length) {
      state.status = "completed";
      await props.onState?.(structuredClone(state));
      return state;
    }

    const current = (): IEvidenceBenchmarkGoalRecord => {
      const record: IEvidenceBenchmarkGoalRecord | undefined = state.goals.find(
        (candidate) => candidate.index === state.nextInstructionIndex,
      );
      if (record === undefined) throw new Error("Current Goal is missing.");
      return record;
    };
    const prepare = (): IEvidenceBenchmarkGoalRecord => {
      const retained: IEvidenceBenchmarkGoalRecord | undefined =
        state.goals.find(
          (record) => record.index === state.nextInstructionIndex,
        );
      if (retained !== undefined) return retained;
      const entry = entries[state.nextInstructionIndex];
      if (entry === undefined)
        throw new Error("Instruction cursor is invalid.");
      const prescribedText: string = fs.readFileSync(
        path.join(props.instructionsRoot, ...entry[1].split("/")),
        "utf8",
      );
      const continuationText: string = fs.readFileSync(
        path.join(props.instructionsRoot, "continue.md"),
        "utf8",
      );
      const record: IEvidenceBenchmarkGoalRecord = {
        index: state.nextInstructionIndex,
        name: entry[0],
        relativePath: entry[1],
        prescribedText,
        continuationText,
        objectiveText: `${prescribedText}\n\n${continuationText}`,
        goal: null,
        terminalTurnId: null,
        terminalTurnCompleted: false,
        threadIdle: false,
        tokenUsageStart: structuredClone(state.threadTokenUsage),
        tokenUsageEnd: null,
        tokenUsage: zeroUsage(),
        elapsedMs: 0,
      };
      state.goals.push(record);
      return record;
    };

    prepare();
    const fresh: boolean = state.sessionId === undefined;
    state.status = "running";
    delete state.interruption;

    const command: string =
      props.command ??
      (process.platform === "win32" ? process.execPath : "codex");
    const prefix: readonly string[] =
      props.commandPrefixArguments ??
      (process.platform === "win32"
        ? [
            path.join(
              process.env.APPDATA ?? "",
              "npm/node_modules/@openai/codex/bin/codex.js",
            ),
          ]
        : []);
    const arguments_: string[] = [
      ...prefix,
      "app-server",
      "--stdio",
      "--enable",
      "goals",
      "--config",
      `model_reasoning_effort="${props.effort}"`,
    ];
    const processIndex: number = state.processes.length;
    const processRecord: IEvidenceBenchmarkProcessRecord = {
      command,
      arguments: arguments_,
      elapsedMs: 0,
      exitCode: null,
      signal: null,
    };
    state.processes.push(processRecord);

    let outcome: "completed" | "interrupted" | undefined;
    let resolveOutcome!: (value: "completed" | "interrupted") => void;
    const outcomePromise = new Promise<"completed" | "interrupted">(
      (resolve) => {
        resolveOutcome = resolve;
      },
    );
    const finish = (
      value: "completed" | "interrupted",
      interruption?: unknown,
    ): void => {
      if (interruption !== undefined && state.interruption === undefined)
        state.interruption = normalizeInterruption(interruption);
      if (outcome !== undefined) return;
      outcome = value;
      resolveOutcome(value);
    };

    let outputPublication: Promise<void> = Promise.resolve();
    let outputFailed = false;
    let publication: Promise<void> = Promise.resolve();
    let publicationFailed = false;
    const publish = (): void => {
      if (props.onState === undefined || publicationFailed) return;
      const snapshot: IEvidenceBenchmarkRunState = structuredClone(state);
      const output: Promise<void> = outputPublication;
      publication = publication
        .then(() => output)
        .then(() => props.onState!(snapshot))
        .catch((error: unknown) => {
          publicationFailed = true;
          finish("interrupted", error);
        });
    };
    publish();

    const started: bigint = process.hrtime.bigint();
    const child = spawn(command, arguments_, {
      cwd: props.cwd,
      env: props.environment ?? process.env,
      shell: false,
      windowsHide: true,
      stdio: "pipe",
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    let sequence = 0;
    const append = (
      stream: IEvidenceBenchmarkOutput["stream"],
      text: string,
    ): void => {
      if (text.length === 0) return;
      const output: IEvidenceBenchmarkOutput = {
        sequence: sequence++,
        elapsedMs: elapsed(started),
        stream,
        text,
      };
      if (outputFailed) return;
      outputPublication = outputPublication
        .then(() =>
          outputFailed
            ? undefined
            : props.onOutput(processIndex, structuredClone(output)),
        )
        .catch((error: unknown) => {
          outputFailed = true;
          finish("interrupted", error);
          publish();
        });
    };
    child.stderr.on("data", (text: string) => append("stderr", text));
    child.stdin.on("error", (error) => finish("interrupted", error));

    let requestId = 0;
    const pending = new Map<
      number,
      {
        resolve: (value: unknown) => void;
        reject: (reason: unknown) => void;
      }
    >();
    const send = (message: Record<string, unknown>): void => {
      const text: string = `${JSON.stringify(message)}\n`;
      append("stdin", text);
      child.stdin.write(text, "utf8");
    };
    const request = (method: string, params: unknown): Promise<unknown> => {
      const id: number = ++requestId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ method, id, params });
      });
    };

    let advancing = false;
    const beginGoal = async (): Promise<void> => {
      const record: IEvidenceBenchmarkGoalRecord = prepare();
      record.terminalTurnId = null;
      record.terminalTurnCompleted = false;
      record.threadIdle = false;
      const response: unknown = await request("thread/goal/set", {
        threadId: state.sessionId,
        objective: record.objectiveText,
        status: "active",
      });
      const value: Record<string, unknown> = object(response);
      record.goal = object(value.goal);
      publish();
    };
    const advance = async (): Promise<void> => {
      const record: IEvidenceBenchmarkGoalRecord = current();
      if (
        advancing ||
        record.goal?.status !== "complete" ||
        record.terminalTurnId === null ||
        !record.terminalTurnCompleted ||
        !record.threadIdle
      )
        return;
      advancing = true;
      record.tokenUsageEnd = structuredClone(state.threadTokenUsage);
      record.tokenUsage = subtract(
        record.tokenUsageEnd,
        record.tokenUsageStart,
      );
      state.nextInstructionIndex++;
      publish();
      await publication;
      if (state.nextInstructionIndex === entries.length) finish("completed");
      else {
        await beginGoal();
        advancing = false;
      }
    };

    const notify = async (message: Record<string, unknown>): Promise<void> => {
      const params: Record<string, unknown> = object(message.params);
      if (
        typeof params.threadId === "string" &&
        state.sessionId !== undefined &&
        params.threadId !== state.sessionId
      )
        return;

      if (message.method === "thread/tokenUsage/updated") {
        const usage: IEvidenceBenchmarkTokenUsage | undefined =
          tokenUsage(params);
        if (usage !== undefined) state.threadTokenUsage = usage;
        publish();
        return;
      }
      if (message.method === "turn/started") {
        current().threadIdle = false;
        publish();
        return;
      }
      if (message.method === "thread/goal/updated") {
        const record: IEvidenceBenchmarkGoalRecord = current();
        record.goal = object(params.goal);
        const status: unknown = record.goal.status;
        if (status === "complete") {
          if (typeof params.turnId !== "string") {
            finish("interrupted", message);
            return;
          }
          record.terminalTurnId = params.turnId;
          record.terminalTurnCompleted = false;
          record.threadIdle = false;
        }
        publish();
        if (
          status === "paused" ||
          status === "blocked" ||
          status === "usageLimited" ||
          status === "budgetLimited"
        )
          finish("interrupted", message);
        else await advance();
        return;
      }
      if (message.method === "turn/completed") {
        const turn: Record<string, unknown> = object(params.turn);
        const record: IEvidenceBenchmarkGoalRecord = current();
        if (turn.id === record.terminalTurnId && turn.status === "completed")
          record.terminalTurnCompleted = true;
        if (typeof turn.durationMs === "number")
          record.elapsedMs += turn.durationMs;
        publish();
        if (turn.status === "failed" || turn.status === "interrupted")
          finish("interrupted", message);
        else await advance();
        return;
      }
      if (message.method === "thread/status/changed") {
        const status: Record<string, unknown> = object(params.status);
        const record: IEvidenceBenchmarkGoalRecord = current();
        record.threadIdle =
          status.type === "idle" && record.terminalTurnCompleted;
        publish();
        if (status.type === "systemError" || status.type === "notLoaded")
          finish("interrupted", message);
        else await advance();
      }
    };

    let notifications: Promise<void> = Promise.resolve();
    const receive = (value: unknown): void => {
      const message: Record<string, unknown> = object(value);
      if (typeof message.method === "string") {
        if ("id" in message) finish("interrupted", message);
        else
          notifications = notifications
            .then(() => notify(message))
            .catch((error: unknown) => finish("interrupted", error));
        return;
      }
      if (typeof message.id !== "number") return;
      const waiter = pending.get(message.id);
      if (waiter === undefined) return;
      pending.delete(message.id);
      if ("error" in message) waiter.reject(message.error);
      else waiter.resolve(message.result);
    };

    let stdout = "";
    child.stdout.on("data", (text: string) => {
      append("stdout", text);
      stdout += text;
      for (;;) {
        const newline: number = stdout.indexOf("\n");
        if (newline === -1) return;
        const line: string = stdout.slice(0, newline).replace(/\r$/, "");
        stdout = stdout.slice(newline + 1);
        if (line.length === 0) continue;
        try {
          receive(JSON.parse(line));
        } catch {
          finish("interrupted", line);
        }
      }
    });

    const closed = new Promise<void>((resolve) => {
      child.once("error", (error) => finish("interrupted", error));
      child.once("close", (exitCode, signal) => {
        if (stdout.trim().length !== 0) {
          try {
            receive(JSON.parse(stdout));
          } catch {
            finish("interrupted", stdout);
          }
        }
        processRecord.elapsedMs = elapsed(started);
        processRecord.exitCode = exitCode;
        processRecord.signal = signal;
        for (const waiter of pending.values())
          waiter.reject(new Error("Codex app-server exited."));
        pending.clear();
        if (outcome === "completed" && (exitCode !== 0 || signal !== null))
          finish("interrupted", { exitCode, signal });
        if (outcome === undefined) finish("interrupted", { exitCode, signal });
        publish();
        resolve();
      });
    });

    try {
      await request("initialize", {
        clientInfo: {
          name: "@samchon/evidence-benchmark",
          version: "0.4.4",
        },
        capabilities: {},
      });
      send({ method: "initialized" });
      const response: Record<string, unknown> = object(
        fresh
          ? await request("thread/start", {
              model: props.model,
              cwd: props.cwd,
              approvalPolicy: "never",
              sandbox: "danger-full-access",
              ephemeral: false,
            })
          : await request("thread/resume", {
              threadId: state.sessionId,
              model: props.model,
              cwd: props.cwd,
              approvalPolicy: "never",
              sandbox: "danger-full-access",
            }),
      );
      const thread: Record<string, unknown> = object(response.thread);
      if (typeof thread.id !== "string")
        throw new Error("Codex app-server omitted the thread ID.");
      if (typeof thread.cliVersion !== "string")
        throw new Error("Codex app-server omitted the CLI version.");
      if (
        state.cliVersion !== undefined &&
        state.cliVersion !== thread.cliVersion
      )
        throw new Error(
          "Retained benchmark cell uses a different CLI version.",
        );
      state.sessionId = thread.id;
      state.cliVersion = thread.cliVersion;
      current().threadIdle = object(thread.status, false)?.type === "idle";
      publish();

      if (fresh) await beginGoal();
      else {
        const goalResponse: Record<string, unknown> = object(
          await request("thread/goal/get", {
            threadId: state.sessionId,
          }),
        );
        if (goalResponse.goal === null) finish("interrupted", goalResponse);
        else {
          const goal: Record<string, unknown> = object(goalResponse.goal);
          const record: IEvidenceBenchmarkGoalRecord = current();
          if (record.goal === null)
            finish("interrupted", {
              name: "EvidenceBenchmarkResumeInterruption",
              message: "Retained state has no exact current Goal checkpoint.",
              instructionIndex: record.index,
              nativeGoal: goal,
            });
          else if (
            record.goal.objective !== record.objectiveText ||
            goal.objective !== record.objectiveText
          )
            finish("interrupted", {
              name: "EvidenceBenchmarkResumeInterruption",
              message: "Native Goal does not match the retained current Goal.",
              instructionIndex: record.index,
              retainedGoal: record.goal,
              nativeGoal: goal,
            });
          else {
            record.goal = goal;
            publish();
            if (
              goal.status === "complete" &&
              (record.terminalTurnId === null ||
                !record.terminalTurnCompleted ||
                !record.threadIdle)
            )
              finish("interrupted", {
                name: "EvidenceBenchmarkResumeInterruption",
                message:
                  "Completed Goal lacks an exact terminal-turn and idle checkpoint.",
                instructionIndex: record.index,
                goal,
                terminalTurnId: record.terminalTurnId,
                terminalTurnCompleted: record.terminalTurnCompleted,
                threadIdle: record.threadIdle,
              });
            else if (goal.status === "active" || goal.status === "complete")
              await advance();
            else finish("interrupted", goal);
          }
        }
      }
    } catch (error) {
      finish("interrupted", error);
    }

    const result: "completed" | "interrupted" = await outcomePromise;
    await notifications;
    await publication;
    child.stdin.end();
    await closed;
    await notifications;
    await outputPublication;
    await publication;
    state.status =
      result === "completed" &&
      processRecord.exitCode === 0 &&
      processRecord.signal === null &&
      !outputFailed &&
      !publicationFailed
        ? "completed"
        : "interrupted";
    publish();
    await publication;
    if (publicationFailed) state.status = "interrupted";
    return state;
  }

  export function instructionEntries(
    arm: EvidenceBenchmarkArm,
  ): readonly (readonly [string, string])[] {
    return [
      ["skills-contract", "skills-contract.md"],
      ["backend-start", "backend/start.md"],
      ["backend-review", "backend/review.md"],
      ["backend-final", `backend/${arm}-final.md`],
      ["frontend-start", "frontend/start.md"],
      ["frontend-review", "frontend/review.md"],
      ["frontend-final", `frontend/${arm}-final.md`],
      ["overall-review", "overall/review.md"],
      ["overall-final", `overall/${arm}-final.md`],
    ];
  }

  function tokenUsage(
    params: Record<string, unknown>,
  ): IEvidenceBenchmarkTokenUsage | undefined {
    const tokenUsage: Record<string, unknown> | undefined = object(
      params.tokenUsage,
      false,
    );
    const total: Record<string, unknown> | undefined = object(
      tokenUsage?.total,
      false,
    );
    if (total === undefined) return undefined;
    const fields: readonly (keyof IEvidenceBenchmarkTokenUsage)[] = [
      "totalTokens",
      "inputTokens",
      "cachedInputTokens",
      "cacheWriteInputTokens",
      "outputTokens",
      "reasoningOutputTokens",
    ];
    return fields.every((field) => typeof total[field] === "number")
      ? (total as unknown as IEvidenceBenchmarkTokenUsage)
      : undefined;
  }

  function subtract(
    endpoint: IEvidenceBenchmarkTokenUsage,
    baseline: IEvidenceBenchmarkTokenUsage,
  ): IEvidenceBenchmarkTokenUsage {
    return {
      totalTokens: endpoint.totalTokens - baseline.totalTokens,
      inputTokens: endpoint.inputTokens - baseline.inputTokens,
      cachedInputTokens:
        endpoint.cachedInputTokens - baseline.cachedInputTokens,
      cacheWriteInputTokens:
        endpoint.cacheWriteInputTokens - baseline.cacheWriteInputTokens,
      outputTokens: endpoint.outputTokens - baseline.outputTokens,
      reasoningOutputTokens:
        endpoint.reasoningOutputTokens - baseline.reasoningOutputTokens,
    };
  }

  function zeroUsage(): IEvidenceBenchmarkTokenUsage {
    return {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    };
  }

  function normalizeInterruption(
    value: unknown,
  ): IEvidenceBenchmarkInterruption {
    const source: Record<string, unknown> | undefined = object(value, false);
    const detail: unknown = serializable(value);
    const message: string =
      value instanceof Error
        ? value.message
        : typeof source?.message === "string"
          ? source.message
          : typeof value === "string"
            ? value
            : (JSON.stringify(detail) ?? String(detail));
    return {
      name:
        value instanceof Error
          ? value.name
          : typeof source?.name === "string"
            ? source.name
            : "BenchmarkInterruption",
      message,
      ...(value instanceof Error && value.stack !== undefined
        ? { stack: value.stack }
        : typeof source?.stack === "string"
          ? { stack: source.stack }
          : {}),
      ...(detail === undefined ? {} : { detail }),
    };
  }

  function serializable(value: unknown): unknown {
    try {
      const text: string | undefined = JSON.stringify(
        value,
        (_key, member: unknown) =>
          typeof member === "bigint" ? member.toString() : member,
      );
      return text === undefined ? String(value) : JSON.parse(text);
    } catch {
      return String(value);
    }
  }

  function object(value: unknown, required?: true): Record<string, unknown>;
  function object(
    value: unknown,
    required: false,
  ): Record<string, unknown> | undefined;
  function object(
    value: unknown,
    required = true,
  ): Record<string, unknown> | undefined {
    if (typeof value === "object" && value !== null && !Array.isArray(value))
      return value as Record<string, unknown>;
    if (required) throw new Error("Codex app-server message is invalid.");
    return undefined;
  }

  function elapsed(started: bigint): number {
    return Number(process.hrtime.bigint() - started) / 1_000_000;
  }
}
