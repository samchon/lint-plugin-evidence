import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkClaudeRunner } from "../../../benchmark/src/EvidenceBenchmarkClaudeRunner.ts";
import { EvidenceBenchmarkRunner } from "../../../benchmark/src/EvidenceBenchmarkRunner.ts";
import type { IEvidenceBenchmarkClaudeTokenUsage } from "../../../benchmark/src/structures/IEvidenceBenchmarkClaudeTokenUsage.ts";
import type { IEvidenceBenchmarkOutput } from "../../../benchmark/src/structures/IEvidenceBenchmarkOutput.ts";

/**
 * Verifies the Claude Code adapter against a free stream-JSON fixture.
 *
 * The adapter must preserve nine exact instructions in one native session
 * without inventing Codex Goal semantics or losing paid failure measurements.
 *
 * 1. Complete the sequence with one created session and eight resumes.
 * 2. Retain requested and resolved models, tokens, cost, and raw output.
 * 3. Preserve error-result usage and refuse an inexact dispatched retry.
 * 4. Resume failures before dispatch and reject invalid completed state.
 */
const main = async (): Promise<void> => {
  const root: string = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-benchmark-claude-"),
  );
  try {
    const sources: Map<string, Buffer> = writeInstructions(root);
    const prefix: string[] = [
      "--experimental-transform-types",
      import.meta.filename,
      "--fake-claude",
    ];
    const output: IEvidenceBenchmarkOutput[] = [];
    const completed = await EvidenceBenchmarkClaudeRunner.run({
      state: EvidenceBenchmarkClaudeRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: (_processIndex, event) => {
        output.push(event);
      },
    });

    const entries = EvidenceBenchmarkRunner.instructionEntries("evidence");
    assert.equal(completed.status, "completed");
    assert.equal(completed.cliVersion, "fixture-cli");
    assert.equal(completed.nativeModel, "fixture-resolved-model");
    assert.equal(completed.nextInstructionIndex, entries.length);
    assert.equal(completed.instructions.length, entries.length);
    assert.equal(completed.processes.length, entries.length);
    assert.deepEqual(completed.tokenUsage, {
      totalTokens: 90,
      inputTokens: 27,
      cachedInputTokens: 18,
      cacheWriteInputTokens: 9,
      outputTokens: 36,
    } satisfies IEvidenceBenchmarkClaudeTokenUsage);
    assert.equal("reasoningOutputTokens" in completed.tokenUsage, false);
    assert.equal(completed.costUsd, entries.length * 0.01);
    completed.processes.forEach((process, index) => {
      assert.equal(process.exitCode, 0);
      assert.equal(process.signal, null);
      assert.equal(
        process.arguments.includes("--disable-slash-commands"),
        true,
      );
      const sessionFlag: string = index === 0 ? "--session-id" : "--resume";
      assert.equal(
        process.arguments[process.arguments.indexOf("--model") + 1],
        "fixture-model",
      );
      assert.equal(
        process.arguments[process.arguments.indexOf(sessionFlag) + 1],
        completed.sessionId,
      );
    });
    completed.instructions.forEach((instruction, index) => {
      const [name, relativePath] = entries[index]!;
      const prescribedText: string = sources
        .get(relativePath)!
        .toString("utf8");
      const continuationText: string = sources
        .get("continue.md")!
        .toString("utf8");
      assert.equal(instruction.name, name);
      assert.equal(instruction.relativePath, relativePath);
      assert.equal(instruction.prescribedText, prescribedText);
      assert.equal(instruction.continuationText, continuationText);
      assert.equal(
        instruction.objectiveText,
        `${prescribedText}\n\n${continuationText}`,
      );
      assert.equal(instruction.inputDispatched, true);
      assert.equal(instruction.completed, true);
      assert.equal(instruction.processIndexes.length, 1);
      assert.deepEqual(instruction.tokenUsage, {
        totalTokens: 10,
        inputTokens: 3,
        cachedInputTokens: 2,
        cacheWriteInputTokens: 1,
        outputTokens: 4,
      } satisfies IEvidenceBenchmarkClaudeTokenUsage);
      assert.equal(instruction.costUsd, 0.01);
    });
    assert.deepEqual(
      output
        .filter((event) => event.stream === "stdin")
        .map((event) => event.text),
      completed.instructions.map((instruction) => instruction.objectiveText),
    );

    if (process.platform === "win32") {
      const shimDirectory: string = path.join(root, "command shims");
      const shim: string = path.join(shimDirectory, "claude.cmd");
      fs.mkdirSync(shimDirectory);
      fs.writeFileSync(
        shim,
        [
          "@echo off",
          'if "%~1"=="--version" (',
          "  echo fixture-cli",
          "  exit /b 0",
          ")",
          `"${process.execPath}" --experimental-transform-types "${import.meta.filename}" --fake-claude %*`,
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
      const spacedCommand = await EvidenceBenchmarkClaudeRunner.run({
        state: EvidenceBenchmarkClaudeRunner.create("evidence"),
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
        /claude\.cmd/,
      );
    }

    const interrupted = await EvidenceBenchmarkClaudeRunner.run({
      state: EvidenceBenchmarkClaudeRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--fail"],
      onOutput: () => undefined,
    });
    assert.equal(interrupted.status, "interrupted");
    assert.equal(interrupted.nextInstructionIndex, 0);
    assert.equal(interrupted.instructions[0]?.inputDispatched, true);
    assert.equal(interrupted.instructions[0]?.completed, false);
    assert.equal(interrupted.processes[0]?.exitCode, 7);

    const errorResult = await EvidenceBenchmarkClaudeRunner.run({
      state: EvidenceBenchmarkClaudeRunner.create("evidence"),
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: [...prefix, "--error-result"],
      onOutput: () => undefined,
    });
    assert.equal(errorResult.status, "interrupted");
    assert.equal(errorResult.instructions[0]?.completed, false);
    assert.equal(
      errorResult.instructions[0]?.terminalResult?.subtype,
      "error_during_execution",
    );
    assert.deepEqual(errorResult.instructions[0]?.tokenUsage, {
      totalTokens: 5,
      inputTokens: 1,
      cachedInputTokens: 1,
      cacheWriteInputTokens: 1,
      outputTokens: 2,
    } satisfies IEvidenceBenchmarkClaudeTokenUsage);
    assert.deepEqual(errorResult.tokenUsage, {
      totalTokens: 5,
      inputTokens: 1,
      cachedInputTokens: 1,
      cacheWriteInputTokens: 1,
      outputTokens: 2,
    } satisfies IEvidenceBenchmarkClaudeTokenUsage);
    assert.equal(errorResult.instructions[0]?.costUsd, 0.02);
    assert.equal(errorResult.costUsd, 0.02);
    assert.equal(errorResult.processes[0]?.exitCode, 1);

    const resumed = await EvidenceBenchmarkClaudeRunner.run({
      state: interrupted,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(resumed.status, "interrupted");
    assert.equal(resumed.processes.length, 1);
    assert.match(
      resumed.interruption?.message ?? "",
      /exact resume is unavailable/,
    );

    const outputFailure = await EvidenceBenchmarkClaudeRunner.run({
      state: EvidenceBenchmarkClaudeRunner.create("evidence"),
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
    assert.equal(outputFailure.instructions[0]?.inputDispatched, false);
    assert.ok((outputFailure.processes[0]?.elapsedMs ?? -1) >= 0);
    assert.equal(
      outputFailure.processes[0]?.exitCode === null &&
        outputFailure.processes[0]?.signal === null,
      false,
    );
    const outputFailureResume = await EvidenceBenchmarkClaudeRunner.run({
      state: outputFailure,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(outputFailureResume.status, "completed");

    let completionCheckpointFailed = false;
    const completionCheckpointFailure = await EvidenceBenchmarkClaudeRunner.run(
      {
        state: EvidenceBenchmarkClaudeRunner.create("evidence"),
        cwd: root,
        instructionsRoot: root,
        model: "fixture-model",
        effort: "high",
        command: process.execPath,
        commandPrefixArguments: prefix,
        onOutput: () => undefined,
        onState: (state) => {
          if (!completionCheckpointFailed && state.instructions[0]?.completed) {
            completionCheckpointFailed = true;
            throw new Error("fixture completion checkpoint failure");
          }
        },
      },
    );
    assert.equal(completionCheckpointFailure.status, "interrupted");
    assert.equal(completionCheckpointFailure.instructions[0]?.completed, true);
    const completionCheckpointResume = await EvidenceBenchmarkClaudeRunner.run({
      state: completionCheckpointFailure,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(completionCheckpointResume.status, "completed");

    const closedCursor = structuredClone(completed);
    closedCursor.status = "interrupted";
    const closed = await EvidenceBenchmarkClaudeRunner.run({
      state: closedCursor,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(closed.status, "completed");
    assert.equal(closed.interruption, undefined);
    assert.equal(closed.processes.length, entries.length);

    const interruptedCursor = structuredClone(completed);
    interruptedCursor.status = "interrupted";
    interruptedCursor.interruption = {
      name: "FixtureInterruption",
      message: "fixture terminal interruption",
    };
    const retainedInterruption = await EvidenceBenchmarkClaudeRunner.run({
      state: interruptedCursor,
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
      "fixture terminal interruption",
    );

    const invalidCursor = structuredClone(completed);
    invalidCursor.status = "interrupted";
    invalidCursor.instructions.at(-1)!.terminalResult = null;
    const rejectedCursor = await EvidenceBenchmarkClaudeRunner.run({
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
      /invalid completed instruction/,
    );
    assert.equal(rejectedCursor.processes.length, entries.length);

    const wrongSession = structuredClone(completed);
    wrongSession.status = "interrupted";
    wrongSession.instructions.at(-1)!.terminalResult!.session_id =
      "fixture-other-session";
    const rejectedSession = await EvidenceBenchmarkClaudeRunner.run({
      state: wrongSession,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(rejectedSession.status, "interrupted");
    assert.match(
      rejectedSession.interruption?.message ?? "",
      /invalid completed instruction/,
    );

    const undispatched = structuredClone(completed);
    undispatched.status = "interrupted";
    undispatched.instructions.at(-1)!.inputDispatched = false;
    const rejectedUndispatched = await EvidenceBenchmarkClaudeRunner.run({
      state: undispatched,
      cwd: root,
      instructionsRoot: root,
      model: "fixture-model",
      effort: "high",
      command: process.execPath,
      commandPrefixArguments: prefix,
      onOutput: () => undefined,
    });
    assert.equal(rejectedUndispatched.status, "interrupted");
    assert.match(
      rejectedUndispatched.interruption?.message ?? "",
      /invalid completed instruction/,
    );

    const invalidMeasurements = structuredClone(completed);
    invalidMeasurements.status = "interrupted";
    invalidMeasurements.instructions.at(-1)!.tokenUsage.outputTokens++;
    const rejectedMeasurements = await EvidenceBenchmarkClaudeRunner.run({
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
      /invalid instruction measurements/,
    );

    for (const [relativePath, source] of sources)
      assert.deepEqual(
        fs.readFileSync(path.join(root, ...relativePath.split("/"))),
        source,
      );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const writeInstructions = (root: string): Map<string, Buffer> => {
  const sources: Map<string, Buffer> = new Map([
    ["continue.md", Buffer.from("Continue until completion.\r\n")],
  ]);
  for (const [name, relativePath] of EvidenceBenchmarkRunner.instructionEntries(
    "evidence",
  ))
    sources.set(
      relativePath,
      Buffer.from(`# ${name}\r\n\r\nExecute exactly.\r\n`),
    );
  for (const [relativePath, source] of sources) {
    const location: string = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, source);
  }
  return sources;
};

const fakeClaude = (): void => {
  if (process.argv.includes("--version")) {
    process.stdout.write("fixture-cli\n");
    return;
  }
  const value = (name: string): string => {
    const index: number = process.argv.indexOf(name);
    if (index === -1 || process.argv[index + 1] === undefined)
      throw new Error(`Missing fixture argument: ${name}.`);
    return process.argv[index + 1]!;
  };
  const sessionId: string = process.argv.includes("--session-id")
    ? value("--session-id")
    : value("--resume");
  process.stdin.setEncoding("utf8");
  let input = "";
  process.stdin.on("data", (chunk: string) => {
    input += chunk;
  });
  process.stdin.on("end", () => {
    process.stdout.write(
      `${JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: sessionId,
        claude_code_version: "fixture-cli",
        model: "fixture-resolved-model",
        cwd: process.cwd(),
        permissionMode: "bypassPermissions",
      })}\n`,
    );
    if (process.argv.includes("--fail")) {
      process.stderr.write("fixture interruption\n");
      process.exitCode = 7;
      return;
    }
    if (process.argv.includes("--error-result")) {
      process.stdout.write(
        `${JSON.stringify({
          type: "result",
          subtype: "error_during_execution",
          is_error: true,
          session_id: sessionId,
          usage: {
            input_tokens: 1,
            cache_read_input_tokens: 1,
            cache_creation_input_tokens: 1,
            output_tokens: 2,
          },
          total_cost_usd: 0.02,
        })}\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: sessionId,
        result: input,
        usage: {
          input_tokens: 3,
          cache_read_input_tokens: 2,
          cache_creation_input_tokens: 1,
          output_tokens: 4,
        },
        total_cost_usd: 0.01,
        duration_ms: 1,
        duration_api_ms: 1,
        num_turns: 1,
      })}\n`,
    );
  });
};

if (process.argv.includes("--fake-claude")) fakeClaude();
else
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
