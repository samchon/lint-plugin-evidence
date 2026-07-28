import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCodexLog } from "../codex/EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexCompletion } from "../codex/EvidenceBenchmarkCodexCompletion.ts";
import { EvidenceBenchmarkCodexProcess } from "../codex/EvidenceBenchmarkCodexProcess.ts";
import { EvidenceBenchmarkCodexProtocol } from "../codex/EvidenceBenchmarkCodexProtocol.ts";
import { EvidenceBenchmarkCodexUsageLedger } from "../codex/EvidenceBenchmarkCodexUsageLedger.ts";
import { EvidenceBenchmarkCodexValue } from "../codex/EvidenceBenchmarkCodexValue.ts";
import type { IEvidenceBenchmarkCodexRun } from "../structures/IEvidenceBenchmarkCodexRun.ts";

/**
 * Deterministic fake app-server tests for transport integrity, usage, races,
 * restart rejection, Goal ordering, and terminal turn distinctions.
 */
export namespace EvidenceBenchmarkCodexProcessTest {
  /**
   * Runs every fake-process self-test without invoking Codex or a paid model.
   *
   * 1. Exercise fragmented, duplicate, descendant, malformed, and truncated JSONL.
   * 2. Exercise steering rejection, fail-closed restart, and interruption.
   * 3. Verify every raw envelope against its exact stored byte range.
   */
  export async function main(): Promise<void> {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "evidence-codex-process-test-"),
    );
    try {
      await testFragmentedUsage(root);
      await testMalformedAndIncomplete(root);
      await testSteeringRace(root);
      await testRestartLosesExactUsage(root);
      await testGoalOrdering(root);
      await testInterruptedTurn(root);
      await testMissingExactUsage(root);
      await testFreshLogRecoveryAndCorruption(root);
      testCompletionSchema();
      console.log("EvidenceBenchmarkCodexProcessTest passed");
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  }

  async function testFragmentedUsage(root: string): Promise<void> {
    const directory = path.join(root, "fragmented");
    const log = new EvidenceBenchmarkCodexLog(directory, 0);
    await log.open();
    const usage = new EvidenceBenchmarkCodexUsageLedger();
    const notifications: string[] = [];
    let complete: (() => void) | undefined;
    const completed = new Promise<void>((resolve): void => {
      complete = resolve;
    });
    let activation:
      Promise<EvidenceBenchmarkCodexProtocol.IResponse> | undefined;
    let threadId = "";
    let server: EvidenceBenchmarkCodexProcess;
    server = createProcess(
      log,
      "fragmented,duplicate,triple-duplicate,descendant",
      usage,
      notifications,
      async (method, params): Promise<void> => {
        if (
          method === "turn/started" &&
          threadId !== "" &&
          activation === undefined
        )
          activation = server.request(
            "thread/goal/set",
            EvidenceBenchmarkCodexProtocol.goalSet(
              0,
              threadId,
              undefined,
              "active",
            ).params,
          );
        if (
          method === "thread/goal/updated" &&
          EvidenceBenchmarkCodexValue.isRecord(params.goal) &&
          params.goal.status === "complete"
        )
          complete?.();
      },
    );
    await server.start();
    await handshake(server);
    const started = await server.request(
      "thread/start",
      EvidenceBenchmarkCodexProtocol.threadStart(0, options(directory)).params,
    );
    const thread = EvidenceBenchmarkCodexProtocol.responseThread(started);
    threadId = EvidenceBenchmarkCodexValue.string(thread.id, "thread.id");
    await server.request(
      "thread/goal/set",
      EvidenceBenchmarkCodexProtocol.goalSet(0, threadId, "finish", "paused")
        .params,
    );
    const turn = await server.request(
      "turn/start",
      EvidenceBenchmarkCodexProtocol.turnStart(
        0,
        threadId,
        "build it",
        options(directory).manifest,
        options(directory).generationOutcomeSchema,
      ).params,
    );
    assert.ok(EvidenceBenchmarkCodexProtocol.responseTurnId(turn));
    await activation;
    await withTimeout(completed, 2_000, "fragmented completion");
    await server.stop();
    const report = usage.report();
    assert.equal(report.responses.length, 2, JSON.stringify(report.responses));
    assert.deepEqual(report.duplicateResponseIds, ["response-turn-1"]);
    assert.equal(report.exactTotal.totalTokens, 150);
    assert.equal(report.exactByThread["thread-child"]?.totalTokens, 50);
    assert.ok(notifications.includes("future/unknown"));
    assert.equal(report.reconciliation.length, 2);
    await verifyRawEnvelopes(directory);
  }

  function testCompletionSchema(): void {
    const schema = EvidenceBenchmarkCodexCompletion.providerSchema();
    EvidenceBenchmarkCodexCompletion.admitProviderSchema(schema);
    assert.deepEqual(
      EvidenceBenchmarkCodexCompletion.parse(
        JSON.stringify({
          outcome: "complete",
          summary: "verified",
          unfinished: [],
        }),
      ),
      {
        outcome: "complete",
        summary: "verified",
        unfinished: [],
      },
    );
    assert.throws(
      (): void =>
        EvidenceBenchmarkCodexCompletion.admitProviderSchema({
          ...schema,
          allOf: [],
        }),
      /provider-compatible subset/,
    );
    for (const invalid of [
      {
        outcome: "complete",
        summary: "claimed complete",
        unfinished: ["still missing"],
      },
      { outcome: "interrupted", summary: "stopped", unfinished: [] },
      {
        outcome: "interrupted",
        summary: "stopped",
        unfinished: ["same", "same"],
      },
      { outcome: "complete", summary: " ", unfinished: [] },
    ])
      assert.throws((): IEvidenceBenchmarkCodexRun.IGenerationOutcome =>
        EvidenceBenchmarkCodexCompletion.parse(JSON.stringify(invalid)),
      );
  }

  async function testMalformedAndIncomplete(root: string): Promise<void> {
    const directory = path.join(root, "incomplete");
    const log = new EvidenceBenchmarkCodexLog(directory, 0);
    await log.open();
    const usage = new EvidenceBenchmarkCodexUsageLedger();
    const anomalies: string[] = [];
    let complete: (() => void) | undefined;
    const completed = new Promise<void>((resolve): void => {
      complete = resolve;
    });
    const server = createProcess(
      log,
      "fragmented,malformed",
      usage,
      [],
      async (method): Promise<void> => {
        if (method === "thread/goal/updated") complete?.();
      },
      anomalies,
    );
    await server.start();
    await handshake(server);
    await server.request("turn/start", {
      threadId: "thread-primary",
      input: [{ type: "text", text: "test", text_elements: [] }],
    });
    await withTimeout(completed, 2_000, "malformed completion");
    await server.request("fake/incomplete", {});
    const exit = await withTimeout(server.wait(), 2_000, "incomplete exit");
    assert.equal(exit.code, 19);
    assert.ok(exit.incompleteServerBytes > 0);
    assert.ok(
      anomalies.some((message) => message.includes("malformed server JSON")),
    );
    assert.ok(
      anomalies.some((message) => message.includes("incomplete bytes")),
    );
    await verifyRawEnvelopes(directory);
  }

  async function testSteeringRace(root: string): Promise<void> {
    const directory = path.join(root, "steering");
    const log = new EvidenceBenchmarkCodexLog(directory, 0);
    await log.open();
    const server = createProcess(
      log,
      "fragmented,steering-race",
      new EvidenceBenchmarkCodexUsageLedger(),
      [],
      async (): Promise<void> => {},
    );
    await server.start();
    await handshake(server);
    const started = await server.request("turn/start", {
      threadId: "thread-primary",
      input: [{ type: "text", text: "first", text_elements: [] }],
    });
    const turnId = EvidenceBenchmarkCodexProtocol.responseTurnId(started);
    await assert.rejects(
      server.request(
        "turn/steer",
        EvidenceBenchmarkCodexProtocol.turnSteer(
          0,
          "thread-primary",
          turnId,
          "challenge",
        ).params,
      ),
      EvidenceBenchmarkCodexProcess.ResponseError,
    );
    const fallback = await server.request("turn/start", {
      threadId: "thread-primary",
      input: [{ type: "text", text: "challenge", text_elements: [] }],
    });
    assert.notEqual(
      EvidenceBenchmarkCodexProtocol.responseTurnId(fallback),
      turnId,
    );
    await server.stop();
  }

  async function testRestartLosesExactUsage(root: string): Promise<void> {
    const directory = path.join(root, "restart");
    const log = new EvidenceBenchmarkCodexLog(directory, 0);
    await log.open();
    const first = createProcess(
      log,
      "fragmented",
      new EvidenceBenchmarkCodexUsageLedger(),
      [],
      async (): Promise<void> => {},
    );
    await first.start();
    await handshake(first);
    await first.request(
      "thread/start",
      EvidenceBenchmarkCodexProtocol.threadStart(0, options(directory)).params,
    );
    await first.request("fake/restart", {});
    const exit = await withTimeout(first.wait(), 2_000, "restart exit");
    assert.equal(exit.code, 17);
    const priorSequence = log.lastEnvelopeSequence();
    await log.flush();
    const resumedLog = new EvidenceBenchmarkCodexLog(directory, priorSequence);
    await resumedLog.open();
    const resumedUsage = new EvidenceBenchmarkCodexUsageLedger();
    let completed: (() => void) | undefined;
    const turnCompleted = new Promise<void>((resolve): void => {
      completed = resolve;
    });
    const second = createProcess(
      resumedLog,
      "fragmented",
      resumedUsage,
      [],
      async (method): Promise<void> => {
        if (method === "turn/completed") completed?.();
      },
      [],
      first.lastRequestId(),
    );
    await second.start();
    await handshake(second);
    const resumed = await second.request("thread/resume", {
      threadId: "thread-primary",
    });
    assert.equal(
      EvidenceBenchmarkCodexProtocol.responseThread(resumed).id,
      "thread-primary",
    );
    await second.request(
      "turn/start",
      EvidenceBenchmarkCodexProtocol.turnStart(
        0,
        "thread-primary",
        "must not continue a measured attempt",
        options(directory).manifest,
        options(directory).generationOutcomeSchema,
      ).params,
    );
    await withTimeout(turnCompleted, 2_000, "resumed turn completion");
    resumedUsage.missingExactUsage(
      "Codex 0.145.0 thread/resume cannot re-enable experimental raw events",
    );
    await second.stop();
    assert.equal(resumedUsage.report().responses.length, 0);
    assert.equal(resumedUsage.report().exactUsageComplete, false);
    assert.ok(resumedLog.lastEnvelopeSequence() > priorSequence);
    await verifyRawEnvelopes(directory);
  }

  async function testGoalOrdering(root: string): Promise<void> {
    const unsafeDirectory = path.join(root, "goal-unsafe");
    const unsafeLog = new EvidenceBenchmarkCodexLog(unsafeDirectory, 0);
    await unsafeLog.open();
    let automaticTurn: (() => void) | undefined;
    const automaticTurnStarted = new Promise<void>((resolve): void => {
      automaticTurn = resolve;
    });
    const unsafe = createProcess(
      unsafeLog,
      "fragmented",
      new EvidenceBenchmarkCodexUsageLedger(),
      [],
      async (method): Promise<void> => {
        if (method === "turn/started") automaticTurn?.();
      },
    );
    await unsafe.start();
    await handshake(unsafe);
    await unsafe.request(
      "thread/start",
      EvidenceBenchmarkCodexProtocol.threadStart(0, options(unsafeDirectory))
        .params,
    );
    await unsafe.request(
      "thread/goal/set",
      EvidenceBenchmarkCodexProtocol.goalSet(
        0,
        "thread-primary",
        "finish",
        "active",
      ).params,
    );
    await withTimeout(
      automaticTurnStarted,
      2_000,
      "active Goal automatic turn",
    );
    await unsafe.stop();

    const safeDirectory = path.join(root, "goal-safe");
    const safeLog = new EvidenceBenchmarkCodexLog(safeDirectory, 0);
    await safeLog.open();
    const methods: string[] = [];
    const safe = createProcess(
      safeLog,
      "fragmented",
      new EvidenceBenchmarkCodexUsageLedger(),
      methods,
      async (): Promise<void> => {},
    );
    await safe.start();
    await handshake(safe);
    await safe.request(
      "thread/start",
      EvidenceBenchmarkCodexProtocol.threadStart(0, options(safeDirectory))
        .params,
    );
    await safe.request(
      "thread/goal/set",
      EvidenceBenchmarkCodexProtocol.goalSet(
        0,
        "thread-primary",
        "finish",
        "paused",
      ).params,
    );
    const firstTurn = await safe.request(
      "turn/start",
      EvidenceBenchmarkCodexProtocol.turnStart(
        0,
        "thread-primary",
        "first user utterance",
        options(safeDirectory).manifest,
        options(safeDirectory).generationOutcomeSchema,
      ).params,
    );
    assert.equal(
      EvidenceBenchmarkCodexProtocol.responseTurnId(firstTurn),
      "turn-1",
    );
    const activation = await safe.request(
      "thread/goal/set",
      EvidenceBenchmarkCodexProtocol.goalSet(
        0,
        "thread-primary",
        undefined,
        "active",
      ).params,
    );
    assert.equal(
      EvidenceBenchmarkCodexValue.isRecord(activation.result) &&
        EvidenceBenchmarkCodexValue.isRecord(activation.result.goal)
        ? activation.result.goal.objective
        : undefined,
      "finish",
    );
    await safe.stop();
  }

  async function testInterruptedTurn(root: string): Promise<void> {
    const directory = path.join(root, "interrupted");
    const log = new EvidenceBenchmarkCodexLog(directory, 0);
    await log.open();
    let observed: string | undefined;
    let complete: (() => void) | undefined;
    const completed = new Promise<void>((resolve): void => {
      complete = resolve;
    });
    const server = createProcess(
      log,
      "fragmented,interrupted",
      new EvidenceBenchmarkCodexUsageLedger(),
      [],
      async (method, params): Promise<void> => {
        if (
          method === "turn/completed" &&
          EvidenceBenchmarkCodexValue.isRecord(params.turn)
        ) {
          observed = EvidenceBenchmarkCodexValue.string(
            params.turn.status,
            "turn.status",
          );
          complete?.();
        }
      },
    );
    await server.start();
    await handshake(server);
    await server.request("turn/start", {
      threadId: "thread-primary",
      input: [{ type: "text", text: "interrupt", text_elements: [] }],
    });
    await withTimeout(completed, 2_000, "interrupted completion");
    assert.equal(observed, "interrupted");
    await server.stop();
  }

  async function testMissingExactUsage(root: string): Promise<void> {
    const directory = path.join(root, "null-usage");
    const log = new EvidenceBenchmarkCodexLog(directory, 0);
    await log.open();
    const usage = new EvidenceBenchmarkCodexUsageLedger();
    let complete: (() => void) | undefined;
    const completed = new Promise<void>((resolve): void => {
      complete = resolve;
    });
    const server = createProcess(
      log,
      "fragmented,null-usage",
      usage,
      [],
      async (method): Promise<void> => {
        if (method === "turn/completed") complete?.();
      },
    );
    await server.start();
    await handshake(server);
    await assert.rejects(
      server.request("thread/start", {
        cwd: process.cwd(),
        model: "gpt-5.6-terra",
      }),
      EvidenceBenchmarkCodexProcess.ResponseError,
    );
    await server.request(
      "thread/start",
      EvidenceBenchmarkCodexProtocol.threadStart(0, options(directory)).params,
    );
    await server.request("turn/start", {
      threadId: "thread-primary",
      input: [{ type: "text", text: "test", text_elements: [] }],
    });
    await withTimeout(completed, 2_000, "null usage completion");
    await server.stop();
    assert.equal(usage.report().exactUsageComplete, false);
    assert.ok(
      usage
        .report()
        .anomalies.some((message) => message.includes("no exact usage")),
    );
  }

  async function testFreshLogRecoveryAndCorruption(
    root: string,
  ): Promise<void> {
    const source = path.join(root, "recovery-source");
    const log = new EvidenceBenchmarkCodexLog(source, 0, "recovery-source");
    await log.open();
    const envelope = await log.recordRaw("server", Buffer.from("one\n"));
    await log.recordEvent(
      "fixture",
      { retained: true },
      {
        rawRef: {
          direction: "server",
          path: envelope.rawFile,
          byteOffset: envelope.byteOffset,
          byteLength: envelope.byteLength,
          sha256: envelope.sha256,
        },
      },
    );
    await log.flush();
    const logs = path.join(source, "logs");
    await fs.promises.appendFile(path.join(logs, "server.raw.jsonl"), "orphan");
    const reopened = new EvidenceBenchmarkCodexLog(
      source,
      log.lastEnvelopeSequence(),
      "recovery-source",
    );
    await reopened.open();
    assert.equal(
      (await fs.promises.stat(path.join(logs, "server.raw.jsonl"))).size,
      envelope.byteLength,
    );
    const orphans = await reopened.orphanSegments();
    assert.equal(orphans.length, 1);
    const orphanBytes = await fs.promises.readFile(
      path.join(source, "logs", ...orphans[0]!.preservedPath.split("/")),
    );
    assert.equal(orphanBytes.toString("utf8"), "orphan");
    assert.equal(
      EvidenceBenchmarkCodexValue.sha256(orphanBytes),
      orphans[0]!.sha256,
    );
    await reopened.flush();

    const rawTamper = path.join(root, "raw-tamper");
    await fs.promises.cp(source, rawTamper, { recursive: true });
    const rawHandle = await fs.promises.open(
      path.join(rawTamper, "logs", "server.raw.jsonl"),
      "r+",
    );
    try {
      await rawHandle.write(Buffer.from("X"), 0, 1, 0);
    } finally {
      await rawHandle.close();
    }
    await assert.rejects(
      new EvidenceBenchmarkCodexLog(rawTamper, 1, "recovery-source").open(),
      /raw bytes do not match/,
    );

    const envelopeTail = path.join(root, "envelope-tail");
    await fs.promises.cp(source, envelopeTail, { recursive: true });
    await fs.promises.appendFile(
      path.join(envelopeTail, "logs", "transport.envelopes.jsonl"),
      '{"sequence":',
    );
    await assert.rejects(
      new EvidenceBenchmarkCodexLog(envelopeTail, 1, "recovery-source").open(),
      /incomplete tail/,
    );

    const eventTail = path.join(root, "event-tail");
    await fs.promises.cp(source, eventTail, { recursive: true });
    await fs.promises.appendFile(
      path.join(eventTail, "logs", "runner.events.jsonl"),
      '{"seq":',
    );
    await assert.rejects(
      new EvidenceBenchmarkCodexLog(eventTail, 1, "recovery-source").open(),
      /incomplete trailing line/,
    );
  }

  function createProcess(
    log: EvidenceBenchmarkCodexLog,
    scenario: string,
    usage: EvidenceBenchmarkCodexUsageLedger,
    notifications: string[],
    observer: (
      method: string,
      params: Readonly<Record<string, unknown>>,
    ) => Promise<void>,
    anomalies: string[] = [],
    recoveredRequestId: number = 0,
  ): EvidenceBenchmarkCodexProcess {
    return new EvidenceBenchmarkCodexProcess(
      {
        command: process.execPath,
        arguments: [fixturePath()],
        cwd: process.cwd(),
        environment: {
          EVIDENCE_FAKE_SCENARIO: scenario,
        },
        requestTimeoutMs: 2_000,
        shutdownGraceMs: 500,
        log,
        onFrame: async (): Promise<void> => {},
        onNotification: async (notification): Promise<void> => {
          notifications.push(notification.method);
          usage.ingest(
            notification.method,
            notification.params,
            new Date().toISOString(),
          );
          await observer(notification.method, notification.params);
        },
        onProtocolAnomaly: async (message): Promise<void> => {
          anomalies.push(message);
          usage.anomaly(message);
        },
      },
      recoveredRequestId,
    );
  }

  async function handshake(
    server: EvidenceBenchmarkCodexProcess,
  ): Promise<void> {
    const initialize = EvidenceBenchmarkCodexProtocol.initialize(0);
    await server.request(initialize.method, initialize.params);
    const initialized = EvidenceBenchmarkCodexProtocol.initialized();
    await server.notify(initialized.method, initialized.params);
  }

  function options(
    directory: string,
  ): import("../structures/IEvidenceBenchmarkCodexRun.ts").IEvidenceBenchmarkCodexRun.IOptions {
    const textHash = EvidenceBenchmarkCodexValue.sha256("test");
    const generationOutcomeSchema =
      EvidenceBenchmarkCodexCompletion.providerSchema();
    return {
      workspace: process.cwd(),
      outputDirectory: directory,
      prompt: "build it",
      goal: "finish",
      completionChallenge: "verify it",
      recoveryPrompt: "continue",
      manifest: {
        schemaVersion: 1,
        experiment: {
          runId: "fake-run",
          subject: "todo",
          arm: "evidence",
          replicate: 1,
          blockId: "fake-block",
          blockPlanSha256: textHash,
          sourceRevision: "f".repeat(40),
          templateSha256: textHash,
          requirementsSha256: textHash,
          acceptanceCatalogSha256: textHash,
          acceptanceCatalogCount: 1,
          contextCatalogSha256: null,
          contextCatalogCount: 0,
          denominatorsSummed: false,
          projectInputSha256: textHash,
          productTgzSha256: textHash,
          environmentSha256: textHash,
          concurrency: 1,
          costAuthorization: {
            id: "fake-no-spend",
            approvedAtUtc: "2026-07-29T00:00:00.000Z",
            maximumObservedTotalTokens: 1,
            maximumObservedBlockTotalTokens: 4,
            hardWallDurationSeconds: 60,
            blockHardWallDurationSeconds: 120,
            hardCeilingGuaranteed: false,
            monetaryStatus: "unavailable",
          },
        },
        runner: {
          codexCliVersion: "0.145.0",
          codexExecutableSha256: "0".repeat(64),
          codexSchemaSha256: "1".repeat(64),
          codexSchemaPreservationMode: "tracked-extracted-tree",
          codexSchemaOwnedPath:
            "benchmark/protocol/vendor/codex/0.145.0/app-server-schema-experimental",
          codexSchemaFileCount: 347,
          codexSchemaByteLength: 3_303_877,
          codexSchemaArchiveSha256: null,
          codexSchemaArchiveByteLength: 0,
          codexSchemaTreeAlgorithm: "sha256(sorted-posix-path-nul-bytes-nul)",
          codexSourceCommit: "25af12f7e61572b0bc18ddb1008be543b91519b0",
          model: "gpt-5.6-terra",
          modelProvider: "openai",
          effort: "high",
          serviceTier: "default",
          allowProviderModelFallback: false,
          initialGoalStatus: "paused",
          goalActivationPolicy:
            "paused-before-first-turn-active-after-turn-started",
          firstPromptSelfContained: true,
          promptSha256: EvidenceBenchmarkCodexValue.sha256("build it"),
          goalSha256: EvidenceBenchmarkCodexValue.sha256("finish"),
          completionChallengeSha256:
            EvidenceBenchmarkCodexValue.sha256("verify it"),
          recoveryPromptSha256: EvidenceBenchmarkCodexValue.sha256("continue"),
          phase2PromptSha256: {
            finder: textHash,
            verifier: textHash,
            fixer: textHash,
          },
          phase2SchemaSha256: {
            finding: { provider: textHash, local: textHash },
            verification: { provider: textHash, local: textHash },
          },
          generationOutcomeSchemaSha256: EvidenceBenchmarkCodexValue.sha256(
            EvidenceBenchmarkCodexValue.canonicalJson(generationOutcomeSchema),
          ),
          generationOutcomeLocalValidationSha256:
            EvidenceBenchmarkCodexCompletion.localValidationSha256(),
          priceSheetSha256: textHash,
        },
        createdAtUtc: "2026-07-29T00:00:00.000Z",
      },
      appServer: {
        command: process.execPath,
        arguments: [fixturePath()],
        shutdownGraceMs: 500,
      },
      codexSchemaDirectory: path.join(directory, "schema"),
      frozenArtifacts: {
        templateManifestPath: path.join(directory, "template.json"),
        requirementsManifestPath: path.join(directory, "requirements.json"),
        acceptanceCatalogPath: path.join(directory, "acceptance.json"),
        contextCatalogPath: null,
        projectInputManifestPath: path.join(directory, "project-input.json"),
        productTgzPath: path.join(directory, "product.tgz"),
        environmentManifestPath: path.join(directory, "environment.json"),
        phase2PromptPaths: {
          finder: path.join(directory, "finder.txt"),
          verifier: path.join(directory, "verifier.txt"),
          fixer: path.join(directory, "fixer.txt"),
        },
        priceSheetPath: path.join(directory, "prices.json"),
      },
      generationOutcomeSchema,
      gates: [],
      timeoutMs: 10_000,
      maximumRestarts: 0,
      maximumGateRepairs: 0,
      requestTimeoutMs: 2_000,
      heartbeatIntervalMs: 100,
      dryIntervalMs: 10,
      canonicalResultDirectory: path.join(directory, "canonical"),
    };
  }

  function fixturePath(): string {
    return path.resolve(
      import.meta.dirname,
      "..",
      "..",
      "fixtures",
      "fake-codex-app-server.mjs",
    );
  }

  async function verifyRawEnvelopes(directory: string): Promise<void> {
    const logs = path.join(directory, "logs");
    const lines = (
      await fs.promises.readFile(
        path.join(logs, "transport.envelopes.jsonl"),
        "utf8",
      )
    )
      .trim()
      .split("\n")
      .map(
        (
          line,
        ): import("../structures/IEvidenceBenchmarkCodexRecord.ts").IEvidenceBenchmarkCodexRecord.IEnvelope =>
          JSON.parse(line),
      );
    assert.ok(lines.length > 0);
    assert.deepEqual(
      lines.map((entry) => entry.sequence),
      Array.from({ length: lines.length }, (_, index) => index + 1),
    );
    for (const envelope of lines) {
      const raw = await fs.promises.readFile(path.join(logs, envelope.rawFile));
      const chunk = raw.subarray(
        envelope.byteOffset,
        envelope.byteOffset + envelope.byteLength,
      );
      assert.equal(chunk.length, envelope.byteLength);
      assert.equal(EvidenceBenchmarkCodexValue.sha256(chunk), envelope.sha256);
    }
    const events = (
      await fs.promises.readFile(path.join(logs, "runner.events.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map(
        (
          line,
        ): import("../structures/IEvidenceBenchmarkCodexRecord.ts").IEvidenceBenchmarkCodexRecord.IRunnerEvent =>
          JSON.parse(line),
      );
    let previous = "0".repeat(64);
    for (const [index, event] of events.entries()) {
      assert.equal(event.seq, index + 1);
      assert.equal(event.previousEventSha256, previous);
      const { eventSha256, ...unsigned } = event;
      assert.equal(
        EvidenceBenchmarkCodexValue.sha256(
          EvidenceBenchmarkCodexValue.canonicalJson(unsigned),
        ),
        eventSha256,
      );
      previous = eventSha256;
      if (event.rawRef === null) continue;
      const raw = await fs.promises.readFile(
        path.join(logs, event.rawRef.path),
      );
      const chunk = raw.subarray(
        event.rawRef.byteOffset,
        event.rawRef.byteOffset + event.rawRef.byteLength,
      );
      assert.equal(
        EvidenceBenchmarkCodexValue.sha256(chunk),
        event.rawRef.sha256,
      );
    }
  }

  async function withTimeout<T>(
    promise: Promise<T>,
    milliseconds: number,
    label: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_resolve, reject): void => {
        const timer = setTimeout(
          (): void => reject(new Error(`${label} exceeded ${milliseconds}ms`)),
          milliseconds,
        );
        timer.unref();
      }),
    ]);
  }
}
