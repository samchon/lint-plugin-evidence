import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkJson } from "../EvidenceBenchmarkJson.ts";
import { EvidenceBenchmarkOperationCommandLine } from "../EvidenceBenchmarkOperationCommandLine.ts";
import { EvidenceBenchmarkOperationBlock } from "../EvidenceBenchmarkOperationBlock.ts";
import { EvidenceBenchmarkOperationFacade } from "../EvidenceBenchmarkOperationFacade.ts";
import { EvidenceBenchmarkOperationLock } from "../EvidenceBenchmarkOperationLock.ts";
import { EvidenceBenchmarkOperationPlan } from "../EvidenceBenchmarkOperationPlan.ts";
import { EvidenceBenchmarkOperationStore } from "../EvidenceBenchmarkOperationStore.ts";
import { EvidenceBenchmarkOperationSource } from "../EvidenceBenchmarkOperationSource.ts";
import { EvidenceBenchmarkPath } from "../EvidenceBenchmarkPath.ts";
import { EvidenceBenchmarkProcess } from "../EvidenceBenchmarkProcess.ts";
import { EvidenceBenchmarkProtocolAdmission } from "../EvidenceBenchmarkProtocolAdmission.ts";
import type { IEvidenceBenchmarkMaterialization } from "../structures/IEvidenceBenchmarkMaterialization.ts";
import type { IEvidenceBenchmarkOperation } from "../structures/IEvidenceBenchmarkOperation.ts";
import type { IEvidenceBenchmarkOperationAdapter } from "../structures/IEvidenceBenchmarkOperationAdapter.ts";
import type { IEvidenceBenchmarkOperationPreparer } from "../structures/IEvidenceBenchmarkOperationPreparer.ts";

/** Runs the free fake-server vertical and orchestration integrity fixtures. */
export namespace EvidenceBenchmarkOperationTest {
  /** Executes every operations CLI fixture without importing or calling Codex. */
  export async function main(): Promise<void> {
    const root: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-benchmark-operation-"),
    );
    try {
      await blockFailureIsolation(root);
      await blockSafetyOvershoot(root);
      await durableObservationRetention(root);
      await hungObservationDeadline(root);
      await monitorPersistenceFailure(root);
      strictJsonDuplicateKeys();
      canonicalRelativePaths();
      protocolStrictScan(root);
      await cooperativeAbort(root);
      await abortPollIntegrityFailure(root);
      await staleResume(root);
      await crashReconciliation(root);
      await planAndLedgerNegatives(root);
      await laterWave(root);
      await missingProductionFacadeBlocks();
      await cleanStatusSmudgeIsSealed(root);
      process.stdout.write(
        "Benchmark operations fake vertical and integrity fixtures passed.\n",
      );
    } finally {
      const resolved: string = path.resolve(root);
      const temporary: string = path.resolve(os.tmpdir());
      if (
        !resolved.startsWith(`${temporary}${path.sep}`) ||
        !path.basename(resolved).startsWith("evidence-benchmark-operation-")
      )
        throw new Error(
          `Refusing to remove an unowned test root: ${resolved}.`,
        );
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }

  async function blockFailureIsolation(repository: string): Promise<void> {
    const adapter = new FakeAdapter({ barrier: true });
    const command = commandLine(repository, adapter);
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "todo-reddit-r1.json",
    );
    await command.main([
      "prepare",
      "--plan",
      planPath,
      "--seed",
      "11".repeat(32),
      "--authorization",
      writeSafetyAuthorization(repository, ["todo", "reddit"]),
    ]);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.read(planPath);
    adapter.failRunId = plan.launchOrder[1]!;
    await command.main(["start", "--plan", planPath]);
    const statuses: IEvidenceBenchmarkOperation.Status[] = plan.cells.map(
      (cell) => EvidenceBenchmarkOperationStore.readState(cell).status,
    );
    assert(
      statuses.filter((status) => status === "completed").length === 3 &&
        statuses.filter((status) => status === "failed").length === 1,
      "one fake cell failure must not cancel three completed siblings",
    );
    assert(
      JSON.stringify(adapter.startOrder) === JSON.stringify(plan.launchOrder),
      "runner initiation must follow the recorded randomized order",
    );
    assert(
      adapter.maximumConcurrency === 4,
      "the paired block must admit four concurrent cells",
    );
    await command.main(["report", "--block", plan.blockId]);
    await command.main(["grade", "--run", plan.cells[0]!.runId]);
  }

  async function cooperativeAbort(repository: string): Promise<void> {
    const adapter = new FakeAdapter({ barrier: false });
    const command = commandLine(repository, adapter);
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "abort-r1.json",
    );
    await command.main([
      "prepare",
      "--plan",
      planPath,
      "--block",
      "abort-r1",
      "--seed",
      "22".repeat(32),
      "--authorization",
      writeSafetyAuthorization(repository, ["todo", "reddit"]),
    ]);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.read(planPath);
    adapter.holdRunId = plan.launchOrder[0]!;
    const starting: Promise<void> = command.main(["start", "--plan", planPath]);
    await waitUntil(() => adapter.startOrder.includes(adapter.holdRunId!));
    await command.main([
      "abort",
      "--run",
      adapter.holdRunId,
      "--reason",
      "fixture operator abort",
    ]);
    await starting;
    const held: IEvidenceBenchmarkOperation.ICell = plan.cells.find(
      (cell) => cell.runId === adapter.holdRunId,
    )!;
    assert(
      EvidenceBenchmarkOperationStore.readState(held).status ===
        "interrupted" &&
        adapter.abortCalls.length === 1 &&
        adapter.abortCalls[0] === held.runId,
      "abort must cooperatively interrupt only its addressed run",
    );
    assert(
      plan.cells
        .filter((cell) => cell.runId !== held.runId)
        .every(
          (cell) =>
            EvidenceBenchmarkOperationStore.readState(cell).status ===
            "completed",
        ),
      "one-cell abort must not cancel sibling cells",
    );
  }

  async function blockSafetyOvershoot(repository: string): Promise<void> {
    const adapter = new FakeAdapter({ barrier: true });
    adapter.holdAll = true;
    adapter.observationTokens = 900;
    const command = commandLine(repository, adapter);
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "block-safety-r1.json",
    );
    await command.main([
      "prepare",
      "--plan",
      planPath,
      "--block",
      "block-safety-r1",
      "--seed",
      "77".repeat(32),
      "--authorization",
      writeSafetyAuthorization(repository, ["todo", "reddit"]),
    ]);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.read(planPath);
    await command.main(["start", "--plan", planPath]);
    const stop: IEvidenceBenchmarkOperation.IBlockStop | null =
      EvidenceBenchmarkOperationBlock.readStop(plan);
    assert(
      stop !== null &&
        stop.boundary === "maximum_observed_block_total_tokens" &&
        stop.observedBlockTotalTokens === 3_600 &&
        stop.hardCeilingGuaranteed === false,
      "concurrent response overshoot must be durably recorded as a non-hard block stop",
    );
    assert(
      plan.cells.every((cell) => {
        const terminal: IEvidenceBenchmarkOperation.ITerminal | null =
          EvidenceBenchmarkOperationStore.readTerminal(cell);
        return (
          terminal?.status === "interrupted" &&
          terminal.subtype === "safety_limit" &&
          terminal.blockStopSha256 === stop.blockStopSha256
        );
      }) && adapter.abortCalls.length === 4,
      "one shared stop digest must safety-interrupt all four live cells",
    );
    const samples: IEvidenceBenchmarkOperation.IBlockSample[] =
      EvidenceBenchmarkOperationBlock.readSamples(plan);
    assert(
      samples.length >= 1 &&
        samples[0]!.host.platform === "fixture" &&
        samples[0]!.samplerElapsedMs >= 0,
      "the fake sampler must produce separate low-overhead diagnostics",
    );
  }

  async function durableObservationRetention(
    repository: string,
  ): Promise<void> {
    const adapter = new FakeAdapter({ barrier: false });
    const command = commandLine(repository, adapter);
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "durable-observations-r1.json",
    );
    await command.main([
      "prepare",
      "--plan",
      planPath,
      "--block",
      "durable-observations-r1",
      "--seed",
      "99".repeat(32),
      "--authorization",
      writeSafetyAuthorization(repository, ["todo", "reddit"]),
    ]);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.read(planPath);
    EvidenceBenchmarkOperationBlock.launch(
      plan,
      new Date(),
      process.hrtime.bigint(),
    );
    adapter.observationTokens = 600;
    const firstObservation = await adapter.observe(plan.cells[0]!);
    const first = EvidenceBenchmarkOperationBlock.sample(plan, {
      atUtc: new Date(),
      monotonicNs: process.hrtime.bigint(),
      samplerElapsedMs: 0,
      host: fixtureHost(),
      observations: [firstObservation],
    });
    adapter.observationTokens = 700;
    const secondObservation = await adapter.observe(plan.cells[1]!);
    const second = EvidenceBenchmarkOperationBlock.sample(plan, {
      atUtc: new Date(),
      monotonicNs: process.hrtime.bigint(),
      samplerElapsedMs: 0,
      host: fixtureHost(),
      observations: [secondObservation],
    });
    assert(
      first.observedBlockTotalTokens === 600 &&
        second.observedBlockTotalTokens === 1_300 &&
        second.observations.length === 2,
      "a completed or temporarily missing cell must remain in the durable latest-by-cell aggregate",
    );
    expectFailure(
      () =>
        EvidenceBenchmarkOperationBlock.sample(plan, {
          atUtc: new Date(),
          monotonicNs: process.hrtime.bigint(),
          samplerElapsedMs: 0,
          host: fixtureHost(),
          observations: [
            {
              ...firstObservation,
              observedTotalTokens: 0,
              responses: [],
            },
          ],
        }),
      "a reappearing cell must not regress or delete a durable response",
    );
  }

  async function hungObservationDeadline(repository: string): Promise<void> {
    const adapter = new FakeAdapter({ barrier: true });
    adapter.holdAll = true;
    adapter.observeHang = true;
    const command = commandLine(repository, adapter);
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "hung-observation-r1.json",
    );
    await command.main([
      "prepare",
      "--plan",
      planPath,
      "--block",
      "hung-observation-r1",
      "--seed",
      "aa".repeat(32),
      "--authorization",
      writeSafetyAuthorization(
        repository,
        ["todo", "reddit"],
        "hung-observation",
        200,
      ),
    ]);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.read(planPath);
    await command.main(["start", "--plan", planPath]);
    const stop: IEvidenceBenchmarkOperation.IBlockStop | null =
      EvidenceBenchmarkOperationBlock.readStop(plan);
    assert(
      stop?.boundary === "hard_deadline" &&
        stop.usageLowerBound === true &&
        stop.missingObservationRunIds.length === 4 &&
        adapter.abortCalls.length === 4,
      "an independent monotonic wall guard must stop all four cells even when every observation hangs",
    );
  }

  async function monitorPersistenceFailure(repository: string): Promise<void> {
    const adapter = new FakeAdapter({ barrier: true });
    adapter.holdAll = true;
    const command = commandLine(repository, adapter);
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "monitor-persistence-r1.json",
    );
    await command.main([
      "prepare",
      "--plan",
      planPath,
      "--block",
      "monitor-persistence-r1",
      "--seed",
      "bb".repeat(32),
      "--authorization",
      writeSafetyAuthorization(repository, ["todo", "reddit"]),
    ]);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.read(planPath);
    fs.mkdirSync(
      path.join(
        EvidenceBenchmarkOperationBlock.directory(plan),
        "block-stop.json",
      ),
      { recursive: true },
    );
    let failed: boolean = false;
    try {
      await command.main(["start", "--plan", planPath]);
    } catch (error) {
      failed =
        error instanceof Error &&
        error.message.includes("safety controller failed");
    }
    assert(
      failed &&
        adapter.abortCalls.length === 4 &&
        plan.cells.every((cell) => {
          const terminal: IEvidenceBenchmarkOperation.ITerminal | null =
            EvidenceBenchmarkOperationStore.readTerminal(cell);
          return (
            terminal?.status === "failed" &&
            terminal.subtype === "integrity_failure"
          );
        }),
      "a monitor persistence failure must immediately quiesce and integrity-seal every live cell",
    );
  }

  function strictJsonDuplicateKeys(): void {
    const parsed = EvidenceBenchmarkJson.parse(
      '{"outer":{"key":1},"array":[true,false,null,-1.25e2]}',
      "valid strict fixture",
    ) as Record<string, unknown>;
    assert(
      Array.isArray(parsed.array),
      "strict JSON must retain valid nested arrays and numbers",
    );
    expectFailure(
      () =>
        EvidenceBenchmarkJson.parse(
          '{"outer":{"key":1,"\\u006bey":2}}',
          "nested duplicate fixture",
        ),
      "strict JSON must reject escaped nested duplicate keys before schema validation",
    );
    const prototype = EvidenceBenchmarkJson.parse(
      '{"__proto__":{"polluted":true}}',
      "prototype fixture",
    ) as Record<string, unknown>;
    assert(
      Object.hasOwn(prototype, "__proto__") &&
        !Object.hasOwn(Object.prototype, "polluted"),
      "strict JSON must preserve __proto__ as inert data without prototype pollution",
    );
    for (const malformed of [
      '{"value":1} trailing',
      '{"value":}',
      "[1,]",
      '"unterminated',
    ])
      expectFailure(
        () => EvidenceBenchmarkJson.parse(malformed, "malformed fixture"),
        `strict JSON must reject malformed input ${JSON.stringify(malformed)}`,
      );
    const duplicateJsonLine =
      '{"acceptanceId":"REQ-1","rating":1,"\\u0072ating":2}';
    expectFailure(
      () =>
        EvidenceBenchmarkJson.parse(
          duplicateJsonLine,
          "acceptance-criteria.jsonl line 1",
        ),
      "strict JSONL admission must reject duplicate authored criterion fields",
    );
  }

  function canonicalRelativePaths(): void {
    assert(
      EvidenceBenchmarkPath.relative(
        "benchmark/.work/block/source",
        "valid fixture",
      ) === "benchmark/.work/block/source",
      "canonical repository-relative paths must retain exact POSIX spelling",
    );
    for (const invalid of [
      ".",
      "..",
      "./a",
      "a/./b",
      "a/../b",
      "a//b",
      "a/",
      "/a",
      "C:/a",
      "a\\b",
      "decomposed-e\u0301.txt",
    ])
      expectFailure(
        () => EvidenceBenchmarkPath.relative(invalid, "invalid fixture"),
        `canonical path admission must reject ${JSON.stringify(invalid)}`,
      );
  }

  function protocolStrictScan(repository: string): void {
    const fixture: string = path.join(repository, "protocol-scan-fixture");
    const protocol: string = path.join(fixture, "benchmark", "protocol");
    fs.mkdirSync(path.join(protocol, "fixtures"), { recursive: true });
    fs.writeFileSync(
      path.join(protocol, "valid.json"),
      '{"nested":{"safe":true}}\n',
    );
    fs.writeFileSync(
      path.join(protocol, "fixtures", "duplicate-key.txt"),
      '{"nested":{"duplicate":1,"\\u0064uplicate":2}}\n',
    );
    const admitted = EvidenceBenchmarkProtocolAdmission.validate(fixture);
    assert(
      admitted.jsonFiles === 1 &&
        admitted.treeAlgorithm === EvidenceBenchmarkHash.TREE_ALGORITHM,
      "protocol admission must strict-parse its complete JSON inventory and prove its guard fixture",
    );
    fs.writeFileSync(
      path.join(protocol, "valid.json"),
      '{"nested":{"duplicate":1,"duplicate":2}}\n',
    );
    expectFailure(
      () => EvidenceBenchmarkProtocolAdmission.validate(fixture),
      "one duplicate key anywhere in the tracked protocol JSON tree must block admission",
    );
  }

  async function abortPollIntegrityFailure(repository: string): Promise<void> {
    const adapter = new FakeAdapter({ barrier: false });
    const command = commandLine(repository, adapter);
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "poll-integrity-r1.json",
    );
    await command.main([
      "prepare",
      "--plan",
      planPath,
      "--block",
      "poll-integrity-r1",
      "--seed",
      "88".repeat(32),
      "--authorization",
      writeSafetyAuthorization(repository, ["todo", "reddit"]),
    ]);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.read(planPath);
    adapter.holdRunId = plan.launchOrder[0]!;
    const starting: Promise<void> = command.main(["start", "--plan", planPath]);
    await waitUntil(() => adapter.startOrder.includes(adapter.holdRunId!));
    const held: IEvidenceBenchmarkOperation.ICell = plan.cells.find(
      (cell) => cell.runId === adapter.holdRunId,
    )!;
    fs.writeFileSync(
      path.join(
        EvidenceBenchmarkOperationStore.operations(held),
        "abort-request.json",
      ),
      "{corrupted fixture",
      { flag: "wx" },
    );
    await starting;
    const terminal: IEvidenceBenchmarkOperation.ITerminal | null =
      EvidenceBenchmarkOperationStore.readTerminal(held);
    assert(
      terminal?.status === "failed" &&
        terminal.subtype === "integrity_failure" &&
        terminal.reason.includes("JSON"),
      "an abort polling callback failure must stop the cell and seal an explicit integrity failure",
    );
    assert(
      plan.cells
        .filter((cell) => cell.runId !== held.runId)
        .every(
          (cell) =>
            EvidenceBenchmarkOperationStore.readState(cell).status ===
            "completed",
        ),
      "an abort polling integrity failure must remain isolated from sibling cells",
    );
  }

  async function staleResume(repository: string): Promise<void> {
    const adapter = new FakeAdapter({ barrier: false });
    const command = commandLine(repository, adapter);
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "resume-r1.json",
    );
    await command.main([
      "prepare",
      "--plan",
      planPath,
      "--block",
      "resume-r1",
      "--seed",
      "33".repeat(32),
      "--authorization",
      writeSafetyAuthorization(repository, ["todo", "reddit"]),
    ]);
    const plan: IEvidenceBenchmarkOperation.IPlan =
      EvidenceBenchmarkOperationPlan.read(planPath);
    const cell: IEvidenceBenchmarkOperation.ICell = plan.cells[0]!;
    EvidenceBenchmarkOperationStore.transition(
      cell,
      ["prepared"],
      "running",
      null,
      null,
      2_147_483_647,
      new Date(),
    );
    writeDeadLock(cell);
    EvidenceBenchmarkOperationBlock.launch(
      plan,
      new Date(Date.now() - 120_000),
      process.hrtime.bigint(),
    );
    const stop: IEvidenceBenchmarkOperation.IBlockStop =
      EvidenceBenchmarkOperationBlock.stop(plan, {
        boundary: "hard_deadline",
        limit: new Date(Date.now() - 60_000).toISOString(),
        observations: [],
        observedAtUtc: new Date(),
      });
    await command.main(["resume", "--run", cell.runId]);
    const terminal: IEvidenceBenchmarkOperation.ITerminal | null =
      EvidenceBenchmarkOperationStore.readTerminal(cell);
    assert(
      EvidenceBenchmarkOperationStore.readState(cell).status ===
        "interrupted" &&
        adapter.runCalls === 0 &&
        adapter.sealCalls === 1 &&
        terminal?.subtype === "safety_limit" &&
        terminal.blockStopSha256 === stop.blockStopSha256,
      "resume must preserve a prior block safety stop without starting a model run",
    );
  }

  async function crashReconciliation(repository: string): Promise<void> {
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "crash-r1.json",
    );
    const preparer = new FakePreparer();
    const plan: IEvidenceBenchmarkOperation.IPlan = await preparer.prepare({
      repository,
      plan: planPath,
      blockId: "crash-r1",
      replicate: 1,
      seed: "44".repeat(32),
      safety: safety(["todo", "reddit"]),
    });
    const cell: IEvidenceBenchmarkOperation.ICell = plan.cells[0]!;
    EvidenceBenchmarkOperationStore.transition(
      cell,
      ["prepared"],
      "running",
      null,
      null,
      process.pid,
      new Date(),
    );
    const result = FakeAdapter.terminal(
      cell,
      "completed",
      "fixture completed",
      "crash-boundary",
    );
    const terminal: IEvidenceBenchmarkOperation.ITerminal = {
      schemaVersion: 1,
      runId: cell.runId,
      status: result.status,
      reason: result.reason,
      subtype: result.subtype,
      sealedAtUtc: new Date().toISOString(),
      runnerRecord: result.runnerRecord,
      runnerTerminal: result.runnerTerminal,
      runnerTerminalSha256: EvidenceBenchmarkHash.file(result.runnerTerminal),
      blockStopSha256: result.blockStopSha256,
    };
    fs.writeFileSync(
      EvidenceBenchmarkOperationStore.terminalPath(cell),
      `${JSON.stringify(terminal, null, 2)}\n`,
      "utf8",
    );
    assert(
      EvidenceBenchmarkOperationStore.readState(cell).status === "completed",
      "a valid terminal seal must win after a terminal-to-state crash",
    );
    EvidenceBenchmarkOperationStore.seal(cell, result, new Date());
    assert(
      EvidenceBenchmarkOperationStore.readState(cell).status === "completed",
      "terminal resealing must reconcile the state ledger idempotently",
    );
  }

  async function planAndLedgerNegatives(repository: string): Promise<void> {
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "negative-r1.json",
    );
    const plan: IEvidenceBenchmarkOperation.IPlan =
      await new FakePreparer().prepare({
        repository,
        plan: planPath,
        blockId: "negative-r1",
        replicate: 1,
        seed: "55".repeat(32),
        safety: safety(["todo", "reddit"]),
      });
    const swapped: IEvidenceBenchmarkOperation.IPlan = structuredClone(plan);
    swapped.cells[0]!.project =
      swapped.cells[0]!.project === "todo" ? "reddit" : "todo";
    rewritePlanHash(swapped);
    const swappedPath: string = path.join(repository, "swapped.json");
    fs.writeFileSync(swappedPath, `${JSON.stringify(swapped, null, 2)}\n`);
    expectFailure(
      () => EvidenceBenchmarkOperationPlan.read(swappedPath),
      "cell subject swaps must fail semantic manifest reconciliation",
    );

    const aliased: IEvidenceBenchmarkOperation.IPlan = structuredClone(plan);
    aliased.cells[1]!.root = aliased.cells[0]!.root;
    rewritePlanHash(aliased);
    const aliasedPath: string = path.join(repository, "aliased.json");
    fs.writeFileSync(aliasedPath, `${JSON.stringify(aliased, null, 2)}\n`);
    expectFailure(
      () => EvidenceBenchmarkOperationPlan.read(aliasedPath),
      "cross-cell root aliases must fail plan admission",
    );

    const stateCell: IEvidenceBenchmarkOperation.ICell = plan.cells[0]!;
    fs.appendFileSync(
      path.join(
        EvidenceBenchmarkOperationStore.operations(stateCell),
        "state.jsonl",
      ),
      `${JSON.stringify({ schemaVersion: 1, sequence: 2 })}\n`,
    );
    expectFailure(
      () => EvidenceBenchmarkOperationStore.readState(stateCell),
      "malformed state tails must fail closed",
    );

    const lockCell: IEvidenceBenchmarkOperation.ICell = plan.cells[1]!;
    writeLivingStalledLock(lockCell);
    const inspected = EvidenceBenchmarkOperationLock.inspect(
      lockCell,
      new Date(),
    );
    assert(
      inspected.liveness === "unknown",
      "a living PID with a stale heartbeat must remain unknown",
    );
    expectFailure(
      () =>
        EvidenceBenchmarkOperationLock.takeOverStale(
          lockCell,
          () => new Date(),
        ),
      "a delayed living controller must never be taken over",
    );

    const ignoredContamination: string = path.join(
      plan.sealedSource,
      "benchmark",
      "template",
      "ignored-generated.txt",
    );
    fs.mkdirSync(path.dirname(ignoredContamination), { recursive: true });
    fs.writeFileSync(ignoredContamination, "must not enter a launch\n");
    expectFailure(
      () => EvidenceBenchmarkOperationPlan.read(planPath),
      "an unrecorded ignored-style file under a sealed template must fail launch admission",
    );
    fs.rmSync(path.join(plan.sealedSource, "benchmark"), {
      recursive: true,
      force: true,
    });
  }

  async function laterWave(repository: string): Promise<void> {
    const planPath: string = path.join(
      repository,
      "benchmark",
      "plans",
      "shopping-erp-r1.json",
    );
    const plan: IEvidenceBenchmarkOperation.IPlan =
      await new FakePreparer().prepare({
        repository,
        plan: planPath,
        blockId: "shopping-erp-r1",
        replicate: 1,
        subjects: ["shopping", "erp"],
        seed: "66".repeat(32),
        safety: safety(["shopping", "erp"]),
      });
    assert(
      JSON.stringify(plan.subjects) === JSON.stringify(["shopping", "erp"]) &&
        new Set(plan.cells.map((cell) => cell.project)).size === 2,
      "the same plan contract must support the Shopping and ERP wave",
    );
  }

  async function missingProductionFacadeBlocks(): Promise<void> {
    let blocked: boolean = false;
    try {
      await EvidenceBenchmarkOperationFacade.load();
    } catch (error) {
      blocked =
        error instanceof Error &&
        error.message.includes("paid launch remains blocked");
    }
    assert(
      blocked,
      "an absent production runner facade must block instead of falling back to direct Codex",
    );
  }

  async function cleanStatusSmudgeIsSealed(repository: string): Promise<void> {
    const fixture: string = path.join(repository, "smudge-repository");
    fs.mkdirSync(fixture);
    await EvidenceBenchmarkProcess.run("git", ["init", "--quiet"], {
      cwd: fixture,
    });
    await EvidenceBenchmarkProcess.run(
      "git",
      ["config", "user.email", "benchmark@example.com"],
      { cwd: fixture },
    );
    await EvidenceBenchmarkProcess.run(
      "git",
      ["config", "user.name", "Benchmark Fixture"],
      { cwd: fixture },
    );
    fs.writeFileSync(
      path.join(fixture, ".gitattributes"),
      "fixture.txt text eol=crlf\n",
    );
    fs.writeFileSync(
      path.join(fixture, ".gitignore"),
      [
        "benchmark/template/ignored-generated.txt",
        "benchmark/requirements/todo/ignored-generated.md",
        "",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(fixture, "fixture.txt"), "one\ntwo\n");
    await EvidenceBenchmarkProcess.run("git", ["add", "."], { cwd: fixture });
    await EvidenceBenchmarkProcess.run(
      "git",
      ["commit", "--quiet", "-m", "fixture"],
      { cwd: fixture },
    );
    fs.unlinkSync(path.join(fixture, "fixture.txt"));
    await EvidenceBenchmarkProcess.run(
      "git",
      ["checkout", "--", "fixture.txt"],
      { cwd: fixture },
    );
    for (const ignored of [
      path.join("benchmark", "template", "ignored-generated.txt"),
      path.join("benchmark", "requirements", "todo", "ignored-generated.md"),
    ]) {
      const location: string = path.join(fixture, ignored);
      fs.mkdirSync(path.dirname(location), { recursive: true });
      fs.writeFileSync(location, "ignored developer contamination\n");
    }
    const status = await EvidenceBenchmarkProcess.run(
      "git",
      ["status", "--porcelain=v1"],
      { cwd: fixture },
    );
    assert(
      status.stdout.trim().length === 0 &&
        fs.readFileSync(path.join(fixture, "fixture.txt")).includes(13),
      "smudge fixture must be Git-clean while its worktree contains CRLF",
    );
    let rejected: boolean = false;
    try {
      await EvidenceBenchmarkOperationSource.assertExactWorktree(fixture);
    } catch (error) {
      rejected =
        error instanceof Error &&
        error.message.includes("exact merged Git tree");
    }
    assert(
      rejected,
      "exact-worktree admission must reject clean-status CRLF smudge drift",
    );
    const revision = await EvidenceBenchmarkProcess.run(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: fixture },
    );
    const sealed = await EvidenceBenchmarkOperationSource.prepare({
      repository: fixture,
      output: path.join(repository, "sealed-smudge-source"),
      revision: revision.stdout.trim(),
      now: () => new Date(),
    });
    const sealedBytes: Buffer = fs.readFileSync(
      path.join(sealed.root, "fixture.txt"),
    );
    assert(
      !sealedBytes.includes(13) &&
        sealed.record.files.some(
          (entry) =>
            entry.path === "fixture.txt" &&
            entry.mode === "100644" &&
            entry.sha256 === EvidenceBenchmarkHash.bytes(sealedBytes),
        ),
      "the sealed clone must ignore developer smudge and hash exact LF Git bytes",
    );
    assert(
      !fs.existsSync(
        path.join(
          sealed.root,
          "benchmark",
          "template",
          "ignored-generated.txt",
        ),
      ) &&
        !fs.existsSync(
          path.join(
            sealed.root,
            "benchmark",
            "requirements",
            "todo",
            "ignored-generated.md",
          ),
        ),
      "ignored developer files under template and requirements must not enter the sealed source",
    );
  }

  function commandLine(
    repository: string,
    adapter: FakeAdapter,
  ): EvidenceBenchmarkOperationCommandLine {
    return new EvidenceBenchmarkOperationCommandLine({
      repository,
      preparer: new FakePreparer(),
      loadAdapter: async () => adapter,
      now: () => new Date(),
      monotonic: () => process.hrtime.bigint(),
      sampler: {
        sample: () => ({
          platform: "fixture",
          cpuCount: 1,
          cpuIdleMs: 1,
          cpuBusyMs: 1,
          totalMemoryBytes: 1,
          freeMemoryBytes: 1,
          loadAverage1m: null,
          diskFreeBytes: null,
        }),
      },
      stdout: (): void => {},
    });
  }

  class FakePreparer implements IEvidenceBenchmarkOperationPreparer {
    public async prepare(
      request: IEvidenceBenchmarkOperation.IPrepareRequest,
    ): Promise<IEvidenceBenchmarkOperation.IPlan> {
      const subjects: IEvidenceBenchmarkOperation.IPlan["subjects"] =
        request.subjects ?? ["todo", "reddit"];
      const seed: string = request.seed ?? "00".repeat(32);
      const blockRoot: string = path.join(
        request.repository,
        "benchmark",
        ".work",
        request.blockId,
      );
      const sealedSource: string = path.join(blockRoot, "source");
      fs.mkdirSync(sealedSource, { recursive: true });
      const sourceFile: string = path.join(sealedSource, "tracked.txt");
      fs.writeFileSync(sourceFile, "tracked\n");
      const sourceFiles = [
        {
          path: "tracked.txt",
          mode: "100644",
          bytes: fs.statSync(sourceFile).size,
          sha256: EvidenceBenchmarkHash.file(sourceFile),
        },
      ];
      const sealedSourceManifest: string = path.join(
        blockRoot,
        "sealed-source.json",
      );
      fs.writeFileSync(
        sealedSourceManifest,
        `${JSON.stringify(
          {
            schemaVersion: 2,
            treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
            sourceRevision: "c".repeat(40),
            originRepository: request.repository,
            coreAutocrlf: "false",
            coreEol: "lf",
            files: sourceFiles,
            treeSha256: EvidenceBenchmarkHash.tree(
              new Map([["tracked.txt", fs.readFileSync(sourceFile)]]),
            ),
            preparedAtUtc: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
      );
      const productRoot: string = path.join(blockRoot, "product");
      fs.mkdirSync(productRoot, { recursive: true });
      const product = {
        archive: path.join(productRoot, "fake.tgz"),
        name: "@samchon/lint-plugin-evidence",
        version: "0.0.0",
        bytes: 4,
        sha256: "a".repeat(64),
        sri: "sha512-fake",
        payloadSha256: "b".repeat(64),
        sourceCommit: "c".repeat(40),
        sourceLockSha256: "d".repeat(64),
        preparedAt: new Date().toISOString(),
        packElapsedMs: 1,
        smokeInstallElapsedMs: 1,
        smokeCheckElapsedMs: 1,
        pnpmVersion: "10.10.0",
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
      };
      fs.writeFileSync(product.archive, "fake");
      const productProvenance: string = path.join(
        productRoot,
        "provenance.json",
      );
      fs.writeFileSync(
        productProvenance,
        `${JSON.stringify(product, null, 2)}\n`,
      );
      const specifications = EvidenceBenchmarkOperationPlan.cells(
        request.blockId,
        request.replicate,
        subjects,
      );
      const randomized = EvidenceBenchmarkOperationPlan.randomize(
        specifications,
        seed,
      );
      const cells: IEvidenceBenchmarkOperation.ICell[] = randomized.map(
        (specification, launchIndex) => {
          const root: string = path.join(
            blockRoot,
            "cells",
            specification.runId,
          );
          const workspace: string = path.join(root, "workspace");
          fs.mkdirSync(workspace, { recursive: true });
          const requirementContent: Buffer = Buffer.from(
            `${specification.project}\n`,
            "utf8",
          );
          for (const requirementRoot of [
            path.join(root, "inputs", "requirements"),
            path.join(workspace, "docs", "analysis"),
          ]) {
            fs.mkdirSync(requirementRoot, { recursive: true });
            fs.writeFileSync(
              path.join(requirementRoot, "requirements.md"),
              requirementContent,
            );
          }
          const materializationManifest: string = path.join(
            root,
            "materialization.json",
          );
          const setupRecord: string = path.join(root, "setup.json");
          const manifest: IEvidenceBenchmarkMaterialization.IManifest =
            fakeManifest(
              specification.project,
              specification.arm,
              requirementContent,
            );
          fs.writeFileSync(
            materializationManifest,
            `${JSON.stringify(manifest, null, 2)}\n`,
          );
          fs.writeFileSync(
            setupRecord,
            `${JSON.stringify(
              {
                completedAt: new Date().toISOString(),
                lockElapsedMs: 1,
                installElapsedMs: 1,
                lockSha256: "e".repeat(64),
                pnpmVersion: "10.10.0",
                ttscVersion: "0.23.0",
                lintVersion: "0.23.0",
                typescriptVersion: "7.0.2",
              },
              null,
              2,
            )}\n`,
          );
          return {
            ...specification,
            replicate: request.replicate,
            launchIndex,
            root,
            workspace,
            materializationManifest,
            materializationManifestSha256: EvidenceBenchmarkHash.file(
              materializationManifest,
            ),
            setupRecord,
            setupRecordSha256: EvidenceBenchmarkHash.file(setupRecord),
          };
        },
      );
      cells.sort((left, right) => (left.runId < right.runId ? -1 : 1));
      const plan: IEvidenceBenchmarkOperation.IPlan =
        EvidenceBenchmarkOperationPlan.write(request.plan, {
          schemaVersion: 1,
          blockId: request.blockId,
          sourceRevision: product.sourceCommit,
          repository: request.repository,
          preparedAtUtc: new Date().toISOString(),
          replicate: request.replicate,
          subjects,
          mergedBaseRef: "refs/remotes/origin/master",
          mergedBaseRevision: "f".repeat(40),
          remoteVerifiedAtUtc: new Date().toISOString(),
          sealedSource,
          sealedSourceManifest,
          sealedSourceManifestSha256:
            EvidenceBenchmarkHash.file(sealedSourceManifest),
          seed,
          safety: request.safety,
          concurrency: 4,
          launchOrder: randomized.map((cell) => cell.runId),
          cells,
          productProvenance,
          productProvenanceSha256:
            EvidenceBenchmarkHash.file(productProvenance),
        });
      const serialized: string = fs.readFileSync(request.plan, "utf8");
      for (const cell of plan.cells) {
        fs.writeFileSync(
          path.join(cell.root, "operation-plan.json"),
          serialized,
        );
        EvidenceBenchmarkOperationStore.initialize(cell, new Date());
      }
      return plan;
    }
  }

  class FakeAdapter implements IEvidenceBenchmarkOperationAdapter {
    public failRunId: string | null = null;
    public holdRunId: string | null = null;
    public holdAll: boolean = false;
    public observeHang: boolean = false;
    public observationTokens: number = 0;
    public readonly startOrder: string[] = [];
    public readonly abortCalls: string[] = [];
    public maximumConcurrency: number = 0;
    public runCalls: number = 0;
    public sealCalls: number = 0;
    private active: number = 0;

    public constructor(private readonly options: { barrier: boolean }) {}

    public async run(
      _plan: IEvidenceBenchmarkOperation.IPlan,
      cell: IEvidenceBenchmarkOperation.ICell,
      signal: AbortSignal,
    ): Promise<IEvidenceBenchmarkOperationAdapter.ITerminalResult> {
      ++this.runCalls;
      ++this.active;
      this.maximumConcurrency = Math.max(this.maximumConcurrency, this.active);
      this.startOrder.push(cell.runId);
      try {
        if (this.options.barrier)
          await waitUntil(() => this.startOrder.length === 4);
        if (cell.runId === this.failRunId)
          throw new Error("fixture isolated runner failure");
        if (this.holdAll || cell.runId === this.holdRunId) {
          if (!signal.aborted)
            await new Promise<void>((resolve) =>
              signal.addEventListener("abort", () => resolve(), {
                once: true,
              }),
            );
          return FakeAdapter.terminal(
            cell,
            "interrupted",
            isAbortRequest(signal.reason)
              ? signal.reason.reason
              : String(signal.reason),
            "aborted",
            isAbortRequest(signal.reason) &&
              signal.reason.subtype === "safety_limit"
              ? "safety_limit"
              : "operator_abort",
            isAbortRequest(signal.reason)
              ? signal.reason.blockStopSha256
              : null,
          );
        }
        return FakeAdapter.terminal(
          cell,
          "completed",
          "fixture completed",
          "completed",
        );
      } finally {
        --this.active;
      }
    }

    public async abort(
      cell: IEvidenceBenchmarkOperation.ICell,
      _request: IEvidenceBenchmarkOperation.IAbortRequest,
    ): Promise<void> {
      this.abortCalls.push(cell.runId);
    }

    public async observe(
      cell: IEvidenceBenchmarkOperation.ICell,
    ): Promise<IEvidenceBenchmarkOperation.IObservation> {
      if (this.observeHang) await new Promise<never>(() => undefined);
      return {
        runId: cell.runId,
        observedTotalTokens: this.observationTokens,
        responses:
          this.observationTokens === 0
            ? []
            : [
                {
                  responseId: `${cell.runId}-response`,
                  totalTokens: this.observationTokens,
                },
              ],
        usageLowerBound: false,
        checkpointSha256: "7".repeat(64),
        process: {
          count: 1,
          rssBytes: 1,
          userCpuMicros: 1,
          systemCpuMicros: 1,
          diskReadBytes: null,
          diskWriteBytes: null,
        },
      };
    }

    public async sealInterrupted(
      _plan: IEvidenceBenchmarkOperation.IPlan,
      cell: IEvidenceBenchmarkOperation.ICell,
      request: IEvidenceBenchmarkOperation.IAbortRequest,
    ): Promise<IEvidenceBenchmarkOperationAdapter.ITerminalResult> {
      ++this.sealCalls;
      return FakeAdapter.terminal(
        cell,
        "interrupted",
        request.reason,
        "stale",
        request.subtype === "safety_limit" ? "safety_limit" : "liveness_loss",
        request.blockStopSha256,
      );
    }

    public async grade(
      _plan: IEvidenceBenchmarkOperation.IPlan,
      cell: IEvidenceBenchmarkOperation.ICell,
    ): Promise<IEvidenceBenchmarkOperationAdapter.IPostprocessResult> {
      return { message: `graded ${cell.runId}`, outputs: [] };
    }

    public async report(
      plan: IEvidenceBenchmarkOperation.IPlan,
    ): Promise<IEvidenceBenchmarkOperationAdapter.IPostprocessResult> {
      return { message: `reported ${plan.blockId}`, outputs: [] };
    }

    public static terminal(
      cell: IEvidenceBenchmarkOperation.ICell,
      status: "completed" | "failed" | "interrupted",
      reason: string,
      label: string,
      subtype: IEvidenceBenchmarkOperation.TerminalSubtype = status ===
      "completed"
        ? "completed"
        : "runner_failure",
      blockStopSha256: string | null = null,
    ): IEvidenceBenchmarkOperationAdapter.ITerminalResult {
      const runnerRecord: string = path.join(cell.root, `runner-${label}`);
      fs.mkdirSync(runnerRecord, { recursive: true });
      const runnerTerminal: string = path.join(runnerRecord, "checkpoint.json");
      fs.writeFileSync(
        runnerTerminal,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            runId: cell.runId,
            status,
            phase: "terminal",
            terminal: { reason, subtype, blockStopSha256 },
          },
          null,
          2,
        )}\n`,
      );
      return {
        status,
        reason,
        subtype,
        blockStopSha256,
        runnerRecord,
        runnerTerminal,
      };
    }
  }

  function fakeManifest(
    project: IEvidenceBenchmarkMaterialization.Project,
    arm: IEvidenceBenchmarkMaterialization.Arm,
    requirementContent: Uint8Array,
  ): IEvidenceBenchmarkMaterialization.IManifest {
    const requirements: ReadonlyMap<string, Uint8Array> = new Map([
      ["requirements.md", requirementContent],
    ]);
    return {
      schemaVersion: 2,
      treeAlgorithm: EvidenceBenchmarkHash.TREE_ALGORITHM,
      project,
      arm,
      materializedAt: new Date().toISOString(),
      variables: {},
      baseTreeSha256: "1".repeat(64),
      armTreeSha256: arm === "evidence" ? "2".repeat(64) : "3".repeat(64),
      requirementsTreeSha256: EvidenceBenchmarkHash.tree(requirements),
      workspaceTreeSha256: "4".repeat(64),
      inputSha256: "5".repeat(64),
      workspaceFiles: [],
      requirementFiles: EvidenceBenchmarkHash.entries(requirements),
      corpus: {
        documents: 1,
        h2: 1,
        h3: 1,
        atomicAcceptanceClauses: 1,
        contextCriteria: project === "erp" ? 1 : 0,
        inventory: "acceptance-criteria.jsonl",
      },
      artifact: {
        name: "@samchon/lint-plugin-evidence",
        version: "0.0.0",
        sha256: "a".repeat(64),
        payloadSha256: "b".repeat(64),
        sourceCommit: "c".repeat(40),
        ...(arm === "evidence"
          ? { relativeArchive: ".benchmark-deps/fake.tgz" }
          : {}),
      },
      caches: {
        pnpm: "pnpm",
        ttsc: "ttsc",
        go: "go",
        toolchain: "toolchain",
      },
    };
  }

  function rewritePlanHash(plan: IEvidenceBenchmarkOperation.IPlan): void {
    const { planSha256: _discarded, ...content } = plan;
    plan.planSha256 = EvidenceBenchmarkHash.object(content);
  }

  function writeSafetyAuthorization(
    repository: string,
    subjects: IEvidenceBenchmarkOperation.IPlan["subjects"],
    label: string = subjects.join("-"),
    maximumBlockDurationMs: number = 60 * 60 * 1_000,
  ): string {
    const location: string = path.join(
      repository,
      `authorization-${label}.json`,
    );
    if (!fs.existsSync(location))
      fs.writeFileSync(
        location,
        `${JSON.stringify(
          safety(subjects, maximumBlockDurationMs),
          null,
          2,
        )}\n`,
      );
    return location;
  }

  function safety(
    subjects: IEvidenceBenchmarkOperation.IPlan["subjects"],
    maximumBlockDurationMs: number = 60 * 60 * 1_000,
  ): IEvidenceBenchmarkOperation.ISafetyAuthorization {
    return {
      id: `fixture-${subjects.join("-")}`,
      approvedAtUtc: new Date().toISOString(),
      maximumObservedTotalTokensBySubject: Object.fromEntries(
        subjects.map((subject) => [subject, 1_000]),
      ),
      maximumDurationMsBySubject: Object.fromEntries(
        subjects.map((subject) => [subject, 60 * 60 * 1_000]),
      ),
      maximumObservedBlockTotalTokens: 3_000,
      maximumBlockDurationMs,
      monetaryStatus: "unavailable",
      hardCeilingGuaranteed: false,
    };
  }

  function fixtureHost(): IEvidenceBenchmarkOperation.IBlockSample["host"] {
    return {
      platform: "fixture",
      cpuCount: 1,
      cpuIdleMs: 1,
      cpuBusyMs: 1,
      totalMemoryBytes: 1,
      freeMemoryBytes: 1,
      loadAverage1m: null,
      diskFreeBytes: null,
    };
  }

  function writeDeadLock(cell: IEvidenceBenchmarkOperation.ICell): void {
    const operations: string = EvidenceBenchmarkOperationStore.operations(cell);
    const heartbeat: string = path.join(operations, "heartbeat.dead.jsonl");
    const timestamp: string = new Date(Date.now() - 60_000).toISOString();
    fs.writeFileSync(
      heartbeat,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: cell.runId,
        ownerId: "dead",
        sequence: 1,
        atUtc: timestamp,
      })}\n`,
    );
    fs.writeFileSync(
      EvidenceBenchmarkOperationStore.lockPath(cell),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          runId: cell.runId,
          pid: 2_147_483_647,
          hostname: os.hostname(),
          ownerId: "dead",
          heartbeat,
          acquiredAtUtc: timestamp,
          heartbeatAtUtc: timestamp,
        },
        null,
        2,
      )}\n`,
    );
  }

  function writeLivingStalledLock(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): void {
    const operations: string = EvidenceBenchmarkOperationStore.operations(cell);
    const heartbeat: string = path.join(operations, "heartbeat.living.jsonl");
    const timestamp: string = new Date(Date.now() - 60_000).toISOString();
    fs.writeFileSync(
      heartbeat,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: cell.runId,
        ownerId: "living",
        sequence: 1,
        atUtc: timestamp,
      })}\n`,
    );
    fs.writeFileSync(
      EvidenceBenchmarkOperationStore.lockPath(cell),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          runId: cell.runId,
          pid: process.pid,
          hostname: os.hostname(),
          ownerId: "living",
          heartbeat,
          acquiredAtUtc: timestamp,
          heartbeatAtUtc: timestamp,
        },
        null,
        2,
      )}\n`,
    );
  }

  async function waitUntil(predicate: () => boolean): Promise<void> {
    const deadline: number = Date.now() + 5_000;
    while (!predicate()) {
      if (Date.now() >= deadline)
        throw new Error("Timed out waiting for fake benchmark state.");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  function expectFailure(action: () => void, message: string): void {
    let failed: boolean = false;
    try {
      action();
    } catch {
      failed = true;
    }
    assert(failed, message);
  }

  function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  function isAbortRequest(
    input: unknown,
  ): input is IEvidenceBenchmarkOperation.IAbortRequest {
    return (
      typeof input === "object" &&
      input !== null &&
      "schemaVersion" in input &&
      input.schemaVersion === 1 &&
      "reason" in input &&
      typeof input.reason === "string"
    );
  }
}
