import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkCodexLog } from "../codex/EvidenceBenchmarkCodexLog.ts";
import { EvidenceBenchmarkCodexProcess } from "../codex/EvidenceBenchmarkCodexProcess.ts";
import { EvidenceBenchmarkCodexProtocol } from "../codex/EvidenceBenchmarkCodexProtocol.ts";
import { EvidenceBenchmarkCodexUsageLedger } from "../codex/EvidenceBenchmarkCodexUsageLedger.ts";
import { EvidenceBenchmarkCodexValue } from "../codex/EvidenceBenchmarkCodexValue.ts";

/**
 * Deterministic fake app-server tests for transport integrity, usage, races,
 * restart, and terminal turn distinctions.
 */
export namespace EvidenceBenchmarkCodexProcessTest {
  /**
   * Runs every fake-process self-test without invoking Codex or a paid model.
   *
   * 1. Exercise fragmented, duplicate, descendant, malformed, and truncated JSONL.
   * 2. Exercise steering rejection, restart append continuity, and interruption.
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
      await testRestartContinuity(root);
      await testInterruptedTurn(root);
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
    const server = createProcess(
      log,
      "fragmented,duplicate,descendant",
      usage,
      notifications,
      async (method): Promise<void> => {
        if (method === "thread/goal/updated") complete?.();
      },
    );
    await server.start();
    await handshake(server);
    const started = await server.request(
      "thread/start",
      EvidenceBenchmarkCodexProtocol.threadStart(0, options(directory)).params,
    );
    const thread = EvidenceBenchmarkCodexProtocol.responseThread(started);
    const threadId = EvidenceBenchmarkCodexValue.string(thread.id, "thread.id");
    await server.request(
      "thread/goal/set",
      EvidenceBenchmarkCodexProtocol.goalSet(0, threadId, "finish").params,
    );
    await server.request(
      "turn/start",
      EvidenceBenchmarkCodexProtocol.turnStart(
        0,
        threadId,
        "build it",
        options(directory).manifest,
      ).params,
    );
    await withTimeout(completed, 2_000, "fragmented completion");
    await server.stop();
    const report = usage.report();
    assert.equal(report.responses.length, 2);
    assert.deepEqual(report.duplicateResponseIds, ["response-turn-1"]);
    assert.equal(report.exactTotal.totalTokens, 150);
    assert.equal(report.exactByThread["thread-child"]?.totalTokens, 50);
    assert.ok(notifications.includes("future/unknown"));
    assert.equal(report.reconciliation.length, 2);
    await verifyRawEnvelopes(directory);
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

  async function testRestartContinuity(root: string): Promise<void> {
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
    await first.request("thread/start", {});
    await first.request("fake/restart", {});
    const exit = await withTimeout(first.wait(), 2_000, "restart exit");
    assert.equal(exit.code, 17);
    const priorSequence = log.lastEnvelopeSequence();
    const second = createProcess(
      log,
      "fragmented",
      new EvidenceBenchmarkCodexUsageLedger(),
      [],
      async (): Promise<void> => {},
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
    await second.stop();
    assert.ok(log.lastEnvelopeSequence() > priorSequence);
    await verifyRawEnvelopes(directory);
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
          sourceRevision: "f".repeat(40),
          templateSha256: textHash,
          requirementsSha256: textHash,
          projectInputSha256: textHash,
          productTgzSha256: textHash,
          environmentSha256: textHash,
          concurrency: 1,
          costAuthorization: {
            id: "fake-no-spend",
            approvedAtUtc: "2026-07-29T00:00:00.000Z",
            maximumCost: 0,
            currency: "USD",
          },
        },
        runner: {
          codexCliVersion: "0.145.0",
          codexExecutableSha256: "0".repeat(64),
          codexSchemaSha256: "1".repeat(64),
          codexSourceCommit: "25af12f7e61572b0bc18ddb1008be543b91519b0",
          model: "gpt-5.6-terra",
          effort: "medium",
          initialGoalStatus: "active",
          promptSha256: EvidenceBenchmarkCodexValue.sha256("build it"),
          goalSha256: EvidenceBenchmarkCodexValue.sha256("finish"),
          completionChallengeSha256:
            EvidenceBenchmarkCodexValue.sha256("verify it"),
          recoveryPromptSha256: EvidenceBenchmarkCodexValue.sha256("continue"),
          priceSheetSha256: textHash,
        },
        createdAtUtc: "2026-07-29T00:00:00.000Z",
      },
      appServer: {
        command: process.execPath,
        arguments: [fixturePath()],
        shutdownGraceMs: 500,
      },
      gates: [],
      timeoutMs: 10_000,
      maximumRestarts: 1,
      maximumGateRepairs: 0,
      requestTimeoutMs: 2_000,
      heartbeatIntervalMs: 100,
      dryIntervalMs: 10,
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
        path.join(logs, event.rawRef.rawFile),
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
