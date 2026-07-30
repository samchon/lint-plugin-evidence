import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkClaudeRunner } from "../../../benchmark/src/EvidenceBenchmarkClaudeRunner.ts";
import { EvidenceBenchmarkRunner } from "../../../benchmark/src/EvidenceBenchmarkRunner.ts";

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
    const output: EvidenceBenchmarkRunner.IEvidenceBenchmarkOutput[] = [];
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
    assert.equal(completed.tokenUsage.totalTokens, entries.length * 10);
    assert.equal(completed.costUsd, entries.length * 0.01);
    completed.processes.forEach((process, index) => {
      assert.equal(process.exitCode, 0);
      assert.equal(process.signal, null);
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
      assert.equal(instruction.tokenUsage.totalTokens, 10);
      assert.equal(instruction.costUsd, 0.01);
    });
    assert.deepEqual(
      output
        .filter((event) => event.stream === "stdin")
        .map((event) => event.text),
      completed.instructions.map((instruction) => instruction.objectiveText),
    );

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

    const closedCursor = structuredClone(completed);
    closedCursor.status = "interrupted";
    closedCursor.interruption = {
      name: "FixtureInterruption",
      message: "state publication failed after cursor advance",
    };
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
    process.stdout.write(
      `${JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: sessionId,
        result: input,
        usage: {
          input_tokens: 6,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
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
