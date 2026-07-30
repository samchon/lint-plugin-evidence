import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import * as ts from "typescript-api";

import { EvidenceBenchmarkBaseline } from "./EvidenceBenchmarkBaseline.ts";
import { EvidenceBenchmarkCommandLine } from "./EvidenceBenchmarkCommandLine.ts";
import { EvidenceBenchmarkConsumerProof } from "./EvidenceBenchmarkConsumerProof.ts";
import { EvidenceBenchmarkCorpus } from "./EvidenceBenchmarkCorpus.ts";
import { EvidenceBenchmarkEngine } from "./EvidenceBenchmarkEngine.ts";
import { EvidenceBenchmarkHash } from "./EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkLintBaseline } from "./EvidenceBenchmarkLintBaseline.ts";
import { EvidenceBenchmarkMaterializer } from "./EvidenceBenchmarkMaterializer.ts";
import { EvidenceBenchmarkPackage } from "./EvidenceBenchmarkPackage.ts";
import { EvidenceBenchmarkProcess } from "./EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProject } from "./EvidenceBenchmarkProject.ts";
import { EvidenceBenchmarkPublication } from "./EvidenceBenchmarkPublication.ts";
import { EvidenceBenchmarkRepair } from "./EvidenceBenchmarkRepair.ts";
import { EvidenceBenchmarkRuntime } from "./EvidenceBenchmarkRuntime.ts";
import { EvidenceBenchmarkSetup } from "./EvidenceBenchmarkSetup.ts";
import { EvidenceBenchmarkState } from "./EvidenceBenchmarkState.ts";
import { EvidenceBenchmarkTemplate } from "./EvidenceBenchmarkTemplate.ts";
import { EvidenceBenchmarkTurnLedger } from "./EvidenceBenchmarkTurnLedger.ts";
import type { IEvidenceBenchmarkMaterialization } from "./structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkPackageArtifact } from "./structures/IEvidenceBenchmarkPackageArtifact.ts";

/** Runs deterministic fixture tests and the optional release-package smoke. */
export namespace EvidenceBenchmarkSelfTest {
  /** Runs all fast tests and, with --package, the clean-tree consumer smoke. */
  export async function main(
    benchmarkRoot: string,
    args: readonly string[],
  ): Promise<void> {
    const repository: string = path.resolve(benchmarkRoot, "..");
    const temporary: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-benchmark-self-test-"),
    );
    try {
      const fixture: string = path.join(temporary, "fixture");
      createFixture(repository, fixture);
      await testPinnedPnpm(repository);
      testCodexIsolation(temporary);
      testClaudeIsolation(temporary);
      testEngineMatrix();
      testClaudeTurnLedger(temporary);
      testStateJournal(temporary);
      await testRuntimeIsolation();
      await testPublicationSafety(temporary);
      await testCommonRepair(temporary);
      await testBaselineFailureCleanup(temporary);
      await testPinnedSetup(temporary);
      await testRepositoryInputs(repository);
      await testRetentionIgnore(repository);
      testHashContract();
      await testMarkdownCorpus(temporary);
      await testComposition(fixture, temporary);
      await testMaterialization(fixture, temporary);
      if (args.includes("--baseline"))
        await testBaseline(repository, temporary);
      if (args.includes("--package")) await testPackage(repository, temporary);
      console.log(
        `Benchmark self-test passed${args.includes("--baseline") ? " with neutral baseline" : ""}${args.includes("--package") ? " with package smoke" : ""}.`,
      );
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function testHashContract(): void {
    const files: ReadonlyMap<string, Uint8Array> = new Map([
      ["é.txt", Buffer.from("E", "utf8")],
      ["z.txt", Buffer.from("Z", "utf8")],
    ]);
    assert.equal(
      EvidenceBenchmarkHash.TREE_ALGORITHM,
      "sha256-posix-path-nul-bytes-v1",
    );
    assert.equal(
      EvidenceBenchmarkHash.tree(files),
      "681de99007bb676ae125bd5844860c636e4077fa35857ae5f86a5e412fbf099a",
      "tree identity must use raw UTF-8 path order and exact bytes",
    );
    assert.deepEqual(
      EvidenceBenchmarkHash.entries(files).map((entry) => entry.path),
      ["z.txt", "é.txt"],
      "tree ledgers must use the same raw UTF-8 path order",
    );
    assert.throws(
      () =>
        EvidenceBenchmarkHash.tree(
          new Map([["escape/../file.txt", Buffer.from("x", "utf8")]]),
        ),
      /NFC POSIX relative path/,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkHash.tree(
          new Map([["decomposed-e\u0301.txt", Buffer.from("x", "utf8")]]),
        ),
      /NFC POSIX relative path/,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkHash.tree(
          new Map([["C:/absolute.txt", Buffer.from("x", "utf8")]]),
        ),
      /NFC POSIX relative path/,
    );
  }

  function testStateJournal(temporary: string): void {
    const root: string = path.join(temporary, "state-journal");
    fs.mkdirSync(root, { recursive: true });
    EvidenceBenchmarkState.write(root, { generation: 1 });
    EvidenceBenchmarkState.write(root, { generation: 2 });
    assert.deepEqual(EvidenceBenchmarkState.read(root, "test state"), {
      generation: 2,
    });
    const target: string = path.join(root, "run.json");
    const previous: string = path.join(root, "run.json.previous");
    fs.renameSync(target, previous);
    assert.deepEqual(
      EvidenceBenchmarkState.read(root, "recoverable test state"),
      { generation: 2 },
    );
    assert.ok(fs.existsSync(target));
    assert.equal(fs.existsSync(previous), false);
  }

  function testCodexIsolation(temporary: string): void {
    const root: string = path.join(temporary, "codex-isolation");
    const workspace: string = path.join(root, "workspace");
    const environment: NodeJS.ProcessEnv = {
      API_PORT: "46000",
      COREPACK_HOME: path.join(root, "cache", "corepack"),
      GOCACHE: path.join(root, "cache", "go"),
      GOMODCACHE: path.join(root, "cache", "go-mod"),
      GOPATH: path.join(root, "cache", "go-path"),
      GOTMPDIR: path.join(root, "cache", "go-tmp"),
      npm_config_cache: path.join(root, "cache", "npm"),
      npm_config_store_dir: path.join(root, "cache", "pnpm"),
      OPENAI_API_KEY: "must-not-leak",
      HTTPS_PROXY: "http://must-not-leak.invalid",
      PLAYWRIGHT_BROWSERS_PATH: path.join(root, "cache", "playwright"),
      PLAYWRIGHT_TEST_PORT: "46003",
      SWAGGER_PORT: "46001",
      TTSC_CACHE_DIR: path.join(root, "cache", "ttsc"),
      TTSC_GO_CACHE_DIR: path.join(root, "cache", "go"),
      VITE_API_HOST: "http://127.0.0.1:46000",
      VITE_DEV_PORT: "46002",
    };
    const arguments_: readonly string[] =
      EvidenceBenchmarkCommandLine.codexIsolationArguments(
        workspace,
        environment,
      );
    const invocation: string = arguments_.join("\n");
    assert.equal(
      invocation.includes("--dangerously-bypass-approvals-and-sandbox"),
      false,
      "measured Codex turns must never bypass approvals and sandboxing",
    );
    assert.equal(
      invocation.includes("shell_environment_policy.inherit=all"),
      false,
      "measured Codex tools must not inherit the complete controller environment",
    );
    assert.match(invocation, /default_permissions="benchmark"/);
    assert.match(
      invocation,
      /permissions\.benchmark\.filesystem\.:root="deny"/,
    );
    assert.match(
      invocation,
      /permissions\.benchmark\.filesystem\.:workspace_roots=\{"\."="write"\}/,
    );
    assert.equal(
      invocation.includes('filesystem.":'),
      false,
      "Codex CLI dotted overrides must not quote special filesystem tokens",
    );
    assert.match(invocation, /permissions\.benchmark\.network\.domains=/);
    assert.match(invocation, /shell_environment_policy\.inherit="core"/);
    assert.match(invocation, /shell_environment_policy\.set=/);
    assert.equal(invocation.includes("must-not-leak"), false);
  }

  function testClaudeIsolation(temporary: string): void {
    const root: string = path.join(temporary, "claude-isolation");
    const repository: string = path.join(temporary, "source-repository");
    const workspace: string = path.join(root, "workspace");
    const workspaceGlob: string =
      EvidenceBenchmarkTurnLedger.claudeWorkspaceGlob(workspace);
    const allowedTools: string[] = [
      "Bash",
      `Edit(${workspaceGlob})`,
      `Write(${workspaceGlob})`,
      `Read(${workspaceGlob})`,
      "Agent",
    ];
    const arguments_: readonly string[] =
      EvidenceBenchmarkCommandLine.claudeIsolationArguments(
        repository,
        workspace,
        {
          ANTHROPIC_API_KEY: "must-not-leak",
          HTTPS_PROXY: "http://must-not-leak.invalid",
        },
      );
    const invocation: string = arguments_.join("\n");
    assert.equal(
      invocation.includes("--dangerously-skip-permissions"),
      false,
      "measured Claude Code turns must never bypass permissions",
    );
    assert.equal(
      invocation.includes("must-not-leak"),
      false,
      "Claude Code settings must retain protected names without secret values",
    );
    assert.equal(
      arguments_[arguments_.indexOf("--permission-mode") + 1],
      "dontAsk",
    );
    assert.equal(
      arguments_[arguments_.indexOf("--setting-sources") + 1],
      "",
      "measured Claude Code turns must not load mutable filesystem settings",
    );
    assert.equal(
      arguments_[arguments_.indexOf("--allowedTools") + 1],
      allowedTools.join(","),
      "Claude built-in file permissions must remain scoped to the workspace",
    );
    const settings = JSON.parse(
      arguments_[arguments_.indexOf("--settings") + 1]!,
    ) as {
      sandbox: {
        enabled: boolean;
        failIfUnavailable: boolean;
        allowUnsandboxedCommands: boolean;
        filesystem: {
          denyRead: string[];
          allowRead: string[];
          allowWrite: string[];
        };
        network: {
          allowedDomains: string[];
          strictAllowlist: boolean;
        };
      };
      permissions: {
        allow: string[];
        deny: string[];
      };
      env: Record<string, string>;
    };
    assert.deepEqual(settings.permissions.allow, allowedTools);
    assert.deepEqual(settings.permissions.deny, ["WebFetch", "WebSearch"]);
    assert.equal(
      settings.permissions.allow.some((rule) => rule.includes("./**")),
      false,
      "Claude file permissions must not rely on project-relative matching",
    );
    assert.equal(settings.sandbox.enabled, process.platform !== "win32");
    assert.equal(
      settings.sandbox.failIfUnavailable,
      process.platform !== "win32",
    );
    assert.equal(settings.sandbox.allowUnsandboxedCommands, false);
    assert.deepEqual(settings.sandbox.filesystem.denyRead, [
      "~/",
      path.resolve(repository),
      root,
    ]);
    assert.deepEqual(settings.sandbox.filesystem.allowRead, [
      workspace,
      path.join(root, "cache"),
    ]);
    assert.deepEqual(settings.sandbox.filesystem.allowWrite, [
      path.join(root, "cache"),
    ]);
    assert.equal(settings.sandbox.network.strictAllowlist, true);
    assert.deepEqual(settings.sandbox.network.allowedDomains, [
      "localhost",
      "127.0.0.1",
    ]);
    assert.equal(settings.env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB, "1");
    assert.equal(
      settings.env.CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS,
      "0",
      "Claude Code must wait for measured background agents without a ceiling",
    );
  }

  function testEngineMatrix(): void {
    assert.deepEqual(EvidenceBenchmarkEngine.MATRIX, [
      {
        engine: "codex",
        model: "gpt-5.6-terra",
        effort: "high",
      },
      {
        engine: "claude-code",
        model: "claude-sonnet-5",
        effort: "high",
      },
    ]);
    const identities: string[] = ["todo", "reddit"].flatMap((project) =>
      EvidenceBenchmarkEngine.MATRIX.flatMap((engine) =>
        ["evidence", "plain"].map(
          (arm) => `${project}/${engine.engine}/${arm}`,
        ),
      ),
    );
    assert.equal(identities.length, 8);
    assert.equal(new Set(identities).size, 8);
  }

  function testClaudeTurnLedger(temporary: string): void {
    const runRoot: string = path.join(temporary, "claude-turn-ledger");
    const repository: string = path.join(temporary, "source-repository");
    const workspace: string = path.join(runRoot, "workspace");
    const logs: string = path.join(runRoot, "logs");
    const sessionId: string = "12345678-1234-4123-8123-123456789abc";
    const model: EvidenceBenchmarkEngine.Model = "claude-sonnet-5";
    const launcher: string =
      process.platform === "win32"
        ? path.resolve(
            process.env.APPDATA ?? path.join(temporary, "AppData", "Roaming"),
            "npm",
            "node_modules",
            "@anthropic-ai",
            "claude-code",
            "bin",
            "claude.exe",
          )
        : "claude";
    fs.mkdirSync(workspace, { recursive: true });
    const commonInvocation: string[] = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--forward-subagent-text",
      "--include-hook-events",
      "--model",
      model,
      "--effort",
      "high",
      ...EvidenceBenchmarkCommandLine.claudeIsolationArguments(
        repository,
        workspace,
        {},
      ),
    ];
    const turns: EvidenceBenchmarkTurnLedger.ITurn[] =
      EvidenceBenchmarkTurnLedger.NAMES.map((name, index) => {
        const stdout: string = path.posix.join("logs", `${name}.stdout.jsonl`);
        const stderr: string = path.posix.join("logs", `${name}.stderr.log`);
        write(
          path.join(runRoot, ...stdout.split("/")),
          [
            JSON.stringify({
              type: "system",
              subtype: "init",
              session_id: sessionId,
              model,
            }),
            JSON.stringify({
              type: "result",
              subtype: "success",
              is_error: false,
              terminal_reason: "completed",
              stop_reason: "end_turn",
              api_error_status: null,
              permission_denials: [],
              session_id: sessionId,
              usage: {
                input_tokens: 10,
                cache_creation_input_tokens: 2,
                cache_read_input_tokens: 3,
                output_tokens: 4,
              },
              modelUsage: {
                [model]: {},
              },
            }),
            "",
          ].join("\n"),
        );
        write(path.join(runRoot, ...stderr.split("/")), "");
        return {
          name,
          elapsedMs: 10,
          status: 0,
          stdout,
          stderr,
          invocation: [
            launcher,
            ...commonInvocation,
            index === 0 ? "--session-id" : "--resume",
            sessionId,
          ],
          cwd: workspace,
          accepted: true,
          sessionId,
        };
      });
    const summary: EvidenceBenchmarkTurnLedger.ISummary =
      EvidenceBenchmarkTurnLedger.assertRetainedEvidence({
        repository,
        runRoot,
        workspace,
        engine: "claude-code",
        sessionId,
        model,
        effort: "high",
        turns,
      });
    assert.deepEqual(summary, {
      elapsedMs: 90,
      attempts: 9,
      accepted: 9,
      tokens: {
        input_tokens: 90,
        cached_input_tokens: 27,
        cache_creation_input_tokens: 18,
        output_tokens: 36,
        reasoning_output_tokens: 0,
      },
    });

    const retainedInspection = () =>
      EvidenceBenchmarkTurnLedger.inspectAttempts({
        repository,
        runRoot,
        workspace,
        engine: "claude-code",
        sessionId,
        model,
        effort: "high",
        invocationPolicy: "retained",
        turns,
      });
    const currentBackendInvocation: string[] = [
      ...(turns[1]!.invocation as string[]),
    ];
    const tamperedBackendInvocation: string[] = [...currentBackendInvocation];
    tamperedBackendInvocation[
      tamperedBackendInvocation.indexOf("--allowedTools") + 1
    ] = "Bash";
    turns[1]!.invocation = tamperedBackendInvocation;
    assert.throws(
      retainedInspection,
      /required model, effort, tools, and isolation invocation/,
      "a downstream invocation defect must abort the complete retained audit",
    );
    assert.equal(
      turns.every((turn) => turn.accepted === true),
      true,
      "retained inspection must never mutate acceptance state",
    );
    turns[1]!.invocation = currentBackendInvocation;
    const orphanLog: string = path.join(runRoot, "logs", "orphan.stderr.log");
    write(orphanLog, "");
    assert.throws(
      retainedInspection,
      /log inventory does not exactly match/,
      "resume audit must reject logs outside the retained attempt ledger",
    );
    fs.rmSync(orphanLog);

    const firstStdout: string = path.join(
      runRoot,
      "logs",
      "skills-contract.stdout.jsonl",
    );
    const successfulFirstLog: string = fs.readFileSync(firstStdout, "utf8");
    const currentFirstInvocation: string[] = [
      ...(turns[0]!.invocation as string[]),
    ];
    const legacyAllowedTools: string[] = [
      "Bash",
      "Edit(./**)",
      "Read(./**)",
      "Agent",
    ];
    const legacyInvocation: string[] = [...currentFirstInvocation];
    legacyInvocation[legacyInvocation.indexOf("--allowedTools") + 1] =
      legacyAllowedTools.join(",");
    const settingsIndex: number = legacyInvocation.indexOf("--settings") + 1;
    const legacySettings = JSON.parse(legacyInvocation[settingsIndex]!) as {
      permissions: { allow: string[] };
    };
    legacySettings.permissions.allow = legacyAllowedTools;
    legacyInvocation[settingsIndex] = JSON.stringify(legacySettings);
    turns[0]!.invocation = legacyInvocation;
    EvidenceBenchmarkTurnLedger.assertRetainedEvidence({
      repository,
      runRoot,
      workspace,
      engine: "claude-code",
      sessionId,
      model,
      effort: "high",
      turns,
    });
    assert.throws(
      () =>
        EvidenceBenchmarkTurnLedger.assertSuccessfulAttempt({
          repository,
          runRoot,
          workspace,
          engine: "claude-code",
          sessionId,
          model,
          effort: "high",
          sessionEstablished: false,
          turn: turns[0]!,
        }),
      /required model, effort, tools, and isolation invocation/,
      "legacy retained permissions must never admit a new attempt",
    );
    turns[0]!.invocation = currentFirstInvocation;

    const retryStdout: string = path.join(
      runRoot,
      "logs",
      "skills-contract.attempt-2.stdout.jsonl",
    );
    const retryStderr: string = path.join(
      runRoot,
      "logs",
      "skills-contract.attempt-2.stderr.log",
    );
    write(retryStdout, successfulFirstLog);
    write(retryStderr, "");
    write(
      firstStdout,
      successfulFirstLog.replace(
        '"permission_denials":[]',
        '"permission_denials":[{"tool_name":"Write"}]',
      ),
    );
    const rejectedPermissionTurn: EvidenceBenchmarkTurnLedger.ITurn = {
      ...turns[0]!,
      accepted: false,
    };
    assert.throws(
      () =>
        EvidenceBenchmarkTurnLedger.assertSuccessfulAttempt({
          repository,
          runRoot,
          workspace,
          engine: "claude-code",
          sessionId,
          model,
          effort: "high",
          sessionEstablished: false,
          turn: rejectedPermissionTurn,
        }),
      EvidenceBenchmarkTurnLedger.PermissionDeniedError,
      "a zero-exit Claude result with permission denials must not be accepted",
    );
    const retryInvocation: string[] = [...currentFirstInvocation];
    retryInvocation[retryInvocation.indexOf("--session-id")] = "--resume";
    const acceptedRetryTurn: EvidenceBenchmarkTurnLedger.ITurn = {
      ...turns[0]!,
      stdout: path.posix.join("logs", "skills-contract.attempt-2.stdout.jsonl"),
      stderr: path.posix.join("logs", "skills-contract.attempt-2.stderr.log"),
      invocation: retryInvocation,
    };
    const retrySummary: EvidenceBenchmarkTurnLedger.ISummary =
      EvidenceBenchmarkTurnLedger.assertRetainedEvidence({
        repository,
        runRoot,
        workspace,
        engine: "claude-code",
        sessionId,
        model,
        effort: "high",
        turns: [rejectedPermissionTurn, acceptedRetryTurn, ...turns.slice(1)],
      });
    assert.deepEqual(retrySummary, {
      elapsedMs: 100,
      attempts: 10,
      accepted: 9,
      tokens: {
        input_tokens: 100,
        cached_input_tokens: 30,
        cache_creation_input_tokens: 20,
        output_tokens: 40,
        reasoning_output_tokens: 0,
      },
    });
    write(firstStdout, successfulFirstLog);
    write(
      firstStdout,
      fs
        .readFileSync(firstStdout, "utf8")
        .replace(`"${model}":{}`, '"claude-haiku-4-5-20251001":{}'),
    );
    assert.throws(
      () =>
        EvidenceBenchmarkTurnLedger.assertRetainedEvidence({
          repository,
          runRoot,
          workspace,
          engine: "claude-code",
          sessionId,
          model,
          effort: "high",
          turns,
        }),
      /unselected model/,
      "Claude native usage must reject any model outside the fixed cell model",
    );
  }

  async function testRuntimeIsolation(): Promise<void> {
    assert.equal(
      EvidenceBenchmarkProject.parse("free-form-subject"),
      "free-form-subject",
    );
    assert.throws(
      () => EvidenceBenchmarkProject.parse("../escaped"),
      /Invalid benchmark project slug/,
    );
    assert.throws(
      () => EvidenceBenchmarkProject.parse("con"),
      /Invalid benchmark project slug/,
    );
    const assignments: EvidenceBenchmarkRuntime.IAssignment[] = Array.from(
      { length: 8 },
      (_value, slot) => EvidenceBenchmarkRuntime.assign(slot),
    );
    const ports: number[] = assignments.flatMap((assignment) => [
      assignment.apiPort,
      assignment.swaggerPort,
      assignment.viteDevelopmentPort,
      assignment.playwrightPort,
    ]);
    assert.equal(
      new Set(ports).size,
      ports.length,
      "every benchmark cell endpoint must be unique",
    );

    const firstAssignment: EvidenceBenchmarkRuntime.IAssignment =
      assignments[0]!;
    const shifted: EvidenceBenchmarkRuntime.IAssignment =
      EvidenceBenchmarkRuntime.assign(3, 50_000);
    assert.deepEqual(shifted, {
      apiPort: 50_030,
      swaggerPort: 50_031,
      viteDevelopmentPort: 50_032,
      playwrightPort: 50_033,
      apiHost: "http://127.0.0.1:50030",
    });
    assert.throws(
      () => EvidenceBenchmarkRuntime.assign(7, 65_463),
      /ports between 1 and 65535/,
    );
    const environment: NodeJS.ProcessEnv = {
      API_PORT: "37001",
      PLAYWRIGHT_TEST_PORT: "4173",
    };
    EvidenceBenchmarkRuntime.apply(environment, firstAssignment);
    assert.deepEqual(environment, {
      API_PORT: "46000",
      PLAYWRIGHT_TEST_PORT: "46003",
      SWAGGER_PORT: "46001",
      VITE_API_HOST: "http://127.0.0.1:46000",
      VITE_DEV_PORT: "46002",
    });
    const secondWave = Array.from({ length: 4 }, (_value, slot) =>
      EvidenceBenchmarkRuntime.assign(slot, 51_000),
    );
    const combinedPorts = [...assignments, ...secondWave].flatMap(
      (assignment) => [
        assignment.apiPort,
        assignment.swaggerPort,
        assignment.viteDevelopmentPort,
        assignment.playwrightPort,
      ],
    );
    assert.equal(
      new Set(combinedPorts).size,
      combinedPorts.length,
      "concurrent waves with distinct port bases must not overlap",
    );

    const persisted: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-benchmark-runtime-"),
    );
    try {
      fs.mkdirSync(path.join(persisted, "packages", "backend"), {
        recursive: true,
      });
      fs.mkdirSync(path.join(persisted, "packages", "frontend"), {
        recursive: true,
      });
      EvidenceBenchmarkRuntime.persist(persisted, secondWave[0]!);
      assert.match(
        fs.readFileSync(
          path.join(persisted, "packages", "backend", ".env"),
          "utf8",
        ),
        /^API_PORT=51000$/m,
      );
      assert.match(
        fs.readFileSync(
          path.join(persisted, "packages", "frontend", ".env"),
          "utf8",
        ),
        /^PLAYWRIGHT_TEST_PORT=51003$/m,
      );
    } finally {
      fs.rmSync(persisted, { recursive: true, force: true });
    }

    const blocker: net.Server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(
        { host: "127.0.0.1", port: firstAssignment.apiPort, exclusive: true },
        resolve,
      );
    });
    try {
      await expectFailure(
        () => EvidenceBenchmarkRuntime.assertAvailable([firstAssignment]),
        `api port ${firstAssignment.apiPort} is unavailable`,
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        blocker.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      );
    }
    await EvidenceBenchmarkRuntime.assertAvailable(assignments);
  }

  async function testPublicationSafety(temporary: string): Promise<void> {
    const repository: string = path.join(temporary, "publication-repository");
    const runId: string = "0123456789ab-12345678-1234-4123-8123-123456789abc";
    write(
      path.join(
        repository,
        "benchmark",
        "template",
        "base",
        ".github",
        "workflows",
        "ci.yml",
      ),
      "jobs:\n  test:\n    steps:\n      - run: pnpm --filter {{frontendPackageName}} exec playwright install\n",
    );
    const workspace: string = path.join(
      repository,
      "benchmark",
      "result",
      "todo",
      "codex",
      "evidence",
      "runs",
      runId,
      "workspace",
    );
    write(path.join(workspace, "package.json"), '{"private":true}\n');
    write(
      path.join(workspace, "packages", "frontend", "package.json"),
      '{"name":"@evidence-benchmark/todo-evidence-frontend"}\n',
    );
    for (const [
      index,
      relative,
    ] of EvidenceBenchmarkLintBaseline.PATHS.entries())
      write(
        path.join(workspace, ...relative.split("/")),
        [
          ...(relative === EvidenceBenchmarkLintBaseline.PATHS[1] ||
          relative === EvidenceBenchmarkLintBaseline.PATHS[3]
            ? [
                "declare const process: { env: Record<string, string | undefined> };",
                'const isNestiaConfigLoader = process.env.NESTIA_SDK_TRANSFORM === "1";',
              ]
            : []),
          "const graph = {",
          "  claims: [",
          `    { name: "fixture-${index}", type: "typescript", files: ["src/**/*.ts"], symbol: "function", reference: { type: "markdown", files: ["docs/**/*.md"], symbol: "h2" } },`,
          "  ],",
          "};",
          `export default { rules: { "evidence/graph": ${
            relative === EvidenceBenchmarkLintBaseline.PATHS[1] ||
            relative === EvidenceBenchmarkLintBaseline.PATHS[3]
              ? 'isNestiaConfigLoader ? "off" : ["error", graph]'
              : '["error", graph]'
          } } };`,
          "",
        ].join("\n"),
      );
    const lintBaselines: readonly IEvidenceBenchmarkMaterialization.ILintConfigBaseline[] =
      EvidenceBenchmarkLintBaseline.captureDirectory(workspace, "evidence");
    const lintRestorationSha256: string =
      EvidenceBenchmarkLintBaseline.digest(lintBaselines);
    const backendLintRestorationSha256: string =
      EvidenceBenchmarkLintBaseline.digest(
        lintBaselines,
        EvidenceBenchmarkLintBaseline.BACKEND_PATHS,
      );
    write(path.join(workspace, ".env"), "SECRET=must-not-publish\n");
    write(path.join(workspace, ".env.example"), "SECRET=\n");
    write(
      path.join(workspace, ".benchmark-deps", "evidence.tgz"),
      "package archive",
    );
    const archiveSha256: string = EvidenceBenchmarkHash.bytes(
      Buffer.from("package archive"),
    );
    const runRoot: string = path.dirname(workspace);
    for (const relative of [
      "skills-contract.md",
      "backend/start.md",
      "backend/review.md",
      "backend/evidence-final.md",
      "frontend/start.md",
      "frontend/review.md",
      "frontend/evidence-final.md",
      "overall/review.md",
      "overall/evidence-final.md",
    ])
      write(
        path.join(runRoot, "inputs", "instructions", ...relative.split("/")),
        `${relative}\n`,
      );
    write(
      path.join(runRoot, "inputs", "requirements", "requirements.md"),
      "# Requirements\n",
    );
    const instructionsTreeSha256: string = EvidenceBenchmarkHash.tree(
      EvidenceBenchmarkHash.directory(
        path.join(runRoot, "inputs", "instructions"),
      ),
    );
    const requirementsTreeSha256: string = EvidenceBenchmarkHash.tree(
      EvidenceBenchmarkHash.directory(
        path.join(runRoot, "inputs", "requirements"),
      ),
    );
    const materializationPath: string = path.join(
      runRoot,
      "materialization.json",
    );
    const materialization = {
      schemaVersion: 5,
      project: "todo",
      arm: "evidence",
      requirementsTreeSha256,
      lintBaselines,
      artifact: {
        sourceCommit: "0123456789abcdef0123456789abcdef01234567",
        sha256: archiveSha256,
        relativeArchive: ".benchmark-deps/evidence.tgz",
      },
    };
    write(materializationPath, `${JSON.stringify(materialization)}\n`);
    const runStatePath: string = path.join(runRoot, "run.json");
    const sessionId: string = "019c1234-5678-789a-bcde-f0123456789a";
    const turnNames: readonly EvidenceBenchmarkTurnLedger.Name[] =
      EvidenceBenchmarkTurnLedger.NAMES;
    const commonInvocation: string[] = [
      "--json",
      "--enable",
      "goals",
      "--model",
      "gpt-5.6-terra",
      "--config",
      "model_reasoning_effort=high",
      ...EvidenceBenchmarkCommandLine.codexIsolationArguments(workspace, {}),
      "--skip-git-repo-check",
    ];
    const turns = turnNames.map((name, index) => {
      const stem: string = name;
      const stdout: string = path.posix.join("logs", `${stem}.stdout.jsonl`);
      const stderr: string = path.posix.join("logs", `${stem}.stderr.log`);
      write(
        path.join(runRoot, ...stdout.split("/")),
        [
          JSON.stringify({ type: "thread.started", thread_id: sessionId }),
          JSON.stringify({
            type: "turn.completed",
            usage: {
              input_tokens: 100,
              cached_input_tokens: 50,
              output_tokens: 20,
              reasoning_output_tokens: 5,
            },
          }),
          "",
        ].join("\n"),
      );
      write(path.join(runRoot, ...stderr.split("/")), "");
      return {
        name,
        elapsedMs: 10,
        status: 0,
        stdout,
        stderr,
        invocation:
          index === 0
            ? ["codex", "exec", ...commonInvocation, "--cd", workspace, "-"]
            : ["codex", "exec", "resume", ...commonInvocation, sessionId, "-"],
        cwd: workspace,
        sessionId,
        accepted: true,
        lintRestorationSha256:
          name === "backend-final"
            ? backendLintRestorationSha256
            : name === "frontend-final" || name === "overall-final"
              ? lintRestorationSha256
              : undefined,
      };
    });
    const nonAgentElapsedMs: number = 10;
    const agentElapsedMs: number = 90;
    write(
      runStatePath,
      `${JSON.stringify({
        schemaVersion: 8,
        workflow: "backend-first-gated-v2",
        instructionsTreeSha256,
        project: "todo",
        arm: "evidence",
        engine: "codex",
        model: "gpt-5.6-terra",
        effort: "high",
        cliVersion: "codex-cli 0.145.0",
        status: "completed",
        sourceCommit: "0123456789abcdef0123456789abcdef01234567",
        nonAgentElapsedMs,
        agentElapsedMs,
        sessionId,
        lintBaselines,
        completedWorkspaceTreeSha256:
          EvidenceBenchmarkPublication.workspaceSha256(workspace),
        turns,
      })}\n`,
    );
    const report = {
      schemaVersion: 2,
      status: "accepted",
      engine: "codex",
      model: "gpt-5.6-terra",
      effort: "high",
      project: "todo",
      arm: "evidence",
      runId,
      measurement: {
        totalElapsedMs: nonAgentElapsedMs + agentElapsedMs,
        agentElapsedMs,
        nonAgentElapsedMs,
        attempts: { total: 9, accepted: 9, rejected: 0 },
        tokens: {
          input_tokens: 900,
          cached_input_tokens: 450,
          cache_creation_input_tokens: 0,
          output_tokens: 180,
          reasoning_output_tokens: 45,
        },
        pricingUsdPerMillion: {
          input: 1,
          cachedInput: 0.1,
          cacheCreationInput: 0,
          output: 2,
        },
        apiEquivalentCostUsd: 0.000855,
      },
      gates: {
        build: "passed",
        lint: "passed",
        database: "passed",
        backendTests: "passed",
        frontendTests: "passed",
        runtime: "passed",
      },
      coverage: {
        requirements: { total: 1, covered: 1 },
        tests: { total: 1, covered: 1 },
      },
      implementation: {
        tables: 1,
        apiOperations: 1,
        dtoTypes: 1,
        dtoProperties: 1,
        testFunctions: 1,
      },
      completion: { firstClaimTurn: "overall-final", honest: true },
      quality: {
        score: 100,
        summary: "Fixture audit passed.",
        residualDefects: [],
      },
      frozenInputs: {
        sourceCommit: materialization.artifact.sourceCommit,
        instructionsTreeSha256,
        requirementsTreeSha256,
        completedWorkspaceTreeSha256:
          EvidenceBenchmarkPublication.workspaceSha256(workspace),
      },
      interventions: [],
    };
    write(
      path.join(runRoot, "benchmark-report.json"),
      `${JSON.stringify(report)}\n`,
    );
    const checkout: string = path.join(temporary, "publication-results");
    write(path.join(checkout, "README.md"), "# Benchmark results\n");
    const request: EvidenceBenchmarkPublication.IRequest =
      EvidenceBenchmarkPublication.parse([
        "--",
        "--repository",
        "fixture-owner/evidence-benchmark-results",
        "--checkout",
        checkout,
        "--public",
        "codex",
        "todo",
        "evidence",
        runId,
      ]);

    const calls: string[] = [];
    const runner: EvidenceBenchmarkPublication.Runner = async (
      command,
      arguments_,
    ) => {
      calls.push(`${command} ${arguments_.join(" ")}`);
      if (
        command === "gh" &&
        arguments_[0] === "api" &&
        arguments_[1] === "user"
      )
        return processResult(0, "fixture-owner\n");
      if (
        command === "gh" &&
        arguments_[0] === "api" &&
        arguments_[1] === "repos/fixture-owner/evidence-benchmark-results"
      )
        return processResult(0, "public\n");
      if (
        command === "git" &&
        arguments_.join(" ") === "rev-parse --show-toplevel"
      )
        return processResult(0, `${checkout}\n`);
      if (command === "git" && arguments_.join(" ") === "status --porcelain")
        return processResult(0);
      if (command === "git" && arguments_.join(" ") === "branch --show-current")
        return processResult(0, "master\n");
      if (command === "git" && arguments_.join(" ") === "remote get-url origin")
        return processResult(
          0,
          "https://github.com/fixture-owner/evidence-benchmark-results.git\n",
        );
      if (
        command === "git" &&
        arguments_[0] === "diff" &&
        arguments_.includes("--quiet")
      )
        return processResult(1);
      if (command === "git" && arguments_[0] === "add") {
        const leaf: string = path.join(
          checkout,
          "codex",
          "gpt-5.6-terra",
          "todo",
          "evidence",
        );
        assert.ok(
          fs.existsSync(path.join(leaf, ".benchmark-deps", "evidence.tgz")),
          "evidence publication must retain its local package archive",
        );
        assert.equal(
          fs.existsSync(path.join(leaf, ".env")),
          false,
          "publication staging must exclude local environment files",
        );
        assert.equal(
          fs.existsSync(path.join(leaf, ".github", "workflows")),
          false,
          "consolidated publication must remove nested workflows",
        );
        const published = JSON.parse(
          fs.readFileSync(path.join(leaf, "benchmark.json"), "utf8"),
        ) as {
          status?: unknown;
          completedWorkspaceTreeSha256?: unknown;
        };
        assert.equal(published.status, "accepted");
        assert.equal(
          published.completedWorkspaceTreeSha256,
          EvidenceBenchmarkPublication.workspaceSha256(workspace),
        );
      }
      if (
        command === "git" &&
        arguments_[0] === "rev-parse" &&
        (arguments_[1] === "HEAD" || arguments_[1] === "origin/master")
      )
        return processResult(0, `${"a".repeat(40)}\n`);
      if (
        command === "gh" &&
        arguments_[0] === "api" &&
        arguments_[1] ===
          "repos/fixture-owner/evidence-benchmark-results/commits/master"
      )
        return processResult(0, `${"a".repeat(40)}\n`);
      if (
        command === "gh" &&
        arguments_[0] === "repo" &&
        arguments_[1] === "view"
      )
        return processResult(
          0,
          "https://github.com/fixture-owner/evidence-benchmark-results\n",
        );
      return processResult(0);
    };
    const reportPath: string = path.join(runRoot, "benchmark-report.json");
    fs.writeFileSync(reportPath, "{}\n", "utf8");
    await assert.rejects(
      EvidenceBenchmarkPublication.publish(repository, request, runner),
      /Benchmark report identity does not match the accepted run/,
    );
    assert.equal(
      calls.length,
      0,
      "an invalid operator report must fail before external publication calls",
    );
    fs.writeFileSync(reportPath, `${JSON.stringify(report)}\n`, "utf8");
    const result: EvidenceBenchmarkPublication.IResult =
      await EvidenceBenchmarkPublication.publish(repository, request, runner);
    assert.equal(result.repository, "fixture-owner/evidence-benchmark-results");
    assert.ok(calls.includes("git push origin master"));

    const runState = JSON.parse(fs.readFileSync(runStatePath, "utf8")) as {
      turns: Array<{
        name: string;
        lintRestorationSha256?: string;
      }>;
    };
    const backendFinal = runState.turns.find(
      (turn) => turn.name === "backend-final",
    )!;
    delete backendFinal.lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("missing backend proof reached the process runner");
        }),
      "backend-final lint restoration proof",
    );
    backendFinal.lintRestorationSha256 = backendLintRestorationSha256;
    const frontendFinal = runState.turns.find(
      (turn) => turn.name === "frontend-final",
    )!;
    frontendFinal.lintRestorationSha256 = "wrong-proof";
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("wrong frontend proof reached the process runner");
        }),
      "frontend-final lint restoration proof",
    );
    frontendFinal.lintRestorationSha256 = lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    const overallFinal = runState.turns.find(
      (turn) => turn.name === "overall-final",
    )!;
    delete overallFinal.lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("missing overall proof reached the process runner");
        }),
      "overall-final lint restoration proof",
    );
    overallFinal.lintRestorationSha256 = lintRestorationSha256;
    write(runStatePath, `${JSON.stringify(runState)}\n`);

    const secondTurn = runState.turns[1]!;
    const thirdTurn = runState.turns[2]!;
    runState.turns[1] = thirdTurn;
    runState.turns[2] = secondTurn;
    await expectFailure(
      () =>
        EvidenceBenchmarkTurnLedger.assertAcceptedOrder(
          runState.turns as EvidenceBenchmarkTurnLedger.ITurn[],
          true,
        ),
      "canonical instruction prefix",
    );
    write(runStatePath, `${JSON.stringify(runState)}\n`);
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("swapped turn order reached the process runner");
        }),
      "canonical instruction prefix",
    );
    runState.turns[1] = secondTurn;
    runState.turns[2] = thirdTurn;
    write(runStatePath, `${JSON.stringify(runState)}\n`);

    materialization.artifact.relativeArchive = ".benchmark-deps/../outside.tgz";
    write(materializationPath, `${JSON.stringify(materialization)}\n`);
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("unsafe archive path reached the process runner");
        }),
      "unsafe product archive path",
    );
    materialization.artifact.relativeArchive = ".benchmark-deps/evidence.tgz";
    write(materializationPath, `${JSON.stringify(materialization)}\n`);

    write(path.join(workspace, "package.json"), '{"private":false}\n');
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(repository, request, async () => {
          throw new Error("mutated workspace reached the process runner");
        }),
      "workspace failed identity verification",
    );
    write(path.join(workspace, "package.json"), '{"private":true}\n');

    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(
          repository,
          request,
          async (command, arguments_) =>
            command === "gh" &&
            arguments_[0] === "api" &&
            arguments_[1] === "user"
              ? processResult(0, "different-owner\n")
              : processResult(0),
        ),
      "authenticated GitHub login is different-owner",
    );

    let rolledBack: boolean = false;
    await expectFailure(
      () =>
        EvidenceBenchmarkPublication.publish(
          repository,
          request,
          async (command, arguments_) => {
            if (
              command === "gh" &&
              arguments_[0] === "api" &&
              arguments_[1] === "user"
            )
              return processResult(0, "fixture-owner\n");
            if (
              command === "gh" &&
              arguments_[0] === "api" &&
              arguments_[1] === "repos/fixture-owner/evidence-benchmark-results"
            )
              return processResult(0, "public\n");
            if (
              command === "git" &&
              arguments_.join(" ") === "rev-parse --show-toplevel"
            )
              return processResult(0, `${checkout}\n`);
            if (
              command === "git" &&
              arguments_.join(" ") === "status --porcelain"
            )
              return processResult(0);
            if (
              command === "git" &&
              arguments_.join(" ") === "branch --show-current"
            )
              return processResult(0, "master\n");
            if (
              command === "git" &&
              arguments_.join(" ") === "remote get-url origin"
            )
              return processResult(
                0,
                "https://github.com/fixture-owner/evidence-benchmark-results.git\n",
              );
            if (
              command === "git" &&
              arguments_[0] === "diff" &&
              arguments_.includes("--quiet")
            )
              return processResult(1);
            if (
              command === "gh" &&
              arguments_[0] === "repo" &&
              arguments_[1] === "view"
            )
              return processResult(
                0,
                "https://github.com/fixture-owner/evidence-benchmark-results\n",
              );
            if (
              command === "git" &&
              arguments_[0] === "rev-parse" &&
              (arguments_[1] === "HEAD" || arguments_[1] === "origin/master")
            )
              return processResult(0, `${"a".repeat(40)}\n`);
            if (command === "git" && arguments_[0] === "push")
              throw new Error("simulated publication push failure");
            if (command === "git" && arguments_[0] === "reset")
              rolledBack = true;
            return processResult(0);
          },
        ),
      "simulated publication push failure",
    );
    assert.equal(
      rolledBack,
      true,
      "a failed result commit must be rolled back locally",
    );
  }

  async function testCommonRepair(temporary: string): Promise<void> {
    const repository: string = path.join(temporary, "repair-repository");
    const runId: string = "abcdef012345-12345678-1234-4123-8123-123456789abc";
    const patch: string = path.join(
      repository,
      "benchmark",
      ".work",
      "repairs",
      "common.patch",
    );
    write(
      patch,
      [
        "diff --git a/shared.txt b/shared.txt",
        "--- a/shared.txt",
        "+++ b/shared.txt",
        "@@ -1 +1 @@",
        "-before",
        "+after",
        "",
      ].join("\n"),
    );
    for (const engine of EvidenceBenchmarkEngine.MATRIX)
      for (const arm of ["evidence", "plain"] as const)
        await createRepairCell(
          repository,
          runId,
          engine.engine,
          "todo",
          arm,
          "interrupted",
        );
    const result: EvidenceBenchmarkRepair.IResult =
      await EvidenceBenchmarkRepair.apply(
        repository,
        EvidenceBenchmarkRepair.parse([
          "--",
          "--patch",
          "benchmark/.work/repairs/common.patch",
          runId,
          "todo",
        ]),
      );
    assert.equal(result.kind, "operator-intervention");
    assert.deepEqual(result.cells, [
      "codex/todo/evidence",
      "codex/todo/plain",
      "claude-code/todo/evidence",
      "claude-code/todo/plain",
    ]);
    for (const engine of EvidenceBenchmarkEngine.MATRIX)
      for (const arm of ["evidence", "plain"] as const) {
        const root: string = path.join(
          repository,
          "benchmark",
          "result",
          "todo",
          engine.engine,
          arm,
          "runs",
          runId,
        );
        assert.equal(
          fs
            .readFileSync(path.join(root, "workspace", "shared.txt"), "utf8")
            .replaceAll("\r\n", "\n"),
          "after\n",
        );
        assert.ok(
          fs.existsSync(
            path.join(root, "interventions", `${result.patchSha256}.json`),
          ),
        );
      }
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/common.patch",
            runId,
            "todo",
          ]),
        ),
      "already applied",
    );

    const forbiddenPatch: string = path.join(
      repository,
      "benchmark",
      ".work",
      "repairs",
      "requirements.patch",
    );
    write(
      forbiddenPatch,
      [
        "diff --git a/docs/analysis/requirements.md b/docs/analysis/requirements.md",
        "--- a/docs/analysis/requirements.md",
        "+++ b/docs/analysis/requirements.md",
        "@@ -1 +1 @@",
        "-before",
        "+after",
        "",
      ].join("\n"),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/requirements.patch",
            runId,
            "todo",
          ]),
        ),
      "forbidden target",
    );

    const dependencyPatch: string = path.join(
      repository,
      "benchmark",
      ".work",
      "repairs",
      "dependency.patch",
    );
    write(
      dependencyPatch,
      [
        "diff --git a/packages/backend/node_modules/example.txt b/packages/backend/node_modules/example.txt",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/packages/backend/node_modules/example.txt",
        "@@ -0,0 +1 @@",
        "+forbidden",
        "",
      ].join("\n"),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/dependency.patch",
            runId,
            "todo",
          ]),
        ),
      "forbidden target",
    );

    for (const engine of EvidenceBenchmarkEngine.MATRIX)
      for (const arm of ["evidence", "plain"] as const)
        await createRepairCell(
          repository,
          runId,
          engine.engine,
          "reddit",
          arm,
          engine.engine === "codex" && arm === "evidence"
            ? "running"
            : "interrupted",
        );
    await expectFailure(
      () =>
        EvidenceBenchmarkRepair.apply(
          repository,
          EvidenceBenchmarkRepair.parse([
            "--patch",
            "benchmark/.work/repairs/common.patch",
            runId,
            "reddit",
          ]),
        ),
      "paused codex/reddit/evidence",
    );
  }

  async function createRepairCell(
    repository: string,
    runId: string,
    engine: EvidenceBenchmarkEngine.Name,
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    status: "running" | "interrupted",
  ): Promise<void> {
    const root: string = path.join(
      repository,
      "benchmark",
      "result",
      project,
      engine,
      arm,
      "runs",
      runId,
    );
    const workspace: string = path.join(root, "workspace");
    write(path.join(workspace, "shared.txt"), "before\n");
    write(
      path.join(root, "run.json"),
      `${JSON.stringify({
        project,
        arm,
        engine,
        status,
        sourceCommit: "0123456789abcdef",
        turns: [{ name: "backend-start", status: 1 }],
      })}\n`,
    );
    await EvidenceBenchmarkProcess.run("git", ["init", "-b", "benchmark"], {
      cwd: workspace,
      label: `${project}/${arm} repair fixture initialization`,
    });
  }

  function processResult(
    status: number | null,
    stdout: string = "",
    stderr: string = "",
  ): EvidenceBenchmarkProcess.IResult {
    return { status, stdout, stderr, elapsedMs: 0 };
  }

  async function testBaselineFailureCleanup(temporary: string): Promise<void> {
    const output: string = path.join(temporary, "failed-neutral-baseline");
    await expectFailure(
      () =>
        EvidenceBenchmarkBaseline.prepare({
          repository: path.join(temporary, "missing-repository"),
          output,
        }),
      "Neutral scaffold admission failed",
    );
    assert.equal(
      fs.existsSync(output),
      false,
      "failed neutral admission must not publish an output directory",
    );
    assert.deepEqual(
      fs
        .readdirSync(temporary)
        .filter((entry) => entry.startsWith(".failed-neutral-baseline.")),
      [],
      "failed neutral admission must remove its staging directory",
    );
  }

  async function testComposition(
    fixture: string,
    temporary: string,
  ): Promise<void> {
    const variables: IEvidenceBenchmarkMaterialization.IVariables =
      benchmarkVariables("self-test");
    const first: EvidenceBenchmarkTemplate.IComposition =
      EvidenceBenchmarkTemplate.compose({
        template: path.join(fixture, "benchmark", "template"),
        arm: "evidence",
        variables,
      });
    const second: EvidenceBenchmarkTemplate.IComposition =
      EvidenceBenchmarkTemplate.compose({
        template: path.join(fixture, "benchmark", "template"),
        arm: "evidence",
        variables,
      });
    assert.equal(
      EvidenceBenchmarkHash.tree(first.files),
      EvidenceBenchmarkHash.tree(second.files),
      "identical template inputs must produce identical bytes",
    );
    assert.doesNotMatch(
      Buffer.from(first.files.get("AGENTS.md")!).toString("utf8"),
      /\{\{base\}\}|benchmark-template-splice/,
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(fixture, "benchmark", "template"),
          arm: "evidence",
          variables: {
            name: variables.name,
            apiPackageName: variables.apiPackageName,
            backendPackageName: variables.backendPackageName,
          } as IEvidenceBenchmarkMaterialization.IVariables,
        }),
      "missing=frontendPackageName",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(fixture, "benchmark", "template"),
          arm: "evidence",
          variables: {
            ...variables,
            unknownPackageName: "@self-test/unknown",
          } as IEvidenceBenchmarkMaterialization.IVariables,
        }),
      "unknown=unknownPackageName",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(fixture, "benchmark", "template"),
          arm: "evidence",
          variables: {
            ...variables,
            backendPackageName: "@Self-Test/backend",
          },
        }),
      "backendPackageName is not a valid npm package name",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(fixture, "benchmark", "template"),
          arm: "evidence",
          variables: {
            ...variables,
            frontendPackageName: variables.backendPackageName,
          },
        }),
      "backendPackageName and frontendPackageName",
    );

    const collision: string = path.join(temporary, "collision");
    fs.cpSync(fixture, collision, { recursive: true });
    write(
      path.join(collision, "benchmark/template/plain/CLAUDE.md"),
      "@AGENTS.md\n",
    );
    write(
      path.join(collision, "benchmark/template/evidence/CLAUDE.md"),
      "@AGENTS.md\n",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(collision, "benchmark", "template"),
          arm: "plain",
          variables,
        }),
      "requires exactly one splice comment",
    );

    const extra: string = path.join(temporary, "extra-overlay-path");
    fs.cpSync(fixture, extra, { recursive: true });
    write(
      path.join(
        extra,
        "benchmark/template/plain/.agents/skills/review/extra.md",
      ),
      "# Extra\n",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(extra, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "evidence and plain overlay path sets differ",
    );

    const missing: string = path.join(temporary, "missing-overlay-path");
    fs.cpSync(fixture, missing, { recursive: true });
    fs.rmSync(
      path.join(
        missing,
        "benchmark/template/plain/.agents/skills/review/SKILL.md",
      ),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(missing, "benchmark", "template"),
          arm: "plain",
          variables,
        }),
      "plain template is missing required paths",
    );

    const missingCarrier: string = path.join(
      temporary,
      "missing-exclusion-carrier",
    );
    fs.cpSync(fixture, missingCarrier, { recursive: true });
    fs.rmSync(
      path.join(
        missingCarrier,
        "benchmark/template/base/packages/backend/prisma/schema/exclude.schema",
      ),
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(missingCarrier, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "base template is missing required paths: packages/backend/prisma/schema/exclude.schema",
    );

    const replacementDrift: string = path.join(temporary, "replacement-drift");
    fs.cpSync(fixture, replacementDrift, { recursive: true });
    fs.appendFileSync(
      path.join(
        replacementDrift,
        "benchmark/template/plain/packages/api/lint.config.ts",
      ),
      "\n<!-- benchmark-template-splice: base-body -->\n{{base}}\n",
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(replacementDrift, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "must contain no splice marker or token",
    );

    const malformed: string = path.join(temporary, "malformed");
    fs.cpSync(fixture, malformed, { recursive: true });
    fs.appendFileSync(
      path.join(malformed, "benchmark/template/evidence/AGENTS.md"),
      "\n{{base}}\n",
      "utf8",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkTemplate.compose({
          template: path.join(malformed, "benchmark", "template"),
          arm: "evidence",
          variables,
        }),
      "exactly one splice comment",
    );

    const invalidFrontmatter: Map<string, Uint8Array> = new Map(first.files);
    invalidFrontmatter.set(
      ".agents/skills/bad/SKILL.md",
      Buffer.from(
        "---\nname: wrong\ndescription: Invalid fixture.\n---\n# Bad\n",
      ),
    );
    await expectFailure(
      () => EvidenceBenchmarkTemplate.validate(invalidFrontmatter),
      "requires frontmatter name bad",
    );
    const invalidHeading: Map<string, Uint8Array> = new Map(first.files);
    invalidHeading.set("docs/bad.md", Buffer.from("# First\n\n# Second\n"));
    await expectFailure(
      () => EvidenceBenchmarkTemplate.validate(invalidHeading),
      "exactly one level-one heading",
    );
    const invalidLink: Map<string, Uint8Array> = new Map(first.files);
    invalidLink.set(
      "docs/bad.md",
      Buffer.from("# Bad\n\n[Missing](missing.md)\n"),
    );
    await expectFailure(
      () => EvidenceBenchmarkTemplate.validate(invalidLink),
      "link target is missing",
    );
    const invalidPath: Map<string, Uint8Array> = new Map(first.files);
    invalidPath.set("CON.md", Buffer.from("# Bad\n"));
    await expectFailure(
      () => EvidenceBenchmarkTemplate.validate(invalidPath),
      "not portable to Windows",
    );
    const fenced: Map<string, Uint8Array> = new Map(first.files);
    fenced.set(
      "docs/fenced-markdown.md",
      Buffer.from(
        [
          "# Visible",
          "",
          "````md",
          "# Hidden by four backticks",
          "```",
          "[Missing](missing.md)",
          "~~~",
          "````",
          "",
          "~~~~",
          "# Hidden by four tildes",
          "```",
          "~~~",
          "[Missing](also-missing.md)",
          "~~~~",
          "",
        ].join("\n"),
      ),
    );
    EvidenceBenchmarkTemplate.validate(fenced);
  }

  async function testRepositoryInputs(repository: string): Promise<void> {
    const prompts: string = path.join(repository, "benchmark", "prompts");
    assert.deepEqual(
      fs
        .readdirSync(prompts, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name)
        .sort(),
      ["goal.md", "instruction.md", "review.md"],
      "prompt root must contain exactly the three common user turns",
    );
    for (const arm of ["evidence", "plain"])
      assert.ok(
        fs.existsSync(path.join(prompts, arm, "final.md")),
        `${arm} final user turn is missing`,
      );

    const instructions: string = path.join(
      repository,
      "benchmark",
      "instructions",
    );
    assert.deepEqual(
      fs
        .readdirSync(instructions, { withFileTypes: true })
        .map((entry) => entry.name)
        .sort(),
      ["backend", "frontend", "overall", "skills-contract.md"],
      "backend-first instructions must contain the contract and three phase directories",
    );
    const skillsContract: string = fs.readFileSync(
      path.join(instructions, "skills-contract.md"),
      "utf8",
    );
    assert.match(
      skillsContract,
      /Before implementation, generation, project commands, or file edits:[\s\S]+Read `AGENTS\.md` in full\.[\s\S]+Enumerate every `\.agents\/skills\/\*\*\/SKILL\.md` file[\s\S]+read each one in full[\s\S]+Follow them without deviation\.[\s\S]+Never silently omit, replace, weaken, or reinterpret a skill rule\./,
      "the first frozen turn must establish the complete skills contract",
    );
    assert.match(
      skillsContract,
      /Do not start development work in this turn\./,
      "the skills-contract turn must finish before development",
    );
    assert.match(
      skillsContract,
      /Treat this [^\n]+ stage as one bounded objective\./,
      "skills-contract.md must establish a bounded stage objective",
    );
    const commandLine: string = fs.readFileSync(
      path.join(
        repository,
        "benchmark",
        "src",
        "EvidenceBenchmarkCommandLine.ts",
      ),
      "utf8",
    );
    assert.match(
      commandLine,
      /return \[\s*\{ name: "skills-contract", relative: "skills-contract\.md" \},\s*\{ name: "backend-start"/,
      "the skills contract must be the first frozen runner turn",
    );
    assert.match(
      commandLine,
      /const instructionSets:[\s\S]+readInstructionSets\(repository\)[\s\S]+instructions: instructionSets\[arm\]/,
      "one immutable instruction snapshot per arm must be shared by every selected cell",
    );
    assert.match(
      commandLine,
      /const preparations = await Promise\.allSettled\([\s\S]+prepareCell\([\s\S]+preparationFailures[\s\S]+const executions = await Promise\.allSettled\([\s\S]+runPreparedCell\(cell\)/,
      "all eight cells must cross one complete preparation barrier before any model execution",
    );
    assert.match(
      commandLine,
      /EvidenceBenchmarkTurnLedger\.assertAcceptedOrder\(state\.turns\)/,
      "resume admission must use the shared accepted-turn validator",
    );
    assert.equal(
      [
        ...commandLine.matchAll(
          /turn\.accepted = false;[\s\S]*?EvidenceBenchmarkTurnLedger\.assertSuccessfulAttempt\([\s\S]*?turn\.accepted = true;/g,
        ),
      ].length,
      2,
      "fresh and resumed turns must pass native evidence before acceptance",
    );
    const publicationSource: string = fs.readFileSync(
      path.join(
        repository,
        "benchmark",
        "src",
        "EvidenceBenchmarkPublication.ts",
      ),
      "utf8",
    );
    assert.match(
      publicationSource,
      /EvidenceBenchmarkTurnLedger\.assertAcceptedOrder\(state\.turns, true\)/,
      "publication must use the shared complete-turn validator",
    );
    for (const phase of ["backend", "frontend"])
      assert.deepEqual(
        fs.readdirSync(path.join(instructions, phase)).sort(),
        ["evidence-final.md", "plain-final.md", "review.md", "start.md"],
        `${phase} instruction inventory is invalid`,
      );
    assert.deepEqual(
      fs.readdirSync(path.join(instructions, "overall")).sort(),
      ["evidence-final.md", "plain-final.md", "review.md"],
      "overall instruction inventory is invalid",
    );
    const backendEvidenceFinal: string = fs.readFileSync(
      path.join(instructions, "backend", "evidence-final.md"),
      "utf8",
    );
    assert.match(
      backendEvidenceFinal,
      /build:prisma[\s\S]+packages\/api[\s\S]+pnpm build[\s\S]+build:main[\s\S]+build:sdk[\s\S]+build:test/,
      "backend final must preserve the authored dependency order",
    );
    assert.match(
      backendEvidenceFinal,
      /Do not run the backend package's aggregate `pnpm build` or the workspace-root build during this phase\./,
      "backend final must forbid both aggregate builds",
    );
    const frontendEvidenceFinal: string = fs.readFileSync(
      path.join(instructions, "frontend", "evidence-final.md"),
      "utf8",
    );
    assert.match(
      frontendEvidenceFinal,
      /Inspect all three canonical package `lint\.config\.ts` files\.[\s\S]+Restore all seven original claim objects[\s\S]+original populations and `error` severities[\s\S]+sealed backend main projection is unchanged/,
      "frontend final must inspect the complete seven-claim configuration",
    );
    const overallEvidenceFinal: string = fs.readFileSync(
      path.join(instructions, "overall", "evidence-final.md"),
      "utf8",
    );
    assert.match(
      overallEvidenceFinal,
      /Inspect `packages\/api\/lint\.config\.ts`, `packages\/backend\/lint\.config\.ts`, and `packages\/frontend\/lint\.config\.ts`[\s\S]+all seven claims are active with their original populations and `error` severities[\s\S]+`pnpm build`, `pnpm lint`[\s\S]+`pnpm test`/,
      "overall Evidence final must restore all configurations before the complete workspace gates",
    );
    for (const phase of ["backend", "frontend", "overall"])
      for (const file of fs.readdirSync(path.join(instructions, phase)))
        for (const contract of [
          /Treat this [^\n]+ stage as one bounded objective\./,
          /The skills-contract turn remains binding\.[^\n]*re-read `AGENTS\.md`/i,
        ])
          assert.match(
            fs.readFileSync(path.join(instructions, phase, file), "utf8"),
            contract,
            `${phase}/${file} must preserve its bounded objective and skills contract`,
          );

    const template: string = path.join(repository, "benchmark", "template");
    for (const arm of ["evidence", "plain"] as const) {
      const composition: EvidenceBenchmarkTemplate.IComposition =
        EvidenceBenchmarkTemplate.compose({
          template,
          arm,
          variables: benchmarkVariables("integrated-self-test"),
        });
      assert.ok(composition.files.size > 0);
      for (const relative of [
        ".github/workflows/ci.yml",
        "packages/frontend/src/lib/client.ts",
        "packages/frontend/src/lib/config.ts",
      ])
        assert.ok(
          composition.files.has(relative),
          `integrated ${arm} scaffold is missing authored source ${relative}`,
        );
      const myModule: string = Buffer.from(
        composition.files.get("packages/backend/src/MyModule.ts")!,
      ).toString("utf8");
      assert.match(
        myModule,
        /path\.join\(__dirname, "controllers"\)/,
        `integrated ${arm} runtime must discover its adjacent controller tree`,
      );
      assert.doesNotMatch(
        myModule,
        /process\.cwd\(\)|fs\.existsSync/,
        `integrated ${arm} runtime must not hide a missing controller tree with a source fallback`,
      );
      const nestiaConfig: string = Buffer.from(
        composition.files.get("packages/backend/nestia.config.ts")!,
      ).toString("utf8");
      assert.match(
        nestiaConfig,
        /input: \["src\/controllers"\]/,
        `integrated ${arm} Nestia config must select the authored controller tree directly`,
      );
      const wiring: string = Buffer.from(
        composition.files.get(".agents/skills/backend/wiring.md")!,
      ).toString("utf8");
      assert.doesNotMatch(
        wiring,
        /MyModule\.input\(\)/,
        `integrated ${arm} wiring guide must not teach a nonexistent controller input API`,
      );
      const workflow: string = Buffer.from(
        composition.files.get(".github/workflows/ci.yml")!,
      ).toString("utf8");
      for (const command of [
        "pnpm install --frozen-lockfile",
        "pnpm build",
        "pnpm lint",
        "pnpm prepare:database",
        "pnpm test:backend",
        "playwright install --with-deps chromium",
        "pnpm test:frontend",
      ])
        assert.ok(
          workflow.includes(command),
          `integrated ${arm} CI is missing ${command}`,
        );
      if (arm === "evidence")
        assertEvidenceClaimDeferralContract(composition.files);
    }

    const requirements: string = path.join(
      repository,
      "benchmark",
      "requirements",
    );
    for (const entry of fs.readdirSync(requirements, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) continue;
      const subject: string = path.join(requirements, entry.name);
      const corpus: EvidenceBenchmarkCorpus.IResult =
        EvidenceBenchmarkCorpus.read(subject);
      assert.ok(corpus.documents > 0);
      assert.ok(corpus.h2 > 0);
      assert.ok(corpus.h3 > 0);
      assert.ok(
        [...corpus.files.keys()].every((relative) => relative.endsWith(".md")),
        `${entry.name} requirement corpus must contain only Markdown`,
      );
    }
  }

  function assertEvidenceClaimDeferralContract(
    files: ReadonlyMap<string, Uint8Array>,
  ): void {
    const configurations: Readonly<Record<string, readonly string[]>> = {
      "packages/backend/lint.config.ts": [
        "schema-models",
        "api-operations",
        "backend-tests",
      ],
      "packages/api/lint.config.ts": ["dto-types", "dto-properties"],
      "packages/frontend/lint.config.ts": [
        "frontend-screens",
        "frontend-journeys",
      ],
    };
    const claims: Map<
      string,
      Map<string, { node: ts.ObjectLiteralExpression; source: ts.SourceFile }>
    > = new Map();
    for (const [relative, names] of Object.entries(configurations)) {
      const content: Uint8Array | undefined = files.get(relative);
      assert.ok(
        content,
        `materialized Evidence template is missing ${relative}`,
      );
      const objects = readClaimObjects(
        relative,
        Buffer.from(content).toString("utf8"),
      );
      assert.deepEqual(
        [...objects.keys()],
        names,
        `${relative} claim ownership drifted`,
      );
      claims.set(relative, objects);
    }
    assert.equal(
      [...claims.values()].reduce((sum, entries) => sum + entries.size, 0),
      7,
      "the materialized Evidence graph must own exactly seven claims",
    );
    const mainRelative = "packages/backend/lint.config.main.ts";
    const mainBytes: Uint8Array | undefined = files.get(mainRelative);
    assert.ok(
      mainBytes,
      `materialized Evidence template is missing ${mainRelative}`,
    );
    const mainClaims = readClaimObjects(
      mainRelative,
      Buffer.from(mainBytes).toString("utf8"),
    );
    assert.deepEqual(
      [...mainClaims.keys()],
      ["schema-models", "api-operations"],
      "the backend source Program must retain the exact two-claim projection",
    );
    for (const name of mainClaims.keys()) {
      const canonical = claims
        .get("packages/backend/lint.config.ts")
        ?.get(name);
      const projected = mainClaims.get(name);
      assert.ok(
        canonical !== undefined && projected !== undefined,
        `backend main projection has no canonical ${name} claim`,
      );
      assert.equal(
        normalizeClaimSource(projected.node.getText(projected.source)),
        normalizeClaimSource(canonical.node.getText(canonical.source)),
        `backend main projection drifted from canonical ${name}`,
      );
    }
    for (const [relative, configFile] of [
      ["packages/backend/tsconfig.json", "./lint.config.main.ts"],
      ["packages/backend/tsconfig.lint.json", "./lint.config.ts"],
      ["packages/backend/tsconfig.test.json", "./lint.config.ts"],
    ] as const) {
      const bytes: Uint8Array | undefined = files.get(relative);
      assert.ok(bytes, `materialized Evidence template is missing ${relative}`);
      const config = JSON.parse(Buffer.from(bytes).toString("utf8")) as {
        compilerOptions?: {
          plugins?: Array<{ transform?: unknown; configFile?: unknown }>;
        };
      };
      assert.deepEqual(
        config.compilerOptions?.plugins,
        [{ transform: "@ttsc/lint", configFile }],
        `${relative} must load the graph matching its exact Program`,
      );
    }

    const skillPath: string = ".agents/skills/evidence/SKILL.md";
    const skillBytes: Uint8Array | undefined = files.get(skillPath);
    assert.ok(
      skillBytes,
      `materialized Evidence template is missing ${skillPath}`,
    );
    const skill: string = Buffer.from(skillBytes).toString("utf8");
    const matrix: readonly string[] = [
      "Schema authoring | `schema-models` | `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys`",
      "DTO authoring | `schema-models`, `dto-types`, `dto-properties` | `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys`",
      "Controller authoring | `schema-models`, `dto-types`, `dto-properties`, `api-operations` | `backend-tests`, `frontend-screens`, `frontend-journeys`",
      "SDK generation | `schema-models`, `dto-types`, `dto-properties`, `api-operations` | `backend-tests`, `frontend-screens`, `frontend-journeys`",
      "Backend test | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests` | `frontend-screens`, `frontend-journeys`",
      "Backend report | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests` | `frontend-screens`, `frontend-journeys`",
      "Frontend screen | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens` | `frontend-journeys`",
      "Frontend journey/report | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys` | None",
      "Overall final | `schema-models`, `dto-types`, `dto-properties`, `api-operations`, `backend-tests`, `frontend-screens`, `frontend-journeys` | None",
    ];
    const matrixStart: number = skill.indexOf(
      "| Gate | Must be active | May be deferred only if not started |",
    );
    const matrixEnd: number = skill.indexOf(
      "\n\nBefore `build:sdk`",
      matrixStart,
    );
    assert.ok(matrixStart >= 0 && matrixEnd > matrixStart);
    const documentedRows: readonly string[] = skill
      .slice(matrixStart, matrixEnd)
      .split(/\r?\n/)
      .map((line) =>
        line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim())
          .join(" | "),
      );
    assert.deepEqual(documentedRows, [
      "Gate | Must be active | May be deferred only if not started",
      "--- | --- | ---",
      ...matrix,
    ]);
    for (const contract of [
      "Diagnostic volume never permits deferring the claim for the layer under active development.",
      "Before `build:sdk`, the schema, DTO, and API-operation claims must all be active and healthy.",
      "Never edit a claim's internals, severity, rule entry, `files`, `symbol`, or `reference` population; never disable `evidence/graph` or add an environment bypass.",
      "Open all three canonical `lint.config.ts` files and restore every temporarily commented claim; confirm the immutable backend main projection is unchanged.",
      "Confirm every configured evidence rule retains its original `error` severity and every claim retains its original population.",
      "Verify restoration from the three canonical configuration files and the immutable backend main projection, then run the complete workspace lint, build, and test gates with no staged configuration override.",
      "An agent's prose report is not restoration evidence.",
    ])
      assert.ok(
        skill.includes(contract),
        `Evidence deferral contract is missing ${contract}`,
      );

    const testingPath: string = ".agents/skills/backend/testing.md";
    const testingBytes: Uint8Array | undefined = files.get(testingPath);
    assert.ok(
      testingBytes,
      `materialized Evidence template is missing ${testingPath}`,
    );
    const testing: string = Buffer.from(testingBytes).toString("utf8");
    assert.match(
      testing,
      /@evidence \{@link api\.functional\.orders\.checkout\}/,
      "backend test guidance must use the configured TypeScript SDK reference",
    );
    assert.match(
      testing,
      /@evidenceExclude \{@link api\.functional\.health\.get\}/,
      "backend test exclusions must use the configured TypeScript SDK reference",
    );
    assert.doesNotMatch(
      testing,
      /(?:POST:\/orders\/checkout|GET:\/health|Swagger\/OpenAPI)/,
      "backend test guidance must not teach an unconfigured Swagger reference",
    );

    const examplePattern =
      /<!-- claim-deferral-example: ([^#\s]+)#([a-z-]+) -->\r?\n```ts\r?\n([\s\S]*?)\r?\n```/g;
    const examples: Array<{
      relative: string;
      name: string;
      snippet: string;
    }> = [];
    for (const match of skill.matchAll(examplePattern))
      examples.push({
        relative: match[1]!,
        name: match[2]!,
        snippet: match[3]!,
      });
    assert.deepEqual(
      examples.map(({ relative, name }) => `${relative}#${name}`),
      [
        "packages/backend/lint.config.ts#api-operations",
        "packages/api/lint.config.ts#dto-properties",
        "packages/frontend/lint.config.ts#frontend-screens",
      ],
      "the Evidence skill must carry one actual whole-object example per config",
    );
    const printer: ts.Printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
      removeComments: true,
    });
    for (const example of examples) {
      const lines: string[] = example.snippet
        .replaceAll("\r\n", "\n")
        .split("\n");
      assert.equal(lines[0], "claims: [");
      assert.equal(lines.at(-1), "],");
      const commented: string[] = lines.slice(1, -1);
      assert.ok(commented.length > 0, `${example.name} example is empty`);
      assert.ok(
        commented.every((line) => /^\s*\/\/(?: |$)/.test(line)),
        `${example.name} must comment every line of the whole claim object`,
      );
      assert.match(
        commented.at(-1)!,
        /^\s*\/\/ \},$/,
        `${example.name} must retain the claim's following comma`,
      );
      const restored: string = commented
        .map((line) => line.replace(/^(\s*)\/\/ ?/, "$1"))
        .join("\n");
      const restoredObjects = readClaimObjects(
        `${example.relative}#${example.name}`,
        `const graph = { claims: [\n${restored}\n] };\n`,
      );
      assert.deepEqual(
        [...restoredObjects.keys()],
        [example.name],
        `${example.name} example must restore exactly one whole claim`,
      );
      const expected = claims.get(example.relative)?.get(example.name);
      const actual = restoredObjects.get(example.name);
      assert.ok(
        expected !== undefined && actual !== undefined,
        `${example.relative} does not own ${example.name}`,
      );
      assert.equal(
        printer.printNode(ts.EmitHint.Expression, actual.node, actual.source),
        printer.printNode(
          ts.EmitHint.Expression,
          expected.node,
          expected.source,
        ),
        `${example.name} example drifted from the materialized lint config`,
      );
      assert.equal(
        normalizeClaimSource(actual.node.getText(actual.source)),
        normalizeClaimSource(expected.node.getText(expected.source)),
        `${example.name} example must retain the exact whole claim object`,
      );
    }
  }

  function readClaimObjects(
    filename: string,
    content: string,
  ): Map<string, { node: ts.ObjectLiteralExpression; source: ts.SourceFile }> {
    const source: ts.SourceFile = ts.createSourceFile(
      filename,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const arrays: ts.ArrayLiteralExpression[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAssignment(node) &&
        propertyName(node.name) === "claims" &&
        ts.isArrayLiteralExpression(node.initializer)
      )
        arrays.push(node.initializer);
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.equal(arrays.length, 1, `${filename} must define one claims array`);
    const output = new Map<
      string,
      { node: ts.ObjectLiteralExpression; source: ts.SourceFile }
    >();
    for (const element of arrays[0]!.elements) {
      assert.ok(
        ts.isObjectLiteralExpression(element),
        `${filename} claims must contain only object literals`,
      );
      const property = element.properties.find(
        (candidate): candidate is ts.PropertyAssignment =>
          ts.isPropertyAssignment(candidate) &&
          propertyName(candidate.name) === "name",
      );
      assert.ok(
        property !== undefined && ts.isStringLiteral(property.initializer),
        `${filename} claim is missing its literal name`,
      );
      assert.equal(
        output.has(property.initializer.text),
        false,
        `${filename} duplicates ${property.initializer.text}`,
      );
      output.set(property.initializer.text, { node: element, source });
    }
    return output;
  }

  function propertyName(name: ts.PropertyName): string | undefined {
    return ts.isIdentifier(name) || ts.isStringLiteral(name)
      ? name.text
      : undefined;
  }

  function normalizeClaimSource(input: string): string {
    const lines: string[] = input.replaceAll("\r\n", "\n").split("\n");
    const indentation: number = Math.min(
      ...lines
        .slice(1, -1)
        .filter((line) => line.trim().length !== 0)
        .map((line) => line.match(/^\s*/)![0].length),
    );
    return lines
      .map((line, index) =>
        index === 0 || index === lines.length - 1
          ? line.trim()
          : line.slice(indentation).trimEnd(),
      )
      .join("\n");
  }

  async function testRetentionIgnore(repository: string): Promise<void> {
    for (const relative of [
      "benchmark/result/todo/codex/evidence/runs/example/logs/stderr.raw.log",
      "benchmark/.work/todo/claude-code/evidence/terminal/stderr.raw.log",
    ]) {
      const result = await EvidenceBenchmarkProcess.run(
        "git",
        ["check-ignore", "--no-index", relative],
        {
          cwd: repository,
          allowFailure: true,
          label: `check ignored benchmark artifact ${relative}`,
        },
      );
      assert.equal(
        result.status,
        0,
        `local benchmark output must remain ignored: ${relative}`,
      );
    }
  }

  async function testPinnedPnpm(repository: string): Promise<void> {
    const version = await EvidenceBenchmarkProcess.pnpm(["--version"], {
      cwd: repository,
      label: "self-test pinned pnpm",
    });
    assert.equal(version.stdout.trim(), EvidenceBenchmarkProcess.PNPM_VERSION);
    const rootPackageManager: string = (
      JSON.parse(
        fs.readFileSync(path.join(repository, "package.json"), "utf8"),
      ) as { packageManager: string }
    ).packageManager;
    if (rootPackageManager !== `pnpm@${EvidenceBenchmarkProcess.PNPM_VERSION}`)
      assert.notEqual(
        version.stdout.trim(),
        rootPackageManager.replace(/^pnpm@/, ""),
        "benchmark pnpm must not inherit the repository package manager",
      );
    const scaffoldPackageManager: string = (
      JSON.parse(
        fs.readFileSync(
          path.join(
            repository,
            "benchmark",
            "template",
            "base",
            "package.json",
          ),
          "utf8",
        ),
      ) as { packageManager: string }
    ).packageManager;
    assert.equal(
      scaffoldPackageManager,
      `pnpm@${EvidenceBenchmarkProcess.PNPM_VERSION}`,
    );
  }

  async function testPinnedSetup(temporary: string): Promise<void> {
    const root: string = path.join(temporary, "setup-cell");
    const workspace: string = path.join(root, "workspace");
    const cache: string = path.join(root, "cache");
    write(
      path.join(workspace, "package.json"),
      `${JSON.stringify(
        {
          private: true,
          name: "benchmark-setup-self-test",
          packageManager: `pnpm@${EvidenceBenchmarkProcess.PNPM_VERSION}`,
          scripts: {
            "nested-version": "pnpm --version",
          },
          devDependencies: {
            "@ttsc/lint": "0.22.0",
            ttsc: "0.22.0",
            typescript: "7.0.2",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(path.join(workspace, "pnpm-workspace.yaml"), 'packages:\n  - "."\n');
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
    };
    EvidenceBenchmarkSetup.configureEnvironment(root, environment, {
      pnpm: path.join(cache, "pnpm-store"),
      ttsc: path.join(cache, "ttsc"),
      go: path.join(cache, "go-build"),
      playwright: path.join(cache, "playwright"),
      toolchain: path.join(cache, "toolchain-bin"),
    });
    const materialization: IEvidenceBenchmarkMaterialization = {
      root,
      workspace,
      immutableInputs: path.join(root, "inputs", "requirements"),
      manifest: path.join(root, "materialization.json"),
      workspaceTreeSha256: EvidenceBenchmarkHash.bytes("setup fixture"),
      lintBaselines: [],
      environment,
    };
    const setup = await EvidenceBenchmarkSetup.prepare({
      materialization,
      arm: "plain",
    });
    assert.ok(setup.elapsedMs >= setup.lockElapsedMs + setup.installElapsedMs);
    assert.equal(setup.pnpmVersion, EvidenceBenchmarkProcess.PNPM_VERSION);
    assert.ok(fs.existsSync(path.join(workspace, "pnpm-lock.yaml")));
    assert.ok(fs.existsSync(path.join(root, "setup.json")));
    const nested = await EvidenceBenchmarkProcess.pnpm(
      ["run", "nested-version"],
      {
        cwd: workspace,
        env: materialization.environment,
        label: "self-test nested pinned pnpm",
      },
    );
    assert.ok(
      nested.stdout
        .split(/\r?\n/)
        .some((line) => line.trim() === EvidenceBenchmarkProcess.PNPM_VERSION),
      "nested package scripts must resolve the benchmark-pinned pnpm",
    );
  }

  /**
   * Verifies Markdown corpus integrity without a parallel inventory contract.
   *
   * The corpus reader must preserve exact input bytes while deriving only
   * structure present in Markdown. It must reject other file kinds and
   * ambiguous requirement nodes without assigning semantics to numeric filename
   * prefixes.
   *
   * 1. Read a valid corpus with shared ordering prefixes and fenced examples.
   * 2. Reject a non-Markdown sidecar.
   * 3. Reject duplicate and anonymous requirement nodes.
   */
  async function testMarkdownCorpus(temporary: string): Promise<void> {
    const root: string = path.join(temporary, "markdown-corpus");
    write(
      path.join(root, "00-corpus-contract.md"),
      "# Corpus Contract\r\n\r\nMarkdown is authoritative.\r\n",
    );
    write(
      path.join(root, "00-contents.md"),
      "# Corpus Contents\n\nTwo documents may share an ordering prefix.\n",
    );
    write(
      path.join(root, "01-requirements.md"),
      [
        "# Requirements",
        "",
        "## REQ-GROUP: Area",
        "",
        "### REQ-ONE: First",
        "",
        "Bound behavior.",
        "",
        "```md",
        "## REQ-HIDDEN: Example",
        "### REQ-HIDDEN-ONE: Example",
        "```",
        "",
      ].join("\n"),
    );
    const result: EvidenceBenchmarkCorpus.IResult =
      EvidenceBenchmarkCorpus.read(root);
    assert.equal(result.documents, 3);
    assert.equal(result.h2, 1);
    assert.equal(result.h3, 1);
    assert.deepEqual(
      result.files.get("00-corpus-contract.md"),
      fs.readFileSync(path.join(root, "00-corpus-contract.md")),
      "parser normalization must never rewrite copied corpus bytes",
    );

    const nonMarkdown: string = path.join(temporary, "non-markdown-corpus");
    fs.cpSync(root, nonMarkdown, { recursive: true });
    write(
      path.join(nonMarkdown, "metadata.json"),
      '{"parallel":"inventory"}\n',
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(nonMarkdown),
      "root-level numbered Markdown documents: metadata.json",
    );

    const duplicate: string = path.join(temporary, "duplicate-node-corpus");
    fs.cpSync(root, duplicate, { recursive: true });
    write(
      path.join(duplicate, "02-more.md"),
      "# More\n\n### REQ-ONE: Duplicate\n",
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(duplicate),
      "Requirement heading is duplicated: REQ-ONE",
    );

    const anonymous: string = path.join(temporary, "anonymous-h3-corpus");
    fs.cpSync(root, anonymous, { recursive: true });
    write(
      path.join(anonymous, "02-more.md"),
      "# More\n\n### Missing identifier\n",
    );
    await expectFailure(
      () => EvidenceBenchmarkCorpus.read(anonymous),
      "H3 must own a REQ identifier",
    );
  }

  async function testMaterialization(
    repository: string,
    temporary: string,
  ): Promise<void> {
    fs.cpSync(
      path.join(repository, "benchmark", "requirements", "todo"),
      path.join(repository, "benchmark", "requirements", "free-form-subject"),
      { recursive: true },
    );
    const archive: string = path.join(temporary, "fake.tgz");
    fs.writeFileSync(archive, "fixture archive bytes", "utf8");
    const archiveBytes: Buffer = fs.readFileSync(archive);
    const artifact: IEvidenceBenchmarkPackageArtifact = {
      archive,
      name: "@samchon/lint-plugin-evidence",
      version: "0.0.0-self-test",
      bytes: archiveBytes.byteLength,
      sha256: EvidenceBenchmarkHash.bytes(archiveBytes),
      sri: EvidenceBenchmarkHash.sri(archiveBytes),
      payloadSha256: EvidenceBenchmarkHash.bytes("fixture payload"),
      sourceCommit: "0000000000000000000000000000000000000000",
      sourceLockSha256: EvidenceBenchmarkHash.bytes("fixture lock"),
      elapsedMs: 0,
      packElapsedMs: 0,
      smokeInstallElapsedMs: 0,
      smokeCheckElapsedMs: 0,
      pnpmVersion: EvidenceBenchmarkProcess.PNPM_VERSION,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
    };
    const variables: IEvidenceBenchmarkMaterialization.IVariables =
      benchmarkVariables("self-test");
    const cells: Map<string, IEvidenceBenchmarkMaterialization> = new Map();
    for (const project of ["todo", "reddit", "erp", "free-form-subject"])
      for (const arm of ["evidence", "plain"] as const) {
        const cell = await EvidenceBenchmarkMaterializer.materialize({
          repository,
          output: path.join(temporary, `${project}-${arm}`),
          project,
          arm,
          variables,
          artifact,
        });
        cells.set(`${project}/${arm}`, cell);
        assertIntegratedCell({
          repository,
          project,
          arm,
          variables,
          artifact,
          cell,
        });
      }
    const evidenceOne: IEvidenceBenchmarkMaterialization =
      cells.get("todo/evidence")!;
    const plain: IEvidenceBenchmarkMaterialization = cells.get("todo/plain")!;
    const evidenceTwo = await EvidenceBenchmarkMaterializer.materialize({
      repository,
      output: path.join(temporary, "todo-evidence-repeat"),
      project: "todo",
      arm: "evidence",
      variables,
      artifact,
    });
    assert.equal(
      evidenceOne.workspaceTreeSha256,
      evidenceTwo.workspaceTreeSha256,
      "cell destination must not alter workspace bytes",
    );
    assert.equal(
      EvidenceBenchmarkHash.tree(
        EvidenceBenchmarkHash.directory(evidenceOne.workspace),
      ),
      EvidenceBenchmarkHash.tree(
        EvidenceBenchmarkHash.directory(evidenceTwo.workspace),
      ),
    );
    const sealedFiles: ReadonlyMap<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(evidenceOne.workspace);
    const expectSeverityFailure = async (
      relative: string,
      before: string,
      after: string,
      fragment: string,
    ): Promise<void> => {
      const changed: Map<string, Uint8Array> = new Map(sealedFiles);
      const source: string = Buffer.from(changed.get(relative)!).toString(
        "utf8",
      );
      assert.equal(
        source.includes(before),
        true,
        `severity fixture must contain ${before}`,
      );
      changed.set(relative, Buffer.from(source.replace(before, after), "utf8"));
      await expectFailure(
        () => EvidenceBenchmarkLintBaseline.capture(changed, "evidence"),
        fragment,
      );
    };
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/graph": ["error", graph]',
      '"evidence/graph": "off"',
      'direct ["error", graph] tuple',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/graph": ["error", graph]',
      '"evidence/graph": "warn"',
      'direct ["error", graph] tuple',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[2],
      '"evidence/graph": ["error", graph]',
      '"evidence/graph": true ? "off" : ["error", graph]',
      'direct ["error", graph] tuple',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[1],
      'isNestiaConfigLoader ? "off" : ["error", graph]',
      'true ? "off" : ["error", graph]',
      "authorized Nestia loader bypass",
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/graph": ["error", graph]',
      '"evidence/graph": "off" }, decoy: { "evidence/graph": ["error", graph]',
      'direct ["error", graph] tuple',
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[0],
      '"evidence/graph": ["error", graph]',
      '"evidence/todo": "error" }, decoy: { "evidence/graph": ["error", graph]',
      "active evidence/graph rule",
    );
    await expectSeverityFailure(
      EvidenceBenchmarkLintBaseline.PATHS[1],
      "const isNestiaConfigLoader",
      "let isNestiaConfigLoader",
      "authorized Nestia loader bypass",
    );
    const backendLint: string = path.join(
      evidenceTwo.workspace,
      "packages",
      "backend",
      "lint.config.ts",
    );
    const backendLintSource: string = fs.readFileSync(backendLint, "utf8");
    const longClaimName: string = "x".repeat(4_096);
    fs.writeFileSync(
      backendLint,
      backendLintSource.replace(
        '"api-operations"',
        JSON.stringify(longClaimName),
      ),
      "utf8",
    );
    let semanticFailure: unknown;
    try {
      EvidenceBenchmarkLintBaseline.assertRestored(
        evidenceTwo.workspace,
        "evidence",
        evidenceTwo.lintBaselines,
      );
    } catch (error) {
      semanticFailure = error;
    }
    assert.ok(
      semanticFailure instanceof Error,
      "semantic drift must fail restoration",
    );
    assert.match(
      semanticFailure.message,
      /Lint graph semantics were not restored/,
    );
    assert.ok(
      semanticFailure.message.length < 1_024,
      "semantic drift diagnostics must remain bounded",
    );
    assert.equal(
      semanticFailure.message.includes(longClaimName),
      false,
      "semantic drift diagnostics must truncate individual claim names",
    );
    assert.doesNotMatch(
      semanticFailure.message,
      /"definition"/,
      "semantic drift diagnostics must not dump complete claim objects",
    );
    fs.writeFileSync(backendLint, backendLintSource, "utf8");
    fs.appendFileSync(backendLint, "// unauthorized bypass\n", "utf8");
    await expectFailure(
      () =>
        EvidenceBenchmarkLintBaseline.assertRestored(
          evidenceTwo.workspace,
          "evidence",
          evidenceTwo.lintBaselines,
        ),
      "Lint configuration bytes were not restored",
    );
    fs.writeFileSync(backendLint, backendLintSource, "utf8");
    assert.equal(
      fs.readdirSync(temporary).some((entry) => entry.includes(".tmp")),
      false,
      "materializer must not leak staging directories",
    );
    const failedOutput: string = path.join(temporary, "materializer-failure");
    await expectFailure(
      () =>
        EvidenceBenchmarkMaterializer.materialize({
          repository,
          output: failedOutput,
          project: "todo",
          arm: "evidence",
          variables,
          artifact: {
            ...artifact,
            sha256: EvidenceBenchmarkHash.bytes("wrong archive identity"),
          },
        }),
      "archive drifted",
    );
    assert.equal(fs.existsSync(failedOutput), false);
    assert.equal(
      fs
        .readdirSync(temporary)
        .some(
          (entry) =>
            entry.startsWith(".materializer-failure.") &&
            entry.endsWith(".tmp"),
        ),
      false,
      "failed materialization must remove its exact unpublished stage",
    );
    await expectFailure(
      () =>
        EvidenceBenchmarkMaterializer.materialize({
          repository,
          output: evidenceOne.root,
          project: "todo",
          arm: "evidence",
          variables,
          artifact,
        }),
      "refuses to overwrite",
    );
    assert.equal(
      fs.existsSync(path.join(plain.workspace, ".benchmark-deps")),
      false,
    );
  }

  function assertIntegratedCell(props: {
    repository: string;
    project: IEvidenceBenchmarkMaterialization.Project;
    arm: "evidence" | "plain";
    variables: IEvidenceBenchmarkMaterialization.IVariables;
    artifact: IEvidenceBenchmarkPackageArtifact;
    cell: IEvidenceBenchmarkMaterialization;
  }): void {
    const corpus: EvidenceBenchmarkCorpus.IResult =
      EvidenceBenchmarkCorpus.read(
        path.join(props.repository, "benchmark", "requirements", props.project),
      );
    const workspaceCorpus: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(
        path.join(props.cell.workspace, "docs", "analysis"),
      );
    const immutableCorpus: Map<string, Uint8Array> =
      EvidenceBenchmarkHash.directory(props.cell.immutableInputs);
    assert.equal(
      EvidenceBenchmarkHash.tree(workspaceCorpus),
      EvidenceBenchmarkHash.tree(corpus.files),
      `${props.project}/${props.arm} workspace must receive the whole corpus`,
    );
    assert.equal(
      EvidenceBenchmarkHash.tree(immutableCorpus),
      EvidenceBenchmarkHash.tree(corpus.files),
      `${props.project}/${props.arm} immutable input must receive the whole corpus`,
    );

    const manifest = JSON.parse(
      fs.readFileSync(props.cell.manifest, "utf8"),
    ) as IEvidenceBenchmarkMaterialization.IManifest;
    assert.equal(manifest.schemaVersion, 5);
    assert.ok(manifest.elapsedMs >= 0);
    assert.equal("materializedAt" in manifest, false);
    assert.equal(
      props.cell.environment.PLAYWRIGHT_BROWSERS_PATH,
      manifest.caches.playwright,
    );
    assert.equal(manifest.artifact.sha256, props.artifact.sha256);
    assert.deepEqual(manifest.corpus, {
      documents: corpus.documents,
      h2: corpus.h2,
      h3: corpus.h3,
    });
    assert.deepEqual(manifest.lintBaselines, props.cell.lintBaselines);
    assert.equal(
      EvidenceBenchmarkLintBaseline.assertRestored(
        props.cell.workspace,
        props.arm,
        props.cell.lintBaselines,
      ),
      EvidenceBenchmarkLintBaseline.digest(props.cell.lintBaselines),
    );
    assert.deepEqual(
      props.cell.lintBaselines.map((entry) => ({
        path: entry.path,
        claims: entry.graph?.claims.map((claim) => claim.name) ?? null,
      })),
      [
        {
          path: "packages/api/lint.config.ts",
          claims:
            props.arm === "evidence" ? ["dto-types", "dto-properties"] : null,
        },
        {
          path: "packages/backend/lint.config.ts",
          claims:
            props.arm === "evidence"
              ? ["schema-models", "api-operations", "backend-tests"]
              : null,
        },
        {
          path: "packages/frontend/lint.config.ts",
          claims:
            props.arm === "evidence"
              ? ["frontend-screens", "frontend-journeys"]
              : null,
        },
        {
          path: "packages/backend/lint.config.main.ts",
          claims:
            props.arm === "evidence"
              ? ["schema-models", "api-operations"]
              : null,
        },
      ],
    );
    const archiveRelative: string = `.benchmark-deps/e-${props.artifact.sha256.slice(0, 12)}.tgz`;
    const packageManifest = JSON.parse(
      fs.readFileSync(path.join(props.cell.workspace, "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    if (props.arm === "evidence") {
      assert.equal(manifest.artifact.relativeArchive, archiveRelative);
      assert.equal(
        packageManifest.devDependencies?.["@samchon/lint-plugin-evidence"],
        `file:${archiveRelative}`,
      );
      assert.ok(
        fs.existsSync(
          path.join(props.cell.workspace, ...archiveRelative.split("/")),
        ),
      );
    } else {
      assert.equal(manifest.artifact.relativeArchive, undefined);
      assert.equal(
        packageManifest.devDependencies?.["@samchon/lint-plugin-evidence"],
        undefined,
      );
      assert.equal(
        fs.existsSync(path.join(props.cell.workspace, ".benchmark-deps")),
        false,
      );
    }

    for (const packageName of ["api", "backend", "frontend"]) {
      const relative: string = `packages/${packageName}/lint.config.ts`;
      const overlay: string = fs
        .readFileSync(
          path.join(
            props.repository,
            "benchmark",
            "template",
            props.arm,
            ...relative.split("/"),
          ),
          "utf8",
        )
        .replaceAll("\r\n", "\n");
      const expected: string = renderFixtureVariables(overlay, props.variables);
      assert.equal(
        fs.readFileSync(
          path.join(props.cell.workspace, ...relative.split("/")),
          "utf8",
        ),
        expected,
        `${props.project}/${props.arm} must fully replace ${relative}`,
      );
    }
    for (const [relative, content] of EvidenceBenchmarkHash.directory(
      props.cell.workspace,
    )) {
      if (!/\.(?:c?js|mjs|json|md|ts|ya?ml)$/i.test(relative)) continue;
      const source: string = Buffer.from(content).toString("utf8");
      assert.doesNotMatch(
        source,
        /benchmark-template-splice:\s*base-body|\{\{base\}\}/,
        `${props.project}/${props.arm} retained a splice marker in ${relative}`,
      );
      assert.doesNotMatch(
        source,
        /\{\{(?:name|apiPackageName|backendPackageName|frontendPackageName)\}\}/,
        `${props.project}/${props.arm} retained a package placeholder in ${relative}`,
      );
    }
    if (props.arm === "evidence")
      assertEvidenceClaimDeferralContract(
        EvidenceBenchmarkHash.directory(props.cell.workspace),
      );
  }

  function renderFixtureVariables(
    source: string,
    variables: IEvidenceBenchmarkMaterialization.IVariables,
  ): string {
    return source.replace(
      /\{\{(name|apiPackageName|backendPackageName|frontendPackageName)\}\}/g,
      (
        _match: string,
        key: keyof IEvidenceBenchmarkMaterialization.IVariables,
      ) => variables[key],
    );
  }

  async function testPackage(
    repository: string,
    temporary: string,
  ): Promise<void> {
    const commit = await EvidenceBenchmarkProcess.run(
      "git",
      ["rev-parse", "HEAD"],
      {
        cwd: repository,
        label: "read package-smoke source commit",
      },
    );
    const output: string = path.join(temporary, "artifact");
    const request: IEvidenceBenchmarkPackageArtifact.IRequest = {
      repository,
      expectedCommit: commit.stdout.trim(),
      output,
    };
    const [first, second] = await Promise.all([
      EvidenceBenchmarkPackage.prepare(request),
      EvidenceBenchmarkPackage.prepare(request),
    ]);
    assert.equal(first.sha256, second.sha256);
    assert.equal(first.archive, second.archive);
    assert.equal(EvidenceBenchmarkHash.file(first.archive), first.sha256);
    assert.equal(
      fs.readdirSync(output).filter((file) => file.endsWith(".tgz")).length,
      1,
    );

    const cell = await EvidenceBenchmarkMaterializer.materialize({
      repository,
      output: path.join(temporary, "nestia-evidence-smoke"),
      project: "todo",
      arm: "evidence",
      variables: benchmarkVariables("nestia-evidence-smoke"),
      artifact: first,
    });
    const runtime: EvidenceBenchmarkRuntime.IAssignment =
      EvidenceBenchmarkRuntime.assign(0, 52_000);
    EvidenceBenchmarkRuntime.apply(cell.environment, runtime);
    EvidenceBenchmarkRuntime.persist(cell.workspace, runtime);
    await EvidenceBenchmarkSetup.prepare({
      materialization: cell,
      arm: "evidence",
    });
    await EvidenceBenchmarkConsumerProof.verifyPrismaIsolation(cell);
    await EvidenceBenchmarkProcess.pnpm(["exec", "nestia", "all"], {
      cwd: path.join(cell.workspace, "packages", "backend"),
      env: cell.environment,
      label: "Nestia evidence config-loader smoke",
    });
    const build: EvidenceBenchmarkProcess.IResult =
      await EvidenceBenchmarkProcess.pnpm(["run", "build"], {
        cwd: cell.workspace,
        env: cell.environment,
        label: "packaged Evidence template graph gate",
        allowFailure: true,
      });
    assert.notEqual(
      build.status,
      0,
      "the pristine Evidence template must stop at its unimplemented graph",
    );
    const buildOutput: string = `${build.stdout}\n${build.stderr}`.replace(
      /\u001b\[[0-9;]*m/g,
      "",
    );
    assert.match(
      buildOutput,
      /evidence\/graph/,
      "the packaged Evidence build must reach the active graph",
    );
    const compilerDiagnostics: string[] = buildOutput
      .split(/\r?\n/)
      .filter((line) => /\berror TS\d+:/.test(line));
    assert.ok(
      compilerDiagnostics.length !== 0,
      "the packaged Evidence build must retain compiler diagnostics",
    );
    assert.deepEqual(
      compilerDiagnostics.filter((line) => !line.includes("[evidence/graph]")),
      [],
      "the packaged Evidence build must not hide a non-graph compiler failure",
    );
    assert.equal(
      fs.existsSync(
        path.join(cell.workspace, "packages", "api", "swagger.json"),
      ),
      true,
      "Nestia evidence smoke must generate the OpenAPI contract",
    );
    await EvidenceBenchmarkConsumerProof.verifyActiveGraph(
      cell,
      benchmarkVariables("nestia-evidence-smoke"),
    );
  }

  async function testBaseline(
    repository: string,
    temporary: string,
  ): Promise<void> {
    const baseline = await EvidenceBenchmarkBaseline.prepare({
      repository,
      output: path.join(temporary, "neutral-baseline"),
    });
    assert.equal(baseline.pnpmVersion, EvidenceBenchmarkProcess.PNPM_VERSION);
    assert.ok(baseline.elapsedMs > 0);
    assert.equal(
      Object.keys(baseline.steps).length,
      9,
      "neutral baseline must retain every admission step",
    );
    assert.ok(fs.existsSync(path.join(baseline.root, "baseline.json")));
    assert.equal(
      fs.existsSync(
        path.join(
          baseline.workspace,
          "node_modules",
          "@samchon",
          "lint-plugin-evidence",
        ),
      ),
      false,
      "neutral baseline must not receive the measured product",
    );
  }

  function createFixture(repository: string, fixture: string): void {
    const source: string = path.join(repository, "benchmark");
    const target: string = path.join(fixture, "benchmark");
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(path.join(source, "template"), path.join(target, "template"), {
      recursive: true,
    });
    fs.cpSync(
      path.join(source, "requirements"),
      path.join(target, "requirements"),
      { recursive: true },
    );
    const base: string = path.join(target, "template", "base");
    for (const skill of [
      "api",
      "backend",
      "frontend",
      "project",
      "requirements",
    ])
      writeIfMissing(
        path.join(base, ".agents", "skills", skill, "SKILL.md"),
        `---\nname: ${skill}\ndescription: Self-test ${skill} instructions.\n---\n# ${skill}\n\nFixture body.\n`,
      );
    for (const arm of ["evidence", "plain"]) {
      writeIfMissing(
        path.join(
          target,
          "template",
          arm,
          ".agents",
          "skills",
          "review",
          "SKILL.md",
        ),
        "---\nname: review\ndescription: Self-test review instructions.\n---\n# Review\n\nFixture body.\n",
      );
      addSpliceContracts(base, path.join(target, "template", arm));
    }
    writeIfMissing(
      path.join(base, "package.json"),
      `${JSON.stringify(
        {
          name: "self-test",
          private: true,
          devDependencies: {
            "@ttsc/lint": "0.22.0",
            ttsc: "0.22.0",
            typescript: "7.0.2",
          },
        },
        null,
        2,
      )}\n`,
    );
    for (const relative of [
      "config/package.json",
      "packages/api/package.json",
      "packages/backend/package.json",
      "packages/frontend/package.json",
    ])
      writeIfMissing(
        path.join(base, ...relative.split("/")),
        '{"name":"self-test","private":true}\n',
      );
    writeIfMissing(
      path.join(base, "config/tsconfig.json"),
      '{"compilerOptions":{"strict":true}}\n',
    );
    writeIfMissing(
      path.join(base, "pnpm-workspace.yaml"),
      "packages:\n  - packages/*\n",
    );
  }

  function addSpliceContracts(base: string, arm: string): void {
    for (const relative of EvidenceBenchmarkHash.directory(arm).keys()) {
      const baseLocation: string = path.join(base, ...relative.split("/"));
      const armLocation: string = path.join(arm, ...relative.split("/"));
      if (!fs.existsSync(baseLocation) || !relative.endsWith(".md")) continue;
      const source: string = fs.readFileSync(armLocation, "utf8");
      if (source.includes("benchmark-template-splice: base-body")) continue;
      if (source.includes("{{base}}"))
        fs.writeFileSync(
          armLocation,
          source.replace(
            "{{base}}",
            "<!-- benchmark-template-splice: base-body -->\n{{base}}",
          ),
          "utf8",
        );
      else
        fs.writeFileSync(
          armLocation,
          source.replace(
            /^(# [^\r\n]+\r?\n)/m,
            "$1\n<!-- benchmark-template-splice: base-body -->\n{{base}}\n",
          ),
          "utf8",
        );
    }
  }

  function writeIfMissing(location: string, content: string): void {
    if (fs.existsSync(location)) return;
    write(location, content);
  }

  function write(location: string, content: string): void {
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, content, "utf8");
  }

  function benchmarkVariables(
    name: string,
  ): IEvidenceBenchmarkMaterialization.IVariables {
    return {
      name,
      apiPackageName: `@${name}/api`,
      backendPackageName: `@${name}/backend`,
      frontendPackageName: `@${name}/frontend`,
    };
  }

  async function expectFailure(
    action: () => unknown | Promise<unknown>,
    fragment: string,
  ): Promise<void> {
    await assert.rejects(
      async () => action(),
      (error: unknown): boolean =>
        error instanceof Error && error.message.includes(fragment),
      `expected failure containing ${JSON.stringify(fragment)}`,
    );
  }
}
