import { spawn, spawnSync } from "node:child_process";
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
    tokenUsageTurnId: string | null;
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

  export interface IEvidenceBenchmarkExecutable {
    command: string;
    composeArguments: (arguments_: readonly string[]) => string[];
    windowsVerbatimArguments: boolean;
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
      if (state.interruption !== undefined) {
        state.status = "interrupted";
        await props.onState?.(structuredClone(state));
        return state;
      }
      try {
        validateCompletedState(state, entries);
        state.status = "completed";
      } catch (error) {
        state.status = "interrupted";
        state.interruption = normalizeInterruption(error);
      }
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
        tokenUsageTurnId: null,
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
    let resumeReconciled: boolean = fresh;
    let resumeSnapshotPending: boolean = !fresh;
    let resumeSnapshot: Record<string, unknown> | undefined;
    let resumeSnapshotRecordIndex: number | undefined;
    let resolveResumeSnapshot!: () => void;
    const resumeSnapshotPromise = new Promise<void>((resolve) => {
      resolveResumeSnapshot = resolve;
    });
    state.status = "running";
    delete state.interruption;

    const executable = resolveExecutable({
      name: "codex",
      environment: props.environment ?? process.env,
      command: props.command,
      commandPrefixArguments: props.commandPrefixArguments,
    });
    const command: string = executable.command;
    const arguments_: string[] = executable.composeArguments([
      "app-server",
      "--stdio",
      "--enable",
      "goals",
      "--config",
      `model_reasoning_effort="${props.effort}"`,
    ]);
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
      windowsVerbatimArguments: executable.windowsVerbatimArguments,
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
      const threadId: string | undefined = state.sessionId;
      if (threadId === undefined)
        throw new Error("Codex app-server omitted the thread ID.");
      record.terminalTurnId = null;
      record.terminalTurnCompleted = false;
      record.threadIdle = false;
      record.tokenUsageTurnId = null;
      publish();
      await publication;
      if (outcome !== undefined) return;
      const response: unknown = await request("thread/goal/set", {
        threadId,
        objective: record.objectiveText,
        status: "active",
      });
      const value: Record<string, unknown> = object(response);
      const goal: Record<string, unknown> = object(value.goal);
      validateNativeGoal(record, goal, threadId);
      record.goal = goal;
      publish();
    };
    const advance = async (): Promise<void> => {
      if (outcome !== undefined) return;
      const record: IEvidenceBenchmarkGoalRecord = current();
      if (
        !resumeReconciled ||
        resumeSnapshotPending ||
        advancing ||
        record.goal?.status !== "complete" ||
        record.terminalTurnId === null ||
        !record.terminalTurnCompleted ||
        !record.threadIdle
      )
        return;
      if (!usageAdvanced(state.threadTokenUsage, record.tokenUsageStart)) {
        finish("interrupted", {
          name: "EvidenceBenchmarkTokenCheckpointError",
          message:
            "Codex Goal completed without an exact native token checkpoint.",
          instructionIndex: record.index,
        });
        return;
      }
      if (record.tokenUsageTurnId !== record.terminalTurnId) {
        finish("interrupted", {
          name: "EvidenceBenchmarkTokenCheckpointError",
          message:
            "Codex Goal completed without an exact terminal-turn token checkpoint.",
          instructionIndex: record.index,
          tokenUsageTurnId: record.tokenUsageTurnId,
          terminalTurnId: record.terminalTurnId,
        });
        return;
      }
      advancing = true;
      record.tokenUsageEnd = structuredClone(state.threadTokenUsage);
      record.tokenUsage = subtract(
        record.tokenUsageEnd,
        record.tokenUsageStart,
      );
      state.nextInstructionIndex++;
      publish();
      await publication;
      if (outcome !== undefined) return;
      if (state.nextInstructionIndex === entries.length) finish("completed");
      else {
        await beginGoal();
        advancing = false;
      }
    };

    const notify = async (message: Record<string, unknown>): Promise<void> => {
      if (
        message.method !== "thread/tokenUsage/updated" &&
        message.method !== "turn/started" &&
        message.method !== "thread/goal/updated" &&
        message.method !== "turn/completed" &&
        message.method !== "thread/status/changed"
      )
        return;
      const params: Record<string, unknown> = object(message.params);
      if (typeof params.threadId !== "string")
        throw new Error("Codex app-server notification omitted its thread ID.");
      if (state.sessionId === undefined)
        throw new Error("Codex app-server omitted the thread ID.");
      if (params.threadId !== state.sessionId) return;

      if (message.method === "thread/tokenUsage/updated") {
        const usage: IEvidenceBenchmarkTokenUsage | undefined =
          tokenUsage(params);
        if (usage !== undefined) {
          if (typeof params.turnId !== "string") {
            finish("interrupted", message);
            return;
          }
          if (!resumeReconciled && resumeSnapshotPending) {
            const record: IEvidenceBenchmarkGoalRecord = current();
            const currentOwnsReplay: boolean =
              record.goal !== null && record.tokenUsageTurnId !== null;
            const retained: IEvidenceBenchmarkGoalRecord | undefined =
              currentOwnsReplay
                ? record
                : state.goals.find(
                    (candidate) => candidate.index === record.index - 1,
                  );
            if (
              retained === undefined ||
              !sameUsage(usage, state.threadTokenUsage) ||
              retained.tokenUsageTurnId !== params.turnId ||
              (!currentOwnsReplay &&
                (retained.goal?.status !== "complete" ||
                  retained.terminalTurnId === null ||
                  !retained.terminalTurnCompleted ||
                  !retained.threadIdle ||
                  retained.tokenUsageTurnId !== retained.terminalTurnId ||
                  retained.tokenUsageEnd === null ||
                  !sameUsage(retained.tokenUsageEnd, state.threadTokenUsage)))
            )
              throw new Error(
                "Codex resume token replay does not match the retained checkpoint.",
              );
            publish();
            return;
          }
          state.threadTokenUsage = usage;
          current().tokenUsageTurnId = params.turnId;
        }
        publish();
        await advance();
        return;
      }
      if (
        !resumeReconciled &&
        resumeSnapshotPending &&
        !(message.method === "thread/goal/updated" && params.turnId === null)
      )
        throw new Error(
          "Codex emitted resume lifecycle before its Goal snapshot.",
        );
      if (message.method === "turn/started") {
        current().threadIdle = false;
        publish();
        return;
      }
      if (message.method === "thread/goal/updated") {
        const record: IEvidenceBenchmarkGoalRecord = current();
        const goal: Record<string, unknown> = object(params.goal);
        if (state.sessionId === undefined)
          throw new Error("Codex app-server omitted the thread ID.");
        if (!resumeReconciled && params.turnId === null) {
          if (!resumeSnapshotPending || resumeSnapshot !== undefined)
            throw new Error("Codex emitted duplicate resume Goal snapshots.");
          const retained: IEvidenceBenchmarkGoalRecord | undefined =
            record.goal !== null
              ? record
              : state.goals.find(
                  (candidate) => candidate.index === record.index - 1,
                );
          if (
            retained?.goal === null ||
            retained?.goal === undefined ||
            retained.goal.status !== goal.status
          )
            throw new Error(
              "Codex resume Goal snapshot does not match an exact retained boundary.",
            );
          validateNativeGoal(retained, retained.goal, state.sessionId);
          validateNativeGoal(retained, goal, state.sessionId);
          resumeSnapshot = structuredClone(goal);
          resumeSnapshotRecordIndex = retained.index;
          resumeSnapshotPending = false;
          resolveResumeSnapshot();
          publish();
          return;
        }
        validateNativeGoal(record, goal, state.sessionId);
        record.goal = goal;
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
        record.threadIdle = status.type === "idle";
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
      const retainedSessionId: string | undefined = state.sessionId;
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
      if (!fresh && thread.id !== retainedSessionId)
        throw new Error(
          "Codex app-server resumed a different retained thread.",
        );
      if (typeof thread.cliVersion !== "string")
        throw new Error("Codex app-server omitted the CLI version.");
      if (
        state.cliVersion !== undefined &&
        state.cliVersion !== thread.cliVersion
      )
        throw new Error(
          "Retained benchmark cell uses a different CLI version.",
        );
      const sessionId: string = thread.id;
      state.sessionId = sessionId;
      state.cliVersion = thread.cliVersion;
      if (fresh)
        current().threadIdle = object(thread.status, false)?.type === "idle";
      publish();
      await publication;

      if (outcome === undefined && fresh) await beginGoal();
      else if (outcome === undefined) {
        const goalResponse: Record<string, unknown> = object(
          await request("thread/goal/get", {
            threadId: sessionId,
          }),
        );
        const goal: Record<string, unknown> | null =
          goalResponse.goal === null ? null : object(goalResponse.goal);
        if (goal !== null && resumeSnapshot === undefined)
          await Promise.race([resumeSnapshotPromise, outcomePromise]);
        await notifications;
        if (outcome === undefined) {
          const record: IEvidenceBenchmarkGoalRecord = current();
          if (goal === null) {
            resumeSnapshotPending = false;
            resumeReconciled = true;
            if (
              record.index !== 0 ||
              record.goal !== null ||
              resumeSnapshot !== undefined
            )
              finish("interrupted", {
                name: "EvidenceBenchmarkResumeInterruption",
                message: "Retained state has no exact empty Goal boundary.",
                instructionIndex: record.index,
                nativeGoal: goal,
              });
            else await beginGoal();
          } else if (
            resumeSnapshot === undefined ||
            resumeSnapshotRecordIndex === undefined
          )
            finish("interrupted", {
              name: "EvidenceBenchmarkResumeInterruption",
              message: "Codex omitted the retained Goal snapshot.",
              instructionIndex: record.index,
              nativeGoal: goal,
            });
          else if (record.goal === null) {
            const previous: IEvidenceBenchmarkGoalRecord | undefined =
              state.goals.find(
                (candidate) => candidate.index === record.index - 1,
              );
            if (
              previous === undefined ||
              previous.goal === null ||
              previous.goal.status !== "complete" ||
              previous.terminalTurnId === null ||
              !previous.terminalTurnCompleted ||
              !previous.threadIdle ||
              previous.tokenUsageTurnId !== previous.terminalTurnId ||
              previous.tokenUsageEnd === null ||
              !usageAdvanced(
                previous.tokenUsageEnd,
                previous.tokenUsageStart,
              ) ||
              !sameUsage(previous.tokenUsageEnd, state.threadTokenUsage) ||
              resumeSnapshotRecordIndex !== previous.index ||
              resumeSnapshot.status !== "complete" ||
              goal.status !== "complete"
            )
              finish("interrupted", {
                name: "EvidenceBenchmarkResumeInterruption",
                message:
                  "Retained state has no exact undispatched Goal boundary.",
                instructionIndex: record.index,
                nativeGoal: goal,
                nativeGoalSnapshot: resumeSnapshot,
              });
            else {
              validateNativeGoal(previous, previous.goal, sessionId);
              validateNativeGoal(previous, resumeSnapshot, sessionId);
              validateNativeGoal(previous, goal, sessionId);
              resumeReconciled = true;
              await beginGoal();
            }
          } else {
            validateNativeGoal(record, record.goal, sessionId);
            validateNativeGoal(record, resumeSnapshot, sessionId);
            validateNativeGoal(record, goal, sessionId);
            if (
              resumeSnapshotRecordIndex !== record.index ||
              (goal.status !== "active" && goal.status !== "complete") ||
              (resumeSnapshot.status === "complete" &&
                goal.status !== "complete") ||
              (record.goal.status !== "active" &&
                record.goal.status !== "complete")
            )
              finish("interrupted", {
                name: "EvidenceBenchmarkResumeInterruption",
                message:
                  "Codex resumed outside an exact retained Goal boundary.",
                instructionIndex: record.index,
                nativeGoal: goal,
                nativeGoalSnapshot: resumeSnapshot,
              });
            else if (
              resumeSnapshot.status === "complete" &&
              (record.terminalTurnId === null ||
                !record.terminalTurnCompleted ||
                !record.threadIdle ||
                record.tokenUsageTurnId !== record.terminalTurnId)
            )
              finish("interrupted", {
                name: "EvidenceBenchmarkResumeInterruption",
                message:
                  "Completed Goal lacks exact terminal-turn, idle, and token checkpoints.",
                instructionIndex: record.index,
                goal,
                terminalTurnId: record.terminalTurnId,
                terminalTurnCompleted: record.terminalTurnCompleted,
                threadIdle: record.threadIdle,
                tokenUsageTurnId: record.tokenUsageTurnId,
              });
            else {
              resumeReconciled = true;
              await advance();
            }
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
      state.interruption === undefined &&
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

  function validateCompletedState(
    state: IEvidenceBenchmarkRunState,
    entries: readonly (readonly [string, string])[],
  ): void {
    if (
      state.nextInstructionIndex !== entries.length ||
      state.goals.length !== entries.length
    )
      throw new Error("Codex retained an invalid completed cursor.");
    entries.forEach((entry, index) => {
      const record: IEvidenceBenchmarkGoalRecord | undefined = state.goals.find(
        (candidate) => candidate.index === index,
      );
      const previous: IEvidenceBenchmarkGoalRecord | undefined =
        index === 0
          ? undefined
          : state.goals.find((candidate) => candidate.index === index - 1);
      if (
        record === undefined ||
        record.name !== entry[0] ||
        record.relativePath !== entry[1] ||
        record.objectiveText !==
          `${record.prescribedText}\n\n${record.continuationText}` ||
        record.goal?.threadId !== state.sessionId ||
        record.goal?.objective !== record.objectiveText ||
        record.goal?.status !== "complete" ||
        record.terminalTurnId === null ||
        !record.terminalTurnCompleted ||
        !record.threadIdle ||
        record.tokenUsageTurnId !== record.terminalTurnId ||
        record.tokenUsageEnd === null ||
        !usageAdvanced(record.tokenUsageEnd, record.tokenUsageStart) ||
        !sameUsage(
          record.tokenUsage,
          subtract(record.tokenUsageEnd, record.tokenUsageStart),
        ) ||
        (index === 0
          ? !sameUsage(record.tokenUsageStart, zeroUsage())
          : previous?.tokenUsageEnd === null ||
            previous?.tokenUsageEnd === undefined ||
            !sameUsage(record.tokenUsageStart, previous.tokenUsageEnd))
      )
        throw new Error("Codex retained an invalid completed Goal.");
    });
    const last: IEvidenceBenchmarkGoalRecord | undefined = state.goals.find(
      (candidate) => candidate.index === entries.length - 1,
    );
    if (
      last?.tokenUsageEnd === null ||
      last?.tokenUsageEnd === undefined ||
      !sameUsage(state.threadTokenUsage, last.tokenUsageEnd)
    )
      throw new Error("Codex retained invalid total measurements.");
    const terminal: IEvidenceBenchmarkProcessRecord | undefined =
      state.processes.at(-1);
    if (
      terminal === undefined ||
      terminal.exitCode !== 0 ||
      terminal.signal !== null
    )
      throw new Error("Codex retained an invalid terminal process.");
  }

  export function resolveExecutable(props: {
    name: "codex" | "claude";
    environment: NodeJS.ProcessEnv;
    command?: string;
    commandPrefixArguments?: readonly string[];
  }): IEvidenceBenchmarkExecutable {
    if (props.command !== undefined) {
      const prefix: readonly string[] = props.commandPrefixArguments ?? [];
      return {
        command: props.command,
        composeArguments: (arguments_) => [...prefix, ...arguments_],
        windowsVerbatimArguments: false,
      };
    }
    if (process.platform !== "win32")
      return {
        command: props.name,
        composeArguments: (arguments_) => [...arguments_],
        windowsVerbatimArguments: false,
      };
    const executable: string | undefined = locateWindowsCommand(
      props.name,
      props.environment,
    );
    if (executable === undefined)
      throw new Error(`${props.name} was not found on PATH.`);
    if (path.extname(executable).toLowerCase() === ".exe")
      return {
        command: executable,
        composeArguments: (arguments_) => [...arguments_],
        windowsVerbatimArguments: false,
      };
    const command: string | undefined = props.environment.ComSpec;
    if (command === undefined)
      throw new Error("Windows command processor was not found.");
    return {
      command,
      composeArguments: (arguments_) => {
        const shellCommand: string = [
          escapeWindowsCommand(executable),
          ...arguments_.map(escapeWindowsArgument),
        ].join(" ");
        return ["/d", "/s", "/c", `"${shellCommand}"`];
      },
      windowsVerbatimArguments: true,
    };
  }

  function validateNativeGoal(
    record: IEvidenceBenchmarkGoalRecord,
    goal: Record<string, unknown>,
    threadId: string,
  ): void {
    if (goal.threadId !== threadId || goal.objective !== record.objectiveText)
      throw new Error(
        "Native Goal does not match the retained thread and objective.",
      );
  }

  function locateWindowsCommand(
    name: string,
    environment: NodeJS.ProcessEnv,
  ): string | undefined {
    const result = spawnSync("where.exe", [name], {
      encoding: "utf8",
      env: environment,
      shell: false,
      windowsHide: true,
    });
    if (result.status !== 0) return undefined;
    return (result.stdout ?? "").split(/\r?\n/).find((candidate) => {
      const extension: string = path.extname(candidate).toLowerCase();
      return extension === ".exe" || extension === ".cmd";
    });
  }

  function escapeWindowsCommand(value: string): string {
    return value.replace(/([()\][%!^"`<>&|;, *?])/g, "^$1");
  }

  function escapeWindowsArgument(value: string): string {
    let output: string = value
      .replace(/(?=(\\+?)?)\1"/g, '$1$1\\"')
      .replace(/(?=(\\+?)?)\1$/g, "$1$1");
    output = `"${output}"`;
    return escapeWindowsCommand(output);
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

  function usageAdvanced(
    endpoint: IEvidenceBenchmarkTokenUsage,
    baseline: IEvidenceBenchmarkTokenUsage,
  ): boolean {
    const fields: readonly (keyof IEvidenceBenchmarkTokenUsage)[] = [
      "totalTokens",
      "inputTokens",
      "cachedInputTokens",
      "cacheWriteInputTokens",
      "outputTokens",
      "reasoningOutputTokens",
    ];
    return (
      endpoint.totalTokens > baseline.totalTokens &&
      fields.every((field) => endpoint[field] >= baseline[field])
    );
  }

  function sameUsage(
    left: IEvidenceBenchmarkTokenUsage,
    right: IEvidenceBenchmarkTokenUsage,
  ): boolean {
    return (
      left.totalTokens === right.totalTokens &&
      left.inputTokens === right.inputTokens &&
      left.cachedInputTokens === right.cachedInputTokens &&
      left.cacheWriteInputTokens === right.cacheWriteInputTokens &&
      left.outputTokens === right.outputTokens &&
      left.reasoningOutputTokens === right.reasoningOutputTokens
    );
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
