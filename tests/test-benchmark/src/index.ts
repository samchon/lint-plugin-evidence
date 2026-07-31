import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import { EvidenceBenchmarkRunner } from "../../../benchmark/src/EvidenceBenchmarkRunner.ts";
import type { IEvidenceBenchmarkOutput } from "../../../benchmark/src/structures/IEvidenceBenchmarkOutput.ts";
import type { IEvidenceBenchmarkRunState } from "../../../benchmark/src/structures/IEvidenceBenchmarkRunState.ts";
import type { IEvidenceBenchmarkTokenUsage } from "../../../benchmark/src/structures/IEvidenceBenchmarkTokenUsage.ts";

const EVIDENCE_ENTRIES = [
  ["backend-start", "evidence/backend/start.md"],
  ["backend-review", "evidence/backend/review.md"],
  ["backend-final", "evidence/backend/final.md"],
  ["frontend-start", "evidence/frontend/start.md"],
  ["frontend-review", "evidence/frontend/review.md"],
  ["frontend-final", "evidence/frontend/final.md"],
  ["overall-review", "evidence/overall/review.md"],
  ["overall-final", "evidence/overall/final.md"],
] as const;

const PLAIN_ENTRIES = [
  ["backend-start", "plain/backend/start.md"],
  ["backend-review", "plain/backend/review.md"],
  ["backend-final", "plain/backend/final.md"],
  ["frontend-start", "plain/frontend/start.md"],
  ["frontend-review", "plain/frontend/review.md"],
  ["frontend-final", "plain/frontend/final.md"],
  ["overall-review", "plain/overall/review.md"],
  ["overall-final", "plain/overall/final.md"],
] as const;

const ENTRIES = EVIDENCE_ENTRIES;

/**
 * Verifies the small production runner against a free app-server fixture.
 *
 * Each prescribed instruction and its arm-owned continuation become one active
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
    assert.deepEqual(
      EvidenceBenchmarkRunner.instructionEntries("evidence"),
      EVIDENCE_ENTRIES,
    );
    assert.deepEqual(
      EvidenceBenchmarkRunner.instructionEntries("plain"),
      PLAIN_ENTRIES,
    );
    assert.equal(
      EvidenceBenchmarkRunner.instructionContinuationPath("evidence"),
      "evidence/continue.md",
    );
    assert.equal(
      EvidenceBenchmarkRunner.instructionContinuationPath("plain"),
      "plain/continue.md",
    );
    const evidencePaths: Set<string> = new Set(
      EVIDENCE_ENTRIES.map((entry) => entry[1]),
    );
    assert.equal(
      PLAIN_ENTRIES.some((entry) => evidencePaths.has(entry[1])),
      false,
    );
    PLAIN_ENTRIES.forEach((entry, index) =>
      assert.notDeepEqual(
        sources.get(entry[1]),
        sources.get(EVIDENCE_ENTRIES[index]![1]),
      ),
    );
    assert.notDeepEqual(
      sources.get("plain/continue.md"),
      sources.get("evidence/continue.md"),
    );
    const orphan = spawn(
      process.execPath,
      ["-e", "setInterval(() => undefined, 1000)"],
      {
        detached: process.platform !== "win32",
        stdio: "ignore",
        windowsHide: true,
      },
    );
    assert.notEqual(orphan.pid, undefined);
    const orphanClosed = new Promise<void>((resolve) => {
      orphan.once("close", () => resolve());
    });
    spawn(
      process.execPath,
      [
        path.join(
          import.meta.dirname,
          "../../../benchmark/src/executable/EvidenceBenchmarkProcessMonitor.mjs",
        ),
        "999999999",
        String(orphan.pid),
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    ).unref();
    await Promise.race([
      orphanClosed,
      new Promise<never>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error("Owner monitor left an orphan process.")),
          5_000,
        ),
      ),
    ]);
    const prefix: string[] = [
      "--experimental-transform-types",
      import.meta.filename,
      "--fake-app-server",
    ];
    const snapshots: IEvidenceBenchmarkRunState[] = [];
    const completedOutput: IEvidenceBenchmarkOutput[] = [];
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
      const prescribed: string = readPrescribed(sources, relative);
      const continuation: string = sources
        .get("evidence/continue.md")!
        .toString("utf8");
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
      } satisfies IEvidenceBenchmarkTokenUsage);
      assert.equal(goal.elapsedMs, 1_000);
    });
    assert.deepEqual(completed.threadTokenUsage, {
      totalTokens: ENTRIES.length * 10,
      inputTokens: ENTRIES.length * 6,
      cachedInputTokens: ENTRIES.length * 2,
      cacheWriteInputTokens: ENTRIES.length,
      outputTokens: ENTRIES.length * 4,
      reasoningOutputTokens: ENTRIES.length * 3,
    } satisfies IEvidenceBenchmarkTokenUsage);
    assert.equal(snapshots.at(-1)?.status, "completed");

    const plain = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("plain"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(plain.status, "completed");
    plain.goals.forEach((goal, index) => {
      const entry = PLAIN_ENTRIES[index]!;
      const prescribed: string = readPrescribed(sources, entry[1]);
      const continuation: string = sources
        .get("plain/continue.md")!
        .toString("utf8");
      assert.equal(goal.relativePath, entry[1]);
      assert.equal(goal.prescribedText, prescribed);
      assert.equal(goal.continuationText, continuation);
      assert.equal(goal.objectiveText, `${prescribed}\n\n${continuation}`);
      assert.equal(goal.goal?.objective, goal.objectiveText);
    });

    const forcedCleanup = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--hang-on-close"],
      shutdownGraceMs: 50,
      onOutput: () => undefined,
    });
    assert.equal(forcedCleanup.status, "completed");
    assert.equal(forcedCleanup.nextInstructionIndex, ENTRIES.length);
    assert.equal(forcedCleanup.processes[0]?.shutdownForced, true);
    assert.equal(
      Number.isSafeInteger(forcedCleanup.processes[0]?.processId),
      true,
    );

    const retainedCleanup = structuredClone(forcedCleanup);
    retainedCleanup.status = "interrupted";
    retainedCleanup.interruption = {
      name: "Error",
      message: "Codex app-server survived forced process-tree cleanup.",
    };
    delete retainedCleanup.processes[0]?.processId;
    const recoveredCleanup = await EvidenceBenchmarkRunner.run({
      state: retainedCleanup,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(recoveredCleanup.status, "completed");
    assert.equal(recoveredCleanup.interruption, undefined);

    const unrelatedInterruption = structuredClone(retainedCleanup);
    unrelatedInterruption.interruption = {
      name: "Error",
      message: "An unrelated terminal failure.",
    };
    const retainedInterruption = await EvidenceBenchmarkRunner.run({
      state: unrelatedInterruption,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(retainedInterruption.status, "interrupted");
    assert.equal(
      retainedInterruption.interruption?.message,
      "An unrelated terminal failure.",
    );

    const inheritedStream = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--inherit-stream-after-exit"],
      shutdownGraceMs: 50,
      onOutput: () => undefined,
    });
    assert.equal(inheritedStream.status, "completed");
    assert.notEqual(inheritedStream.processes[0]?.exitCode, null);
    assert.notEqual(inheritedStream.processes[0]?.shutdownForced, true);

    const terminalLineBreakOutput: IEvidenceBenchmarkOutput[] = [];
    const terminalLineBreak = await EvidenceBenchmarkRunner.run({
      state: EvidenceBenchmarkRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--trim-terminal-line-breaks"],
      onOutput: (_processIndex, output) => {
        terminalLineBreakOutput.push(output);
      },
    });
    assert.equal(terminalLineBreak.status, "completed");
    assert.equal(terminalLineBreak.nextInstructionIndex, ENTRIES.length);
    assert.equal(terminalLineBreak.goals.length, ENTRIES.length);
    const terminalLineBreakRequests = terminalLineBreakOutput
      .filter((output) => output.stream === "stdin")
      .map((output) => JSON.parse(output.text) as Record<string, unknown>)
      .filter((request) => request.method === "thread/goal/set");
    assert.equal(terminalLineBreakRequests.length, ENTRIES.length);
    terminalLineBreak.goals.forEach((goal, index) => {
      const objective: string = readObjective(root, sources, ENTRIES[index]!);
      assert.ok(objective.endsWith("\r\n"));
      assert.equal(goal.objectiveText, objective);
      assert.deepEqual(Buffer.from(goal.objectiveText), Buffer.from(objective));
      assert.equal(
        (terminalLineBreakRequests[index]?.params as Record<string, unknown>)
          ?.objective,
        objective,
      );
      assert.equal(goal.goal?.objective, objective.replace(/[\r\n]+$/u, ""));
    });

    const terminalLineBreakBoundary = structuredClone(terminalLineBreak);
    terminalLineBreakBoundary.status = "interrupted";
    terminalLineBreakBoundary.nextInstructionIndex = 1;
    terminalLineBreakBoundary.goals = terminalLineBreakBoundary.goals.slice(
      0,
      1,
    );
    terminalLineBreakBoundary.threadTokenUsage = structuredClone(
      terminalLineBreakBoundary.goals[0]!.tokenUsageEnd!,
    );
    const terminalLineBreakResume = await EvidenceBenchmarkRunner.run({
      state: terminalLineBreakBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--previous-goal",
        "--trim-terminal-line-breaks",
      ],
      onOutput: () => undefined,
    });
    assert.equal(terminalLineBreakResume.status, "completed");

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

    const interruptedOutput: IEvidenceBenchmarkOutput[] = [];
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

    const stateFailureOutput: IEvidenceBenchmarkOutput[] = [];
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
    const undispatchedBoundary = structuredClone(stateFailure);
    const usedUndispatchedBoundary = structuredClone(stateFailure);
    const adoptedUndispatchedGoal = await EvidenceBenchmarkRunner.run({
      state: undispatchedBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--undispatched-active"],
      onOutput: () => undefined,
    });
    assert.equal(adoptedUndispatchedGoal.status, "completed");
    assert.equal(adoptedUndispatchedGoal.nextInstructionIndex, ENTRIES.length);
    const rejectedUsedUndispatchedGoal = await EvidenceBenchmarkRunner.run({
      state: usedUndispatchedBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--undispatched-used"],
      onOutput: () => undefined,
    });
    assert.equal(rejectedUsedUndispatchedGoal.status, "interrupted");
    assert.match(
      rejectedUsedUndispatchedGoal.interruption?.message ?? "",
      /exact retained boundary/,
    );
    const nextUndispatchedBoundary = structuredClone(completed);
    nextUndispatchedBoundary.status = "interrupted";
    nextUndispatchedBoundary.nextInstructionIndex = 1;
    nextUndispatchedBoundary.goals = nextUndispatchedBoundary.goals.slice(0, 2);
    const nextUndispatchedRecord = nextUndispatchedBoundary.goals[1]!;
    nextUndispatchedRecord.goal = null;
    nextUndispatchedRecord.terminalTurnId = null;
    nextUndispatchedRecord.terminalTurnCompleted = false;
    nextUndispatchedRecord.threadIdle = false;
    nextUndispatchedRecord.tokenUsageTurnId = null;
    nextUndispatchedRecord.tokenUsageEnd = null;
    nextUndispatchedRecord.tokenUsage = {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    };
    nextUndispatchedBoundary.threadTokenUsage = structuredClone(
      nextUndispatchedBoundary.goals[0]!.tokenUsageEnd!,
    );
    const adoptedNextUndispatchedGoal = await EvidenceBenchmarkRunner.run({
      state: nextUndispatchedBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--undispatched-next"],
      onOutput: () => undefined,
    });
    assert.equal(adoptedNextUndispatchedGoal.status, "completed");
    assert.equal(
      adoptedNextUndispatchedGoal.nextInstructionIndex,
      ENTRIES.length,
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
    const completedCurrentOutput: IEvidenceBenchmarkOutput[] = [];
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
    const activeCurrentOutput: IEvidenceBenchmarkOutput[] = [];
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

    const blockedCurrentBoundary = structuredClone(activeCurrentBoundary);
    const blockedCurrentRecord = blockedCurrentBoundary.goals[1]!;
    blockedCurrentRecord.goal!.status = "blocked";
    blockedCurrentRecord.tokenUsageTurnId = "turn-2";
    blockedCurrentBoundary.threadTokenUsage = {
      totalTokens: 20,
      inputTokens: 12,
      cachedInputTokens: 4,
      cacheWriteInputTokens: 2,
      outputTokens: 8,
      reasoningOutputTokens: 6,
    };
    const blockedCurrentOutput: IEvidenceBenchmarkOutput[] = [];
    const blockedCurrentResume = await EvidenceBenchmarkRunner.run({
      state: blockedCurrentBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--current-blocked",
        "--resume-status-before-response",
      ],
      onOutput: (_processIndex, output) => {
        blockedCurrentOutput.push(output);
      },
    });
    assert.equal(blockedCurrentResume.status, "completed");
    const blockedResumedGoalRequests = blockedCurrentOutput
      .filter((output) => output.stream === "stdin")
      .map((output) => JSON.parse(output.text) as Record<string, unknown>)
      .filter((request) => request.method === "thread/goal/set");
    assert.equal(blockedResumedGoalRequests.length, ENTRIES.length - 1);
    assert.equal(
      (blockedResumedGoalRequests[0]?.params as Record<string, unknown>)
        ?.objective,
      readObjective(root, sources, ENTRIES[1]!),
    );

    const advancedBlockedResume = await EvidenceBenchmarkRunner.run({
      state: blockedCurrentBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--current-blocked",
        "--advanced-interrupted-replay",
      ],
      onOutput: () => undefined,
    });
    assert.equal(advancedBlockedResume.status, "completed");

    const uncheckpointedActiveSnapshots: IEvidenceBenchmarkRunState[] = [];
    const uncheckpointedActiveResume = await EvidenceBenchmarkRunner.run({
      state: activeCurrentBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--current-active",
        "--advanced-interrupted-replay",
      ],
      onOutput: () => undefined,
      onState: (state) => {
        uncheckpointedActiveSnapshots.push(state);
      },
    });
    assert.equal(
      uncheckpointedActiveResume.status,
      "completed",
      JSON.stringify(uncheckpointedActiveResume.interruption),
    );
    assert.equal(
      uncheckpointedActiveSnapshots.some(
        (snapshot) =>
          snapshot.threadTokenUsage.totalTokens === 15 &&
          snapshot.goals[1]?.tokenUsageTurnId === "turn-interrupted",
      ),
      true,
    );

    const unprovenUncheckpointedActiveResume =
      await EvidenceBenchmarkRunner.run({
        state: activeCurrentBoundary,
        cwd: root,
        instructionsRoot: root,
        model: "fixture-model",
        effort: "high",
        command: process.execPath,
        commandPrefixArguments: [
          ...prefix,
          "--current-active",
          "--unproven-interrupted-replay",
        ],
        onOutput: () => undefined,
      });
    assert.equal(unprovenUncheckpointedActiveResume.status, "interrupted");
    assert.match(
      unprovenUncheckpointedActiveResume.interruption?.message ?? "",
      /exact retained or next turn/,
    );

    const activeInterruptedBoundary = structuredClone(blockedCurrentBoundary);
    activeInterruptedBoundary.goals[1]!.goal!.status = "active";
    const activeInterruptedResume = await EvidenceBenchmarkRunner.run({
      state: activeInterruptedBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--current-interrupted-active",
        "--same-turn-interrupted-replay",
      ],
      onOutput: () => undefined,
    });
    assert.equal(
      activeInterruptedResume.status,
      "completed",
      JSON.stringify(activeInterruptedResume.interruption),
    );

    const unprovenBlockedResume = await EvidenceBenchmarkRunner.run({
      state: blockedCurrentBoundary,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [
        ...prefix,
        "--current-blocked",
        "--unproven-interrupted-replay",
      ],
      onOutput: () => undefined,
    });
    assert.equal(unprovenBlockedResume.status, "interrupted");
    assert.match(
      unprovenBlockedResume.interruption?.message ?? "",
      /exact retained or next turn/,
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
    [
      "evidence/continue.md",
      Buffer.from("Continue until this Goal is complete.\r\n"),
    ],
    ["plain/continue.md", Buffer.from("Finish the Plain Goal.\r\n")],
  ]);
  ENTRIES.forEach(([name, relative]) =>
    sources.set(relative, Buffer.from(`# ${name}\r\n\r\nExecute exactly.\r\n`)),
  );
  PLAIN_ENTRIES.forEach(([name, relative]) =>
    sources.set(
      relative,
      Buffer.from(`# Plain ${name}\r\n\r\nExecute only Plain.\r\n`),
    ),
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
  const prescribed: string = readPrescribed(sources, entry[1]);
  const continuation: Buffer | undefined = sources.get("evidence/continue.md");
  assert.ok(
    continuation,
    `Missing fixture source: ${path.join(root, "evidence/continue.md")}`,
  );
  return `${prescribed}\n\n${continuation.toString("utf8")}`;
};

const readPrescribed = (
  sources: ReadonlyMap<string, Buffer>,
  relativePath: string,
): string => {
  const source: Buffer | undefined = sources.get(relativePath);
  assert.ok(source, `Missing fixture source: ${relativePath}`);
  const prescribed: string = source.toString("utf8");
  if (!relativePath.endsWith("/final.md")) return prescribed;
  const reviewPath: string = relativePath.replace(
    /\/final\.md$/u,
    "/review.md",
  );
  const review: Buffer | undefined = sources.get(reviewPath);
  assert.ok(review, `Missing fixture source: ${reviewPath}`);
  const lines: string[] = review.toString("utf8").split(/\r\n|\n|\r/u);
  if (lines.at(-1) === "") lines.pop();
  const quote: string = lines.map((line) => `> ${line}`).join("\n");
  const separator: string = prescribed.endsWith("\n") ? "\n" : "\n\n";
  return `${prescribed}${separator}${quote}`;
};

const fakeAppServer = (): void => {
  const fail: boolean = process.argv.includes("--fail");
  const hangOnClose: boolean = process.argv.includes("--hang-on-close");
  const inheritStreamAfterExit: boolean = process.argv.includes(
    "--inherit-stream-after-exit",
  );
  const lateError: boolean = process.argv.includes("--late-error");
  const blockedThenComplete: boolean = process.argv.includes(
    "--blocked-then-complete",
  );
  const activeGoalGet: boolean = process.argv.includes("--active-goal-get");
  const advancedInterruptedReplay: boolean = process.argv.includes(
    "--advanced-interrupted-replay",
  );
  const sameTurnInterruptedReplay: boolean = process.argv.includes(
    "--same-turn-interrupted-replay",
  );
  const unprovenInterruptedReplay: boolean = process.argv.includes(
    "--unproven-interrupted-replay",
  );
  const emptyGoal: boolean = process.argv.includes("--empty-goal");
  const omitToken: boolean = process.argv.includes("--omit-token");
  const omitTerminalToken: boolean = process.argv.includes(
    "--omit-terminal-token",
  );
  const currentActive: boolean = process.argv.includes("--current-active");
  const currentBlocked: boolean = process.argv.includes("--current-blocked");
  const currentInterruptedActive: boolean = process.argv.includes(
    "--current-interrupted-active",
  );
  const currentGoal: boolean =
    currentActive ||
    currentBlocked ||
    currentInterruptedActive ||
    process.argv.includes("--current-goal");
  const lateResumeSnapshot: boolean = process.argv.includes(
    "--late-resume-snapshot",
  );
  const missingThreadId: boolean = process.argv.includes("--missing-thread-id");
  const previousActive: boolean = process.argv.includes("--previous-active");
  const undispatchedActive: boolean = process.argv.includes(
    "--undispatched-active",
  );
  const undispatchedUsed: boolean = process.argv.includes(
    "--undispatched-used",
  );
  const undispatchedNext: boolean = process.argv.includes(
    "--undispatched-next",
  );
  const undispatched: boolean =
    undispatchedActive || undispatchedUsed || undispatchedNext;
  const previousGoal: boolean =
    currentGoal ||
    previousActive ||
    undispatched ||
    process.argv.includes("--previous-goal");
  const resumeStatusBeforeResponse: boolean = process.argv.includes(
    "--resume-status-before-response",
  );
  const wrongGoal: boolean = process.argv.includes("--wrong-goal");
  const wrongThread: boolean = process.argv.includes("--wrong-thread");
  const trimTerminalLineBreaks: boolean = process.argv.includes(
    "--trim-terminal-line-breaks",
  );
  let goalIndex = undispatchedActive
    ? 0
    : currentActive || undispatchedNext
      ? 1
      : currentGoal
        ? 2
        : previousGoal
          ? 1
          : 0;
  let undispatchedSnapshotPending = undispatched;
  let waitingForTurnCompletion = false;
  const send = (value: unknown, callback?: () => void): void => {
    process.stdout.write(`${JSON.stringify(value)}\n`, callback);
  };
  const goal = (
    objective: string,
    status: "active" | "blocked" | "complete",
  ) => ({
    threadId: "fixture-thread",
    objective: trimTerminalLineBreaks
      ? objective.replace(/[\r\n]+$/u, "")
      : objective,
    status,
    tokenBudget: null,
    tokensUsed: undispatchedSnapshotPending
      ? undispatchedUsed
        ? 10
        : 0
      : goalIndex * 10,
    timeUsedSeconds: undispatchedSnapshotPending
      ? undispatchedUsed
        ? 1
        : 0
      : goalIndex,
    createdAt: 1,
    updatedAt: goalIndex + 1,
  });
  const input = readline.createInterface({ input: process.stdin });
  const retainedObjective = (): string => {
    const relativePath: string =
      ENTRIES[currentGoal || undispatchedNext ? 1 : 0]![1];
    return `${fs.readFileSync(
      path.join(process.cwd(), ...relativePath.split("/")),
      "utf8",
    )}\n\n${fs.readFileSync(
      path.join(process.cwd(), "evidence", "continue.md"),
      "utf8",
    )}`;
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
    if (request.method === "thread/resume") {
      const respond = (): void =>
        send(
          {
            id: request.id,
            result: {
              thread: {
                id: wrongThread ? "fixture-other-thread" : "fixture-thread",
                cliVersion: "fixture-cli",
                status: { type: "idle" },
                turns: sameTurnInterruptedReplay
                  ? [
                      {
                        id: `turn-${goalIndex}`,
                        status: "interrupted",
                      },
                      {
                        id: "turn-empty-interrupted",
                        status: "interrupted",
                      },
                    ]
                  : advancedInterruptedReplay || unprovenInterruptedReplay
                    ? [
                        { id: `turn-${goalIndex}`, status: "completed" },
                        ...(advancedInterruptedReplay
                          ? [
                              {
                                id: "turn-interrupted",
                                status: "interrupted",
                              },
                            ]
                          : []),
                      ]
                    : undefined,
              },
            },
          },
          () => {
            if (wrongThread) return;
            if (previousGoal) {
              if (!undispatched || undispatchedNext) {
                const advancedTotal = currentActive
                  ? {
                      totalTokens: 15,
                      inputTokens: 9,
                      cachedInputTokens: 3,
                      cacheWriteInputTokens: 1,
                      outputTokens: 6,
                      reasoningOutputTokens: 4,
                    }
                  : {
                      totalTokens: 25,
                      inputTokens: 15,
                      cachedInputTokens: 5,
                      cacheWriteInputTokens: 2,
                      outputTokens: 10,
                      reasoningOutputTokens: 7,
                    };
                const replay =
                  advancedInterruptedReplay ||
                  unprovenInterruptedReplay ||
                  sameTurnInterruptedReplay
                    ? {
                        turnId: sameTurnInterruptedReplay
                          ? `turn-${goalIndex}`
                          : "turn-interrupted",
                        total: advancedTotal,
                      }
                    : {
                        turnId: `turn-${goalIndex}`,
                        total: {
                          totalTokens: goalIndex * 10,
                          inputTokens: goalIndex * 6,
                          cachedInputTokens: goalIndex * 2,
                          cacheWriteInputTokens: goalIndex,
                          outputTokens: goalIndex * 4,
                          reasoningOutputTokens: goalIndex * 3,
                        },
                      };
                send({
                  method: "thread/tokenUsage/updated",
                  params: {
                    threadId: "fixture-thread",
                    turnId: replay.turnId,
                    tokenUsage: { total: replay.total },
                  },
                });
              }
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
                        currentBlocked
                          ? "blocked"
                          : previousActive ||
                              undispatched ||
                              currentActive ||
                              currentInterruptedActive
                            ? "active"
                            : "complete",
                      ),
                      turnId: null,
                    },
                  },
                  currentActive || currentInterruptedActive
                    ? continueCurrentGoal
                    : undefined,
                );
              if (lateResumeSnapshot) setTimeout(emitSnapshot, 10);
              else emitSnapshot();
            }
          },
        );
      if (resumeStatusBeforeResponse)
        return send(
          {
            method: "thread/status/changed",
            params: {
              threadId: "fixture-thread",
              status: { type: "idle" },
            },
          },
          respond,
        );
      return respond();
    }
    if (request.method === "thread/goal/get")
      return send({
        id: request.id,
        result: {
          goal: emptyGoal
            ? null
            : previousGoal
              ? goal(
                  retainedObjective(),
                  currentBlocked
                    ? "blocked"
                    : activeGoalGet ||
                        previousActive ||
                        undispatched ||
                        currentActive ||
                        currentInterruptedActive
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
    undispatchedSnapshotPending = false;
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
    if (hangOnClose) setInterval(() => undefined, 1_000);
    if (inheritStreamAfterExit)
      spawn(process.execPath, ["-e", "setTimeout(() => undefined, 500)"], {
        detached: true,
        stdio: ["ignore", process.stdout, process.stderr],
        windowsHide: true,
      }).unref();
  });
};

if (process.argv.includes("--fake-app-server")) fakeAppServer();
else
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
