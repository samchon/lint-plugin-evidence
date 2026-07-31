import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import { EvidenceBenchmarkRunner } from "../../../benchmark/src/EvidenceBenchmarkRunner.ts";

const ENTRIES = [
  ["skills-contract", "skills-contract.md"],
  ["backend-start", "backend/start.md"],
  ["backend-review", "backend/review.md"],
  ["backend-final", "backend/evidence-final.md"],
  ["frontend-start", "frontend/start.md"],
  ["frontend-review", "frontend/review.md"],
  ["frontend-final", "frontend/evidence-final.md"],
  ["overall-review", "overall/review.md"],
  ["overall-final", "overall/evidence-final.md"],
] as const;

/**
 * Verifies the small production runner against a free app-server fixture.
 *
 * Each prescribed instruction and the shared continuation become one active
 * Goal. Native Goal, turn, token, process, and raw-stream facts are recorded;
 * the runner performs no workspace judgment.
 *
 * 1. Complete every prescribed Goal through one fake app-server process.
 * 2. Assert exact text, automatic progression, token deltas, and raw records.
 * 3. Assert a late protocol error cannot survive as completed.
 * 4. Assert a non-zero native exit is retained as an interruption.
 * 5. Assert callback errors retain serializable Error identity and context.
 */
const main = async (): Promise<void> => {
  const root: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-benchmark-runner-"),
  );
  try {
    const sources: Map<string, Buffer> = writeInstructions(root);
    const prefix: string[] = [
      "--experimental-transform-types",
      import.meta.filename,
      "--fake-app-server",
    ];
    const snapshots: EvidenceBenchmarkRunner.IEvidenceBenchmarkRunState[] = [];
    const completedOutput: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput[] =
      [];
    let enterSessionCheckpoint!: () => void;
    const sessionCheckpointEntered = new Promise<void>((resolve) => {
      enterSessionCheckpoint = resolve;
    });
    let releaseSessionCheckpoint!: () => void;
    const sessionCheckpointReleased = new Promise<void>((resolve) => {
      releaseSessionCheckpoint = resolve;
    });
    let sessionCheckpointBlocked = false;
    const completedPromise = EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: (_processIndex, output) => {
        completedOutput.push(output);
      },
      onState: async (state) => {
        snapshots.push(state);
        if (
          !sessionCheckpointBlocked &&
          state.sessionId !== undefined &&
          state.goals[0]?.goal === null
        ) {
          sessionCheckpointBlocked = true;
          enterSessionCheckpoint();
          await sessionCheckpointReleased;
        }
      },
    });
    await sessionCheckpointEntered;
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(
      completedOutput
        .filter((output) => output.stream === "stdin")
        .map((output) => JSON.parse(output.text) as Record<string, unknown>)
        .filter((request) => request.method === "thread/goal/set").length,
      0,
    );
    releaseSessionCheckpoint();
    const completed = await completedPromise;

    assert.equal(completed.status, "completed");
    assert.equal(completed.cliVersion, "fixture-cli");
    assert.equal(completed.nextInstructionIndex, ENTRIES.length);
    assert.equal(completed.goals.length, ENTRIES.length);
    assert.equal(completed.processes.length, 1);
    assert.equal(completed.processes[0]!.exitCode, 0);
    assert.equal(completed.processes[0]!.signal, null);
    assert.equal("output" in completed.processes[0]!, false);
    assert.ok(completedOutput.length > 0);
    const requests = completedOutput
      .filter((output) => output.stream === "stdin")
      .map((output) => JSON.parse(output.text) as Record<string, unknown>);
    assert.equal(
      requests.some((request) => request.method === "turn/start"),
      false,
    );
    const goalRequests = requests.filter(
      (request) => request.method === "thread/goal/set",
    );
    assert.equal(goalRequests.length, ENTRIES.length);
    assert.ok(
      goalRequests.every(
        (request) =>
          (request.params as Record<string, unknown>).status === "active",
      ),
    );
    completed.goals.forEach((goal, index) => {
      const [name, relative] = ENTRIES[index]!;
      const prescribed: string = sources.get(relative)!.toString("utf8");
      const continuation: string = sources.get("continue.md")!.toString("utf8");
      assert.equal(goal.name, name);
      assert.equal(goal.relativePath, relative);
      assert.equal(goal.prescribedText, prescribed);
      assert.equal(goal.continuationText, continuation);
      assert.equal(goal.objectiveText, `${prescribed}\n\n${continuation}`);
      assert.equal(goal.goal?.objective, goal.objectiveText);
      assert.equal(goal.goal?.status, "complete");
      assert.equal(goal.terminalTurnCompleted, true);
      assert.equal(goal.threadIdle, true);
      assert.equal(goal.tokenUsageTurnId, goal.terminalTurnId);
      assert.deepEqual(goal.tokenUsage, {
        totalTokens: 10,
        inputTokens: 6,
        cachedInputTokens: 2,
        cacheWriteInputTokens: 1,
        outputTokens: 4,
        reasoningOutputTokens: 3,
      } satisfies EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage);
    });
    assert.deepEqual(completed.threadTokenUsage, {
      totalTokens: 90,
      inputTokens: 54,
      cachedInputTokens: 18,
      cacheWriteInputTokens: 9,
      outputTokens: 36,
      reasoningOutputTokens: 27,
    } satisfies EvidenceBenchmarkRunner.IEvidenceBenchmarkTokenUsage);
    assert.equal(snapshots.at(-1)?.status, "completed");

    const terminalLfOutput: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput[] =
      [];
    const terminalLf = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--terminal-lf"],
      onOutput: (_processIndex, output) => {
        terminalLfOutput.push(output);
      },
    });
    assert.equal(terminalLf.status, "completed");
    assert.equal(terminalLf.nextInstructionIndex, ENTRIES.length);
    assert.equal(terminalLf.goals.length, ENTRIES.length);
    const terminalLfRequests = terminalLfOutput
      .filter((output) => output.stream === "stdin")
      .map((output) => JSON.parse(output.text) as Record<string, unknown>)
      .filter((request) => request.method === "thread/goal/set");
    assert.equal(terminalLfRequests.length, ENTRIES.length);
    terminalLf.goals.forEach((goal, index) => {
      const objective: string = readObjective(root, sources, ENTRIES[index]!);
      assert.ok(objective.endsWith("\n"));
      assert.equal(goal.objectiveText, objective);
      assert.deepEqual(
        Buffer.from(goal.objectiveText),
        Buffer.from(objective),
      );
      assert.equal(
        (terminalLfRequests[index]?.params as Record<string, unknown>)
          ?.objective,
        objective,
      );
      assert.equal(goal.goal?.objective, objective.slice(0, -1));
    });

    const terminalLfBoundary = structuredClone(terminalLf);
    terminalLfBoundary.status = "interrupted";
    terminalLfBoundary.nextInstructionIndex = 1;
    terminalLfBoundary.goals = terminalLfBoundary.goals.slice(0, 1);
    terminalLfBoundary.threadTokenUsage = structuredClone(
      terminalLfBoundary.goals[0]!.tokenUsageEnd!,
    );
    const terminalLfResume = await EvidenceBenchmarkRunner.run({
      state: terminalLfBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--previous-goal",
        "--terminal-lf",
      ],
      onOutput: () => undefined,
    });
    assert.equal(terminalLfResume.status, "completed");

    if (process.platform === "win32") {
      const shimDirectory: string = path.join(root, "command shims");
      const shim: string = path.join(shimDirectory, "codex.cmd");
      fs.mkdirSync(shimDirectory);
      fs.writeFileSync(
        shim,
        [
          "@echo off",
          `"${process.execPath}" --experimental-transform-types "${import.meta.filename}" --fake-app-server %*`,
          "",
        ].join("\r\n"),
      );
      const pathName: string =
        Object.keys(process.env).find(
          (name) => name.toUpperCase() === "PATH",
        ) ?? "Path";
      const environment: NodeJS.ProcessEnv = {
        ...process.env,
        [pathName]: `${shimDirectory}${path.delimiter}${process.env[pathName] ?? ""}`,
      };
      const spacedCommand = await EvidenceBenchmarkRunner.run({
        state: EvidenceBenchmarkRunner.create("evidence"),
        cwd: root,
        instructionsRoot: root,
        model: "fixture-model",
        effort: "high",
        environment,
        onOutput: () => undefined,
      });
      assert.equal(spacedCommand.status, "completed");
      assert.deepEqual(spacedCommand.processes[0]?.arguments.slice(0, 3), [
        "/d",
        "/s",
        "/c",
      ]);
      assert.match(
        spacedCommand.processes[0]?.arguments[3] ?? "",
        /codex\.cmd/,
      );
    }

    const lateProtocolError = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--late-error"],
      onOutput: () => undefined,
    });
    assert.equal(lateProtocolError.status, "interrupted");
    assert.match(
      lateProtocolError.interruption?.message ?? "",
      /fixture\/late-error/,
    );
    const retainedLateProtocolError = await EvidenceBenchmarkRunner.run({
      state: lateProtocolError,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(retainedLateProtocolError.status, "interrupted");
    assert.match(
      retainedLateProtocolError.interruption?.message ?? "",
      /fixture\/late-error/,
    );

    const wrongGoal = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--wrong-goal"],
      onOutput: () => undefined,
    });
    assert.equal(wrongGoal.status, "interrupted");
    assert.match(
      wrongGoal.interruption?.message ?? "",
      /retained thread and objective/,
    );

    const invalidCursor = structuredClone(completed);
    invalidCursor.status = "interrupted";
    invalidCursor.processes.at(-1)!.exitCode = null;
    const rejectedCursor = await EvidenceBenchmarkRunner.run({
      state: invalidCursor,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(rejectedCursor.status, "interrupted");
    assert.match(
      rejectedCursor.interruption?.message ?? "",
      /invalid terminal process/,
    );
    assert.equal(rejectedCursor.processes.length, 1);

    const invalidMeasurements = structuredClone(completed);
    invalidMeasurements.status = "interrupted";
    invalidMeasurements.goals.at(-1)!.tokenUsage.outputTokens++;
    const rejectedMeasurements = await EvidenceBenchmarkRunner.run({
      state: invalidMeasurements,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(rejectedMeasurements.status, "interrupted");
    assert.match(
      rejectedMeasurements.interruption?.message ?? "",
      /invalid completed Goal/,
    );

    const interruptedOutput: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput[] =
      [];
    const interrupted = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--fail"],
      onOutput: (_processIndex, output) => {
        interruptedOutput.push(output);
      },
    });
    assert.equal(interrupted.status, "interrupted");
    assert.equal(interrupted.nextInstructionIndex, 0);
    assert.equal(interrupted.processes[0]!.exitCode, 7);
    assert.match(
      interruptedOutput
        .filter((output) => output.stream === "stderr")
        .map((output) => output.text)
        .join(""),
      /fixture interruption/,
    );

    const wrongThread = await EvidenceBenchmarkRunner.run({
      state: interrupted,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--wrong-thread"],
      onOutput: () => undefined,
    });
    assert.equal(wrongThread.status, "interrupted");
    assert.match(
      wrongThread.interruption?.message ?? "",
      /different retained thread/,
    );

    const blockedThenComplete = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--blocked-then-complete"],
      onOutput: () => undefined,
    });
    assert.equal(blockedThenComplete.status, "interrupted");
    assert.equal(blockedThenComplete.nextInstructionIndex, 0);
    assert.equal(blockedThenComplete.goals.length, 1);

    const missingToken = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--omit-token"],
      onOutput: () => undefined,
    });
    assert.equal(missingToken.status, "interrupted");
    assert.equal(missingToken.nextInstructionIndex, 0);
    assert.match(
      missingToken.interruption?.message ?? "",
      /native token checkpoint/,
    );

    const staleTerminalToken = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--omit-terminal-token"],
      onOutput: () => undefined,
    });
    assert.equal(staleTerminalToken.status, "interrupted");
    assert.equal(staleTerminalToken.nextInstructionIndex, 0);
    assert.match(
      staleTerminalToken.interruption?.message ?? "",
      /terminal-turn token checkpoint/,
    );

    const missingNotificationThread = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--missing-thread-id"],
      onOutput: () => undefined,
    });
    assert.equal(missingNotificationThread.status, "interrupted");
    assert.equal(missingNotificationThread.nextInstructionIndex, 0);
    assert.match(
      missingNotificationThread.interruption?.message ?? "",
      /notification omitted its thread ID/,
    );

    const stateFailureOutput: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput[] =
      [];
    let stateCheckpointCount = 0;
    const stateFailure = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: (_processIndex, output) => {
        stateFailureOutput.push(output);
      },
      onState: (state) => {
        if (state.sessionId !== undefined && state.goals[0]?.goal === null) {
          stateCheckpointCount++;
          if (stateCheckpointCount !== 2) return;
          throw new Error("fixture durable state failure");
        }
      },
    });
    assert.equal(stateFailure.status, "interrupted");
    assert.equal(
      stateFailure.interruption?.message,
      "fixture durable state failure",
    );
    assert.equal(
      stateFailureOutput
        .filter((output) => output.stream === "stdin")
        .map((output) => JSON.parse(output.text) as Record<string, unknown>)
        .filter((request) => request.method === "thread/goal/set").length,
      0,
    );
    const firstBoundaryResume = await EvidenceBenchmarkRunner.run({
      state: stateFailure,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--empty-goal"],
      onOutput: () => undefined,
    });
    assert.equal(firstBoundaryResume.status, "completed");

    const nextBoundary = structuredClone(completed);
    nextBoundary.status = "interrupted";
    nextBoundary.nextInstructionIndex = 1;
    nextBoundary.goals = nextBoundary.goals.slice(0, 1);
    nextBoundary.threadTokenUsage = structuredClone(
      nextBoundary.goals[0]!.tokenUsageEnd!,
    );
    const nextBoundaryResume = await EvidenceBenchmarkRunner.run({
      state: nextBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--previous-goal"],
      onOutput: () => undefined,
    });
    assert.equal(nextBoundaryResume.status, "completed");

    const completedCurrentBoundary = structuredClone(completed);
    completedCurrentBoundary.status = "interrupted";
    completedCurrentBoundary.nextInstructionIndex = 1;
    completedCurrentBoundary.goals = completedCurrentBoundary.goals.slice(0, 2);
    completedCurrentBoundary.threadTokenUsage = structuredClone(
      completedCurrentBoundary.goals[1]!.tokenUsageEnd!,
    );
    const completedCurrentOutput: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput[] =
      [];
    const completedCurrentResume = await EvidenceBenchmarkRunner.run({
      state: completedCurrentBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--current-goal",
        "--late-resume-snapshot",
      ],
      onOutput: (_processIndex, output) => {
        completedCurrentOutput.push(output);
      },
    });
    assert.equal(completedCurrentResume.status, "completed");
    const resumedGoalRequests = completedCurrentOutput
      .filter((output) => output.stream === "stdin")
      .map((output) => JSON.parse(output.text) as Record<string, unknown>)
      .filter((request) => request.method === "thread/goal/set");
    assert.equal(resumedGoalRequests.length, ENTRIES.length - 2);
    assert.equal(
      (resumedGoalRequests[0]?.params as Record<string, unknown>)?.objective,
      readObjective(root, sources, ENTRIES[2]!),
    );

    const regressedGoalStatus = await EvidenceBenchmarkRunner.run({
      state: completedCurrentBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--current-goal",
        "--active-goal-get",
      ],
      onOutput: () => undefined,
    });
    assert.equal(regressedGoalStatus.status, "interrupted");
    assert.match(
      regressedGoalStatus.interruption?.message ?? "",
      /exact retained Goal boundary/,
    );

    const activeCurrentBoundary = structuredClone(completedCurrentBoundary);
    const activeCurrentRecord = activeCurrentBoundary.goals[1]!;
    activeCurrentRecord.goal!.status = "active";
    activeCurrentRecord.terminalTurnId = null;
    activeCurrentRecord.terminalTurnCompleted = false;
    activeCurrentRecord.threadIdle = false;
    activeCurrentRecord.tokenUsageTurnId = null;
    activeCurrentRecord.tokenUsageEnd = null;
    activeCurrentRecord.tokenUsage = {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    };
    activeCurrentBoundary.threadTokenUsage = structuredClone(
      activeCurrentBoundary.goals[0]!.tokenUsageEnd!,
    );
    const activeCurrentOutput: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput[] =
      [];
    const activeCurrentResume = await EvidenceBenchmarkRunner.run({
      state: activeCurrentBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--current-active"],
      onOutput: (_processIndex, output) => {
        activeCurrentOutput.push(output);
      },
    });
    assert.equal(activeCurrentResume.status, "completed");
    const activeResumedGoalRequests = activeCurrentOutput
      .filter((output) => output.stream === "stdin")
      .map((output) => JSON.parse(output.text) as Record<string, unknown>)
      .filter((request) => request.method === "thread/goal/set");
    assert.equal(activeResumedGoalRequests.length, ENTRIES.length - 2);
    assert.equal(
      (activeResumedGoalRequests[0]?.params as Record<string, unknown>)
        ?.objective,
      readObjective(root, sources, ENTRIES[2]!),
    );

    const activePreviousBoundary = await EvidenceBenchmarkRunner.run({
      state: nextBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--previous-active"],
      onOutput: () => undefined,
    });
    assert.equal(activePreviousBoundary.status, "interrupted");
    assert.match(
      activePreviousBoundary.interruption?.message ?? "",
      /resume Goal snapshot/,
    );

    const outputFailure = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => {
        throw new Error("fixture durable output failure");
      },
    });
    assert.equal(outputFailure.status, "interrupted");
    assert.equal(outputFailure.interruption?.name, "Error");
    assert.equal(
      outputFailure.interruption?.message,
      "fixture durable output failure",
    );
    assert.equal(typeof outputFailure.interruption?.stack, "string");
    assert.doesNotThrow(() => JSON.stringify(outputFailure.interruption));

    for (const [relative, source] of sources)
      assert.deepEqual(
        fs.readFileSync(path.join(root, ...relative.split("/"))),
        source,
      );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const writeInstructions = (root: string): Map<string, Buffer> => {
  const sources: Map<string, Buffer> = new Map([
    ["continue.md", Buffer.from("Continue until this Goal is complete.\r\n")],
  ]);
  ENTRIES.forEach(([name, relative]) =>
    sources.set(relative, Buffer.from(`# ${name}\r\n\r\nExecute exactly.\r\n`)),
  );
  for (const [relative, source] of sources) {
    const location: string = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, source);
  }
  return sources;
};

const readObjective = (
  root: string,
  sources: ReadonlyMap<string, Buffer>,
  entry: (typeof ENTRIES)[number],
): string => {
  const prescribed: Buffer | undefined = sources.get(entry[1]);
  const continuation: Buffer | undefined = sources.get("continue.md");
  assert.ok(
    prescribed,
    `Missing fixture source: ${path.join(root, ...entry[1].split("/"))}`,
  );
  assert.ok(
    continuation,
    `Missing fixture source: ${path.join(root, "continue.md")}`,
  );
  return `${prescribed.toString("utf8")}\n\n${continuation.toString("utf8")}`;
};

const fakeAppServer = (): void => {
  const fail: boolean = process.argv.includes("--fail");
  const lateError: boolean = process.argv.includes("--late-error");
  const blockedThenComplete: boolean = process.argv.includes(
    "--blocked-then-complete",
  );
  const activeGoalGet: boolean = process.argv.includes("--active-goal-get");
  const emptyGoal: boolean = process.argv.includes("--empty-goal");
  const omitToken: boolean = process.argv.includes("--omit-token");
  const omitTerminalToken: boolean = process.argv.includes(
    "--omit-terminal-token",
  );
  const currentActive: boolean = process.argv.includes("--current-active");
  const currentGoal: boolean =
    currentActive || process.argv.includes("--current-goal");
  const lateResumeSnapshot: boolean = process.argv.includes(
    "--late-resume-snapshot",
  );
  const missingThreadId: boolean = process.argv.includes("--missing-thread-id");
  const previousActive: boolean = process.argv.includes("--previous-active");
  const previousGoal: boolean =
    currentGoal || previousActive || process.argv.includes("--previous-goal");
  const wrongGoal: boolean = process.argv.includes("--wrong-goal");
  const wrongThread: boolean = process.argv.includes("--wrong-thread");
  const terminalLf: boolean = process.argv.includes("--terminal-lf");
  let goalIndex = currentActive ? 1 : currentGoal ? 2 : previousGoal ? 1 : 0;
  let waitingForTurnCompletion = false;
  const send = (value: unknown, callback?: () => void): void => {
    process.stdout.write(`${JSON.stringify(value)}\n`, callback);
  };
  const goal = (
    objective: string,
    status: "active" | "blocked" | "complete",
  ) => ({
    threadId: "fixture-thread",
    objective:
      terminalLf && objective.endsWith("\n")
        ? objective.slice(0, -1)
        : objective,
    status,
    tokenBudget: null,
    tokensUsed: goalIndex * 10,
    timeUsedSeconds: goalIndex,
    createdAt: 1,
    updatedAt: goalIndex + 1,
  });
  const input = readline.createInterface({ input: process.stdin });
  const retainedObjective = (): string => {
    const relativePath: string = ENTRIES[currentGoal ? 1 : 0]![1];
    return `${fs.readFileSync(
      path.join(process.cwd(), ...relativePath.split("/")),
      "utf8",
    )}\n\n${fs.readFileSync(path.join(process.cwd(), "continue.md"), "utf8")}`;
  };
  input.on("line", (line: string) => {
    const request = JSON.parse(line) as {
      id?: number;
      method: string;
      params?: Record<string, unknown>;
    };
    if (request.id === undefined) return;
    if (request.method === "initialize")
      return send({ id: request.id, result: {} });
    if (request.method === "thread/start")
      return send({
        id: request.id,
        result: {
          thread: {
            id: "fixture-thread",
            cliVersion: "fixture-cli",
            status: { type: "idle" },
          },
        },
      });
    if (request.method === "thread/resume")
      return send(
        {
          id: request.id,
          result: {
            thread: {
              id: wrongThread ? "fixture-other-thread" : "fixture-thread",
              cliVersion: "fixture-cli",
              status: { type: "idle" },
            },
          },
        },
        () => {
          if (wrongThread) return;
          if (previousGoal) {
            send({
              method: "thread/tokenUsage/updated",
              params: {
                threadId: "fixture-thread",
                turnId: `turn-${goalIndex}`,
                tokenUsage: {
                  total: {
                    totalTokens: goalIndex * 10,
                    inputTokens: goalIndex * 6,
                    cachedInputTokens: goalIndex * 2,
                    cacheWriteInputTokens: goalIndex,
                    outputTokens: goalIndex * 4,
                    reasoningOutputTokens: goalIndex * 3,
                  },
                },
              },
            });
            const continueCurrentGoal = (): void => {
              goalIndex++;
              const turnId: string = `turn-${goalIndex}`;
              const total = {
                totalTokens: goalIndex * 10,
                inputTokens: goalIndex * 6,
                cachedInputTokens: goalIndex * 2,
                cacheWriteInputTokens: goalIndex,
                outputTokens: goalIndex * 4,
                reasoningOutputTokens: goalIndex * 3,
              };
              send({
                method: "thread/status/changed",
                params: {
                  threadId: "fixture-thread",
                  status: { type: "active" },
                },
              });
              send({
                method: "turn/started",
                params: {
                  threadId: "fixture-thread",
                  turn: { id: turnId },
                },
              });
              send({
                method: "thread/goal/updated",
                params: {
                  threadId: "fixture-thread",
                  goal: goal(retainedObjective(), "complete"),
                  turnId,
                },
              });
              send({
                method: "thread/tokenUsage/updated",
                params: {
                  threadId: "fixture-thread",
                  turnId,
                  tokenUsage: { total },
                },
              });
              waitingForTurnCompletion = true;
              send({
                method: "thread/status/changed",
                params: {
                  threadId: "fixture-thread",
                  status: { type: "idle" },
                },
              });
              setTimeout(() => {
                waitingForTurnCompletion = false;
                send({
                  method: "turn/completed",
                  params: {
                    threadId: "fixture-thread",
                    turn: { id: turnId, status: "completed", durationMs: 1 },
                  },
                });
              }, 10);
            };
            const emitSnapshot = (): void =>
              send(
                {
                  method: "thread/goal/updated",
                  params: {
                    threadId: "fixture-thread",
                    goal: goal(
                      retainedObjective(),
                      previousActive || currentActive ? "active" : "complete",
                    ),
                    turnId: null,
                  },
                },
                currentActive ? continueCurrentGoal : undefined,
              );
            if (lateResumeSnapshot) setTimeout(emitSnapshot, 10);
            else emitSnapshot();
          }
        },
      );
    if (request.method === "thread/goal/get")
      return send({
        id: request.id,
        result: {
          goal: emptyGoal
            ? null
            : previousGoal
              ? goal(
                  retainedObjective(),
                  activeGoalGet || previousActive || currentActive
                    ? "active"
                    : "complete",
                )
              : null,
        },
      });
    if (
      request.method !== "thread/goal/set" ||
      request.params?.status !== "active" ||
      typeof request.params.objective !== "string" ||
      waitingForTurnCompletion
    )
      return send({
        id: request.id,
        error: { message: `Unexpected request: ${request.method}` },
      });
    const objective: string = request.params.objective;
    goalIndex++;
    if (fail) {
      process.stderr.write("fixture interruption\n");
      return send(
        { id: request.id, result: { goal: goal(objective, "active") } },
        () => process.exit(7),
      );
    }
    const turnId: string = `turn-${goalIndex}`;
    const total = {
      totalTokens: goalIndex * 10,
      inputTokens: goalIndex * 6,
      cachedInputTokens: goalIndex * 2,
      cacheWriteInputTokens: goalIndex,
      outputTokens: goalIndex * 4,
      reasoningOutputTokens: goalIndex * 3,
    };
    send({
      id: request.id,
      result: {
        goal: goal(
          wrongGoal ? `${objective}\nwrong objective` : objective,
          "active",
        ),
      },
    });
    send({
      method: "thread/goal/updated",
      params: {
        threadId: "fixture-thread",
        goal: goal(objective, "active"),
        turnId: null,
      },
    });
    send({
      method: "thread/status/changed",
      params: {
        threadId: "fixture-thread",
        status: { type: "active" },
      },
    });
    if (blockedThenComplete)
      send({
        method: "thread/goal/updated",
        params: {
          threadId: "fixture-thread",
          goal: goal(objective, "blocked"),
        },
      });
    if (omitTerminalToken) {
      const previousTurnId: string = `${turnId}-previous`;
      send({
        method: "turn/started",
        params: {
          threadId: "fixture-thread",
          turn: { id: previousTurnId },
        },
      });
      send({
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "fixture-thread",
          turnId: previousTurnId,
          tokenUsage: { total },
        },
      });
      send({
        method: "thread/status/changed",
        params: {
          threadId: "fixture-thread",
          status: { type: "idle" },
        },
      });
      send({
        method: "turn/completed",
        params: {
          threadId: "fixture-thread",
          turn: { id: previousTurnId, status: "completed", durationMs: 1 },
        },
      });
    }
    send({
      method: "turn/started",
      params: {
        threadId: "fixture-thread",
        turn: { id: turnId },
      },
    });
    send({
      method: "thread/goal/updated",
      params: {
        threadId: "fixture-thread",
        goal: goal(objective, "complete"),
        turnId,
      },
    });
    if (!omitToken && !omitTerminalToken)
      send({
        method: "thread/tokenUsage/updated",
        params: {
          ...(missingThreadId ? {} : { threadId: "fixture-thread" }),
          turnId,
          tokenUsage: { total },
        },
      });
    waitingForTurnCompletion = true;
    send({
      method: "thread/status/changed",
      params: {
        threadId: "fixture-thread",
        status: { type: "idle" },
      },
    });
    setTimeout(() => {
      waitingForTurnCompletion = false;
      send({
        method: "turn/completed",
        params: {
          threadId: "fixture-thread",
          turn: { id: turnId, status: "completed", durationMs: 1 },
        },
      });
    }, 10);
  });
  input.on("close", () => {
    if (lateError) send({ id: -1, method: "fixture/late-error" });
  });
};

if (process.argv.includes("--fake-app-server")) fakeAppServer();
else
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
