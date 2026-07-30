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
      assert.equal(goal.tokenUsage.totalTokens, 10);
      assert.equal(goal.tokenUsage.inputTokens, 6);
      assert.equal(goal.tokenUsage.outputTokens, 4);
    });
    assert.equal(snapshots.at(-1)?.status, "completed");

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
        if (
          state.sessionId !== undefined &&
          state.goals[0]?.goal === null
        ) {
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

const fakeAppServer = (): void => {
  const fail: boolean = process.argv.includes("--fail");
  const lateError: boolean = process.argv.includes("--late-error");
  let goalIndex = 0;
  let waitingForIdle = false;
  const send = (value: unknown, callback?: () => void): void => {
    process.stdout.write(`${JSON.stringify(value)}\n`, callback);
  };
  const goal = (objective: string, status: "active" | "complete") => ({
    threadId: "fixture-thread",
    objective,
    status,
    tokenBudget: null,
    tokensUsed: goalIndex * 10,
    timeUsedSeconds: goalIndex,
    createdAt: 1,
    updatedAt: goalIndex + 1,
  });
  readline
    .createInterface({ input: process.stdin })
    .on("line", (line: string) => {
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
      if (
        request.method !== "thread/goal/set" ||
        request.params?.status !== "active" ||
        typeof request.params.objective !== "string" ||
        waitingForIdle
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
        cachedInputTokens: 0,
        cacheWriteInputTokens: 0,
        outputTokens: goalIndex * 4,
        reasoningOutputTokens: 0,
      };
      send({ id: request.id, result: { goal: goal(objective, "active") } });
      send({
        method: "turn/started",
        params: {
          threadId: "fixture-thread",
          turn: { id: turnId },
        },
      });
      send({
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "fixture-thread",
          tokenUsage: { total },
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
      send({
        method: "turn/completed",
        params: {
          threadId: "fixture-thread",
          turn: { id: turnId, status: "completed", durationMs: 1 },
        },
      });
      waitingForIdle = true;
      setTimeout(() => {
        waitingForIdle = false;
        send({
          method: "thread/status/changed",
          params: {
            threadId: "fixture-thread",
            status: { type: "idle" },
          },
        });
        if (lateError && goalIndex === ENTRIES.length)
          send({ id: -1, method: "fixture/late-error" });
      }, 10);
    });
};

if (process.argv.includes("--fake-app-server")) fakeAppServer();
else
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
