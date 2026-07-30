import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkRunner } from "./EvidenceBenchmarkRunner.ts";

export namespace EvidenceBenchmarkClaudeRunner {
  export type EvidenceBenchmarkEffort =
    "low" | "medium" | "high" | "xhigh" | "max";

  export interface IEvidenceBenchmarkGoalRecord {
    index: number;
    name: string;
    relativePath: string;
    prescribedText: string;
    continuationText: string;
    objectiveText: string;
    inputDispatched: boolean;
    completed: boolean;
    processIndexes: number[];
    terminalResult: Record<string, unknown> | null;
    tokenUsage: EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage;
    costUsd: number;
    elapsedMs: number;
  }

  export interface IEvidenceBenchmarkRunState {
    arm: EvidenceBenchmarkRunner.EvidenceBenchmarkArm;
    sessionId: string;
    cliVersion?: string;
    nextInstructionIndex: number;
    status: "ready" | "running" | "interrupted" | "completed";
    tokenUsage: EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage;
    costUsd: number;
    goals: IEvidenceBenchmarkGoalRecord[];
    processes: EvidenceBenchmarkRunner.IEvidenceBenchmarkProcessRecord[];
    interruption?: EvidenceBenchmarkRunner.IEvidenceBenchmarkInterruption;
  }

  export interface IEvidenceBenchmarkRunProps {
    state: IEvidenceBenchmarkRunState;
    cwd: string;
    instructionsRoot: string;
    model: string;
    effort: EvidenceBenchmarkEffort;
    environment?: NodeJS.ProcessEnv;
    command?: string;
    commandPrefixArguments?: readonly string[];
    cliVersion?: string;
    onOutput: (
      processIndex: number,
      output: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput,
    ) => void | Promise<void>;
    onState?: (state: IEvidenceBenchmarkRunState) => void | Promise<void>;
  }

  export function create(
    arm: EvidenceBenchmarkRunner.EvidenceBenchmarkArm,
  ): IEvidenceBenchmarkRunState {
    return {
      arm,
      sessionId: crypto.randomUUID(),
      nextInstructionIndex: 0,
      status: "ready",
      tokenUsage: zeroUsage(),
      costUsd: 0,
      goals: [],
      processes: [],
    };
  }

  export async function run(
    props: IEvidenceBenchmarkRunProps,
  ): Promise<IEvidenceBenchmarkRunState> {
    const state: IEvidenceBenchmarkRunState = structuredClone(props.state);
    const entries = EvidenceBenchmarkRunner.instructionEntries(state.arm);
    try {
      const executable = resolveExecutable(props);
      const cliVersion: string =
        props.cliVersion ?? readVersion(executable.command, executable.prefix);
      if (state.cliVersion !== undefined && state.cliVersion !== cliVersion)
        throw new Error(
          "Retained benchmark cell uses a different Claude Code version.",
        );
      state.cliVersion = cliVersion;
      delete state.interruption;

      while (state.nextInstructionIndex < entries.length) {
        const goal: IEvidenceBenchmarkGoalRecord = prepareGoal(
          state,
          props.instructionsRoot,
          entries,
        );
        if (goal.completed) {
          state.nextInstructionIndex++;
          await publish(props, state);
          continue;
        }
        if (goal.inputDispatched && !goal.completed)
          throw new Error(
            "Claude Code interrupted after the current instruction was dispatched; exact resume is unavailable.",
          );
        state.status = "running";
        await publish(props, state);
        await executeGoal(props, state, goal, executable, cliVersion);
        state.nextInstructionIndex++;
        state.status =
          state.nextInstructionIndex === entries.length
            ? "completed"
            : "running";
        await publish(props, state);
      }
    } catch (error) {
      state.status = "interrupted";
      state.interruption = normalizeInterruption(error);
      try {
        await publish(props, state);
      } catch {}
    }
    return state;
  }

  function prepareGoal(
    state: IEvidenceBenchmarkRunState,
    instructionsRoot: string,
    entries: readonly (readonly [string, string])[],
  ): IEvidenceBenchmarkGoalRecord {
    const retained: IEvidenceBenchmarkGoalRecord | undefined = state.goals.find(
      (goal) => goal.index === state.nextInstructionIndex,
    );
    if (retained !== undefined) return retained;
    const entry = entries[state.nextInstructionIndex];
    if (entry === undefined) throw new Error("Instruction cursor is invalid.");
    const prescribedText: string = fs.readFileSync(
      path.join(instructionsRoot, ...entry[1].split("/")),
      "utf8",
    );
    const continuationText: string = fs.readFileSync(
      path.join(instructionsRoot, "continue.md"),
      "utf8",
    );
    const goal: IEvidenceBenchmarkGoalRecord = {
      index: state.nextInstructionIndex,
      name: entry[0],
      relativePath: entry[1],
      prescribedText,
      continuationText,
      objectiveText: `${prescribedText}\n\n${continuationText}`,
      inputDispatched: false,
      completed: false,
      processIndexes: [],
      terminalResult: null,
      tokenUsage: zeroUsage(),
      costUsd: 0,
      elapsedMs: 0,
    };
    state.goals.push(goal);
    return goal;
  }

  async function executeGoal(
    props: IEvidenceBenchmarkRunProps,
    state: IEvidenceBenchmarkRunState,
    goal: IEvidenceBenchmarkGoalRecord,
    executable: { command: string; prefix: readonly string[] },
    cliVersion: string,
  ): Promise<void> {
    const fresh: boolean = !state.goals.some(
      (candidate) => candidate.completed,
    );
    const arguments_: string[] = [
      ...executable.prefix,
      "-p",
      "--input-format",
      "text",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--forward-subagent-text",
      "--include-hook-events",
      "--model",
      props.model,
      "--effort",
      props.effort,
      "--dangerously-skip-permissions",
      "--disallowedTools",
      "WebFetch,WebSearch",
      "--setting-sources",
      "",
      "--settings",
      JSON.stringify({
        autoMemoryEnabled: false,
        attribution: { commit: "", pr: "", sessionUrl: false },
      }),
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--disable-slash-commands",
      "--no-chrome",
      "--prompt-suggestions",
      "false",
      fresh ? "--session-id" : "--resume",
      state.sessionId,
    ];
    const processIndex: number = state.processes.length;
    const processRecord: EvidenceBenchmarkRunner.IEvidenceBenchmarkProcessRecord =
      {
        command: executable.command,
        arguments: arguments_,
        elapsedMs: 0,
        exitCode: null,
        signal: null,
      };
    state.processes.push(processRecord);
    goal.processIndexes.push(processIndex);
    await publish(props, state);

    const started: bigint = process.hrtime.bigint();
    let sequence = 0;
    const emit = async (
      stream: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput["stream"],
      text: string,
    ): Promise<void> => {
      if (text.length === 0) return;
      await props.onOutput(processIndex, {
        sequence: sequence++,
        elapsedMs: elapsed(started),
        stream,
        text,
      });
    };
    const environment: NodeJS.ProcessEnv = {
      ...(props.environment ?? process.env),
      ANTHROPIC_DEFAULT_HAIKU_MODEL: props.model,
      ANTHROPIC_DEFAULT_SONNET_MODEL: props.model,
      CLAUDE_CODE_AUTO_CONNECT_IDE: "false",
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_SUBAGENT_MODEL: props.model,
      DISABLE_AUTOUPDATER: "1",
    };
    const child = spawn(executable.command, arguments_, {
      cwd: props.cwd,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: "pipe",
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let processError: unknown;
    const terminalPromise = new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }>((resolve) => {
      child.once("error", (error) => {
        processError ??= error;
        resolve({ exitCode: null, signal: null });
      });
      child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
    });

    let stdout = "";
    let output: Promise<void> = Promise.resolve();
    let outputError: unknown;
    const append = (
      stream: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput["stream"],
      text: string,
    ): void => {
      if (text.length === 0) return;
      if (stream === "stdout") stdout += text;
      output = output
        .then(() => emit(stream, text))
        .catch((error: unknown) => {
          outputError ??= error;
        });
    };
    child.stdout.on("data", (text: string) => append("stdout", text));
    child.stderr.on("data", (text: string) => append("stderr", text));

    child.stdin.once("error", (error) => {
      processError ??= error;
    });
    try {
      goal.inputDispatched = true;
      await publish(props, state);
      await emit("stdin", goal.objectiveText);
      child.stdin.end(goal.objectiveText, "utf8");
    } catch (error) {
      child.stdin.destroy();
      child.kill();
      await terminalPromise;
      throw error;
    }
    const terminal = await terminalPromise;
    await output;
    processRecord.elapsedMs = elapsed(started);
    processRecord.exitCode = terminal.exitCode;
    processRecord.signal = terminal.signal;
    goal.elapsedMs += processRecord.elapsedMs;

    if (outputError !== undefined) throw outputError;
    if (processError !== undefined) throw processError;
    if (terminal.exitCode !== 0 || terminal.signal !== null)
      throw new Error(
        `Claude Code exited with code ${String(terminal.exitCode)} and signal ${String(terminal.signal)}.`,
      );

    const events: Record<string, unknown>[] = parseEvents(stdout);
    validateInitializations(events, state, props, cliVersion);
    const result: Record<string, unknown> = terminalResult(
      events,
      state.sessionId,
    );
    const usage: EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage =
      readUsage(result.usage);
    const costUsd: number = nonnegativeNumber(
      result.total_cost_usd,
      "Claude Code total cost",
    );
    goal.terminalResult = structuredClone(result);
    goal.tokenUsage = usage;
    goal.costUsd = costUsd;
    state.tokenUsage = addUsage(state.tokenUsage, usage);
    state.costUsd += costUsd;
    goal.completed = true;
    await publish(props, state);
  }

  function validateInitializations(
    events: readonly Record<string, unknown>[],
    state: IEvidenceBenchmarkRunState,
    props: IEvidenceBenchmarkRunProps,
    cliVersion: string,
  ): void {
    const initializations = events.filter(
      (event) => event.type === "system" && event.subtype === "init",
    );
    if (initializations.length === 0)
      throw new Error("Claude Code omitted its initialization event.");
    const expectedVersion: string = cliVersion.split(/\s/, 1)[0]!;
    for (const event of initializations) {
      if (event.session_id !== state.sessionId)
        throw new Error("Claude Code initialization used a different session.");
      if (event.claude_code_version !== expectedVersion)
        throw new Error(
          "Claude Code initialization used a different CLI version.",
        );
      if (event.model !== props.model)
        throw new Error("Claude Code initialization used a different model.");
      if (
        typeof event.cwd !== "string" ||
        path.resolve(event.cwd) !== path.resolve(props.cwd)
      )
        throw new Error(
          "Claude Code initialization used a different workspace.",
        );
      const permissionMode: unknown =
        event.permissionMode ?? event.permission_mode;
      if (
        permissionMode !== undefined &&
        permissionMode !== "bypassPermissions"
      )
        throw new Error(
          "Claude Code initialization did not retain bypass permissions.",
        );
    }
  }

  function terminalResult(
    events: readonly Record<string, unknown>[],
    sessionId: string,
  ): Record<string, unknown> {
    const results = events.filter(
      (event) =>
        event.type === "result" &&
        object(event.origin, false)?.kind !== "task-notification",
    );
    if (results.length !== 1)
      throw new Error(
        "Claude Code emitted an invalid number of terminal results.",
      );
    const result: Record<string, unknown> = results[0]!;
    if (
      result.session_id !== sessionId ||
      result.subtype !== "success" ||
      result.is_error !== false ||
      (result.terminal_reason !== undefined &&
        result.terminal_reason !== "completed")
    )
      throw new Error(
        "Claude Code did not complete the current instruction successfully.",
      );
    if (
      (Array.isArray(result.permission_denials) &&
        result.permission_denials.length !== 0) ||
      (Array.isArray(result.errors) && result.errors.length !== 0)
    )
      throw new Error(
        "Claude Code completed with a permission denial or native error.",
      );
    return result;
  }

  function parseEvents(stdout: string): Record<string, unknown>[] {
    return stdout
      .split(/\r?\n/)
      .filter((line) => line.length !== 0)
      .map((line) => object(JSON.parse(line) as unknown));
  }

  function readUsage(
    value: unknown,
  ): EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage {
    const usage: Record<string, unknown> = object(value);
    const inputTokens: number = tokenCount(usage.input_tokens);
    const cachedInputTokens: number = tokenCount(usage.cache_read_input_tokens);
    const cacheWriteInputTokens: number = tokenCount(
      usage.cache_creation_input_tokens,
    );
    const outputTokens: number = tokenCount(usage.output_tokens);
    return {
      totalTokens:
        inputTokens + cachedInputTokens + cacheWriteInputTokens + outputTokens,
      inputTokens,
      cachedInputTokens,
      cacheWriteInputTokens,
      outputTokens,
      reasoningOutputTokens: 0,
    };
  }

  function addUsage(
    left: EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage,
    right: EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage,
  ): EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage {
    return {
      totalTokens: left.totalTokens + right.totalTokens,
      inputTokens: left.inputTokens + right.inputTokens,
      cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
      cacheWriteInputTokens:
        left.cacheWriteInputTokens + right.cacheWriteInputTokens,
      outputTokens: left.outputTokens + right.outputTokens,
      reasoningOutputTokens:
        left.reasoningOutputTokens + right.reasoningOutputTokens,
    };
  }

  function zeroUsage(): EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage {
    return {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    };
  }

  function tokenCount(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
      throw new Error("Claude Code reported an invalid token count.");
    return value;
  }

  function nonnegativeNumber(value: unknown, name: string): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      throw new Error(`${name} is invalid.`);
    return value;
  }

  function resolveExecutable(props: IEvidenceBenchmarkRunProps): {
    command: string;
    prefix: readonly string[];
  } {
    if (props.command !== undefined)
      return {
        command: props.command,
        prefix: props.commandPrefixArguments ?? [],
      };
    if (process.platform !== "win32") return { command: "claude", prefix: [] };
    const appData: string | undefined = process.env.APPDATA;
    if (appData === undefined)
      throw new Error("Claude Code launch on Windows requires APPDATA.");
    const command: string = path.join(
      appData,
      "npm",
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe",
    );
    if (!fs.existsSync(command))
      throw new Error(`Claude Code executable was not found: ${command}.`);
    return { command, prefix: [] };
  }

  function readVersion(command: string, prefix: readonly string[]): string {
    const result = spawnSync(command, [...prefix, "--version"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    const version: string = (result.stdout ?? "").trim();
    if (result.status !== 0 || version.length === 0)
      throw new Error(
        `Unable to read Claude Code version: ${(result.stderr ?? "").trim()}.`,
      );
    return version;
  }

  function normalizeInterruption(
    value: unknown,
  ): EvidenceBenchmarkRunner.IEvidenceBenchmarkInterruption {
    const source: Record<string, unknown> | undefined = object(value, false);
    return {
      name:
        value instanceof Error
          ? value.name
          : typeof source?.name === "string"
            ? source.name
            : "BenchmarkInterruption",
      message:
        value instanceof Error
          ? value.message
          : typeof source?.message === "string"
            ? source.message
            : typeof value === "string"
              ? value
              : (JSON.stringify(serializable(value)) ?? String(value)),
      ...(value instanceof Error && value.stack !== undefined
        ? { stack: value.stack }
        : typeof source?.stack === "string"
          ? { stack: source.stack }
          : {}),
      detail: serializable(value),
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
    if (required) throw new Error("Claude Code event is invalid.");
    return undefined;
  }

  function publish(
    props: IEvidenceBenchmarkRunProps,
    state: IEvidenceBenchmarkRunState,
  ): Promise<void> {
    return Promise.resolve(props.onState?.(structuredClone(state)));
  }

  function elapsed(started: bigint): number {
    return Number(process.hrtime.bigint() - started) / 1_000_000;
  }
}
