import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkOperationBlock } from "./EvidenceBenchmarkOperationBlock.ts";
import { EvidenceBenchmarkOperationLock } from "./EvidenceBenchmarkOperationLock.ts";
import { EvidenceBenchmarkOperationStore } from "./EvidenceBenchmarkOperationStore.ts";
import type { IEvidenceBenchmarkOperation } from "./structures/IEvidenceBenchmarkOperation.ts";
import type { IEvidenceBenchmarkOperationAdapter } from "./structures/IEvidenceBenchmarkOperationAdapter.ts";
import type { IEvidenceBenchmarkOperationSampler } from "./structures/IEvidenceBenchmarkOperationSampler.ts";

/** Coordinates one randomized four-cell block without owning runner mechanics. */
export class EvidenceBenchmarkOperationOrchestrator {
  /** Creates an orchestrator from the admitted facade and UTC clock. */
  public constructor(
    private readonly options: EvidenceBenchmarkOperationOrchestrator.IOptions,
  ) {}

  /**
   * Starts all four prepared cells concurrently in the frozen randomized order.
   *
   * Each cell remains independently owned: one failure is sealed and retained
   * without cancelling or relabelling any sibling.
   */
  public async start(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): Promise<IEvidenceBenchmarkOperation.IStatus[]> {
    for (const cell of plan.cells) {
      const state: IEvidenceBenchmarkOperation.IState =
        EvidenceBenchmarkOperationStore.readState(cell);
      const liveness = EvidenceBenchmarkOperationLock.inspect(
        cell,
        this.options.now(),
      );
      if (state.status !== "prepared" || liveness.liveness !== "unlocked")
        throw new Error(
          `Benchmark start requires prepared and unlocked cells; ${cell.runId} is ${state.status}/${liveness.liveness}.`,
        );
    }
    const handles: Map<string, EvidenceBenchmarkOperationLock.IHandle> =
      new Map();
    try {
      for (const cell of plan.cells) {
        const handle: EvidenceBenchmarkOperationLock.IHandle =
          EvidenceBenchmarkOperationLock.acquire(cell, this.options.now);
        handles.set(cell.runId, handle);
        EvidenceBenchmarkOperationStore.append(
          cell,
          "lock-acquired",
          { ownerId: handle.lock.ownerId, pid: handle.lock.pid },
          this.options.now(),
        );
      }
    } catch (error) {
      for (const handle of handles.values()) handle.release();
      throw error;
    }
    for (const cell of plan.cells) {
      EvidenceBenchmarkOperationStore.transition(
        cell,
        ["prepared"],
        "running",
        null,
        null,
        process.pid,
        this.options.now(),
      );
      EvidenceBenchmarkOperationStore.append(
        cell,
        "started",
        { blockId: plan.blockId, launchIndex: cell.launchIndex },
        this.options.now(),
      );
    }
    const execution: IEvidenceBenchmarkOperation.IBlockExecutionSafety =
      EvidenceBenchmarkOperationBlock.launch(
        plan,
        this.options.now(),
        this.options.monotonic(),
      );

    const cells: IEvidenceBenchmarkOperation.ICell[] = plan.launchOrder.map(
      (runId) => plan.cells.find((cell) => cell.runId === runId)!,
    );
    const controllers: Map<string, AbortController> = new Map();
    const controllerFailures: Map<string, Error> = new Map();
    let cellsFinished: boolean = false;
    const pending: Promise<void>[] = cells.map(async (cell) => {
      try {
        await this.runCell(
          plan,
          cell,
          handles.get(cell.runId)!,
          controllers,
          controllerFailures,
        );
      } finally {
        const handle: EvidenceBenchmarkOperationLock.IHandle | undefined =
          handles.get(cell.runId);
        if (handle !== undefined) {
          handle.release();
          EvidenceBenchmarkOperationStore.append(
            cell,
            "lock-released",
            { ownerId: handle.lock.ownerId },
            this.options.now(),
          );
        }
      }
    });
    let safetyFailure: Error | null = null;
    const safety: Promise<void> = Promise.all([
      this.monitorBlock(plan, execution, (): boolean => cellsFinished),
      this.guardDeadline(plan, execution, (): boolean => cellsFinished),
    ])
      .then(() => undefined)
      .catch(async (error: unknown) => {
        safetyFailure =
          error instanceof Error ? error : new Error(String(error));
        await this.emergencyAbort(
          plan,
          controllers,
          controllerFailures,
          safetyFailure,
        );
      });
    const executions: PromiseSettledResult<void>[] =
      await Promise.allSettled(pending);
    cellsFinished = true;
    await safety;
    const rejected: PromiseRejectedResult[] = executions.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (safetyFailure !== null)
      throw new AggregateError(
        [safetyFailure, ...rejected.map((result) => result.reason)],
        "Benchmark safety controller failed; all live cells were quiesced.",
      );
    if (rejected.length !== 0)
      throw new AggregateError(
        rejected.map((result) => result.reason),
        `${rejected.length} benchmark cell controllers failed after sibling isolation.`,
      );
    return plan.cells.map((cell) => this.status(cell));
  }

  /** Returns durable state and conservative controller liveness for one run. */
  public status(
    cell: IEvidenceBenchmarkOperation.ICell,
  ): IEvidenceBenchmarkOperation.IStatus {
    const state: IEvidenceBenchmarkOperation.IState =
      EvidenceBenchmarkOperationStore.readState(cell);
    const inspected = EvidenceBenchmarkOperationLock.inspect(
      cell,
      this.options.now(),
    );
    return {
      runId: cell.runId,
      status: state.status,
      liveness: inspected.liveness,
      heartbeatAgeMs: inspected.heartbeatAgeMs,
      terminalReason: state.terminalReason,
      root: cell.root,
    };
  }

  /** Writes one cooperative, non-destructive abort request for a live run. */
  public abort(
    cell: IEvidenceBenchmarkOperation.ICell,
    reason: string,
  ): IEvidenceBenchmarkOperation.IAbortRequest {
    const state: IEvidenceBenchmarkOperation.IState =
      EvidenceBenchmarkOperationStore.readState(cell);
    const inspected = EvidenceBenchmarkOperationLock.inspect(
      cell,
      this.options.now(),
    );
    if (state.status !== "running" || inspected.liveness !== "live")
      throw new Error(
        `Benchmark abort requires a live running cell; ${cell.runId} is ${state.status}/${inspected.liveness}.`,
      );
    return EvidenceBenchmarkOperationStore.requestAbort(
      cell,
      reason,
      "operator_abort",
      null,
      this.options.now(),
    );
  }

  /**
   * Right-censors one proven-stale local attempt without sending another model
   * turn or reusing its workspace as a replacement attempt.
   */
  public async resume(
    plan: IEvidenceBenchmarkOperation.IPlan,
    cell: IEvidenceBenchmarkOperation.ICell,
  ): Promise<IEvidenceBenchmarkOperation.IStatus> {
    const state: IEvidenceBenchmarkOperation.IState =
      EvidenceBenchmarkOperationStore.readState(cell);
    if (state.status !== "running")
      throw new Error(
        `Benchmark resume can only seal a stale running attempt: ${cell.runId} is ${state.status}.`,
      );
    const handle: EvidenceBenchmarkOperationLock.IHandle =
      EvidenceBenchmarkOperationLock.takeOverStale(cell, this.options.now);
    EvidenceBenchmarkOperationStore.append(
      cell,
      "stale-lock-taken-over",
      { ownerId: handle.lock.ownerId },
      this.options.now(),
    );
    try {
      const blockStop: IEvidenceBenchmarkOperation.IBlockStop | null =
        EvidenceBenchmarkOperationBlock.readStop(plan);
      const request: IEvidenceBenchmarkOperation.IAbortRequest = {
        schemaVersion: 1,
        runId: cell.runId,
        reason:
          blockStop === null
            ? "controller or app-server liveness was lost; exact-token continuation is forbidden"
            : `shared block safety stop ${blockStop.boundary}`,
        subtype: blockStop === null ? "liveness_loss" : "safety_limit",
        blockStopSha256: blockStop?.blockStopSha256 ?? null,
        requestedAtUtc: this.options.now().toISOString(),
      };
      const result = await this.adapter().sealInterrupted(plan, cell, request);
      if (result.status !== "interrupted")
        throw new Error(
          `Stale sealing must return interrupted, received ${result.status}.`,
        );
      EvidenceBenchmarkOperationStore.seal(cell, result, this.options.now());
    } finally {
      handle.release();
      EvidenceBenchmarkOperationStore.append(
        cell,
        "lock-released",
        { ownerId: handle.lock.ownerId },
        this.options.now(),
      );
    }
    return this.status(cell);
  }

  /** Grades one completed or right-censored retained run. */
  public async grade(
    plan: IEvidenceBenchmarkOperation.IPlan,
    cell: IEvidenceBenchmarkOperation.ICell,
  ): Promise<IEvidenceBenchmarkOperationAdapter.IPostprocessResult> {
    const state: IEvidenceBenchmarkOperation.IState =
      EvidenceBenchmarkOperationStore.readState(cell);
    if (!["completed", "failed", "interrupted"].includes(state.status))
      throw new Error(
        `Benchmark grade requires a terminal run: ${cell.runId} is ${state.status}.`,
      );
    return this.adapter().grade(plan, cell);
  }

  /** Reports a block only after all four cells reached explicit terminal seals. */
  public async report(
    plan: IEvidenceBenchmarkOperation.IPlan,
  ): Promise<IEvidenceBenchmarkOperationAdapter.IPostprocessResult> {
    const pending: string[] = plan.cells
      .filter(
        (cell) =>
          !["completed", "failed", "interrupted"].includes(
            EvidenceBenchmarkOperationStore.readState(cell).status,
          ),
      )
      .map((cell) => cell.runId);
    if (pending.length !== 0)
      throw new Error(
        `Benchmark report requires a terminal block; pending: ${pending.join(", ")}.`,
      );
    return this.adapter().report(plan);
  }

  private async runCell(
    plan: IEvidenceBenchmarkOperation.IPlan,
    cell: IEvidenceBenchmarkOperation.ICell,
    handle: EvidenceBenchmarkOperationLock.IHandle,
    controllers: Map<string, AbortController>,
    controllerFailures: Map<string, Error>,
  ): Promise<void> {
    const controller: AbortController = new AbortController();
    controllers.set(cell.runId, controller);
    let aborting: Promise<void> | null = null;
    let pollFailure: Error | null = null;
    const poll: NodeJS.Timeout = setInterval(() => {
      if (aborting !== null) return;
      try {
        const request: IEvidenceBenchmarkOperation.IAbortRequest | null =
          EvidenceBenchmarkOperationStore.readAbort(cell);
        if (request === null) return;
        EvidenceBenchmarkOperationStore.append(
          cell,
          "abort-requested",
          {
            reason: request.reason,
            subtype: request.subtype,
            blockStopSha256: request.blockStopSha256,
            requestedAtUtc: request.requestedAtUtc,
          },
          this.options.now(),
        );
        controller.abort(request);
        aborting = this.adapter().abort(cell, request);
      } catch (error) {
        pollFailure = error instanceof Error ? error : new Error(String(error));
        controller.abort(pollFailure);
      }
    }, 250);
    let result: IEvidenceBenchmarkOperationAdapter.ITerminalResult;
    try {
      result = await this.adapter().run(plan, cell, controller.signal);
      if (aborting !== null) await aborting;
      if (pollFailure !== null) throw pollFailure;
      const controllerFailure: Error | undefined = controllerFailures.get(
        cell.runId,
      );
      if (controllerFailure !== undefined) throw controllerFailure;
      const heartbeatFailure: Error | null = handle.failure();
      if (heartbeatFailure !== null) throw heartbeatFailure;
    } catch (error) {
      result = this.preserveAdapterFailure(cell, error);
    } finally {
      clearInterval(poll);
      controllers.delete(cell.runId);
    }
    EvidenceBenchmarkOperationStore.seal(cell, result, this.options.now());
  }

  private preserveAdapterFailure(
    cell: IEvidenceBenchmarkOperation.ICell,
    error: unknown,
  ): IEvidenceBenchmarkOperationAdapter.ITerminalResult {
    const directory: string = path.join(
      EvidenceBenchmarkOperationStore.operations(cell),
      "adapter-failure",
    );
    fs.mkdirSync(directory, { recursive: false });
    const terminal: string = path.join(directory, "terminal.json");
    const reason: string =
      error instanceof Error ? error.message : String(error);
    fs.writeFileSync(
      terminal,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          runId: cell.runId,
          status: "failed",
          reason,
          subtype: "integrity_failure",
          blockStopSha256: null,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : { message: String(error) },
          failedAtUtc: this.options.now().toISOString(),
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", flag: "wx" },
    );
    return {
      status: "failed",
      reason,
      subtype: "integrity_failure",
      blockStopSha256: null,
      runnerRecord: directory,
      runnerTerminal: terminal,
    };
  }

  private adapter(): IEvidenceBenchmarkOperationAdapter {
    if (this.options.adapter === null)
      throw new Error(
        "This benchmark operation requires the admitted production runner facade.",
      );
    return this.options.adapter;
  }

  private async monitorBlock(
    plan: IEvidenceBenchmarkOperation.IPlan,
    execution: IEvidenceBenchmarkOperation.IBlockExecutionSafety,
    finished: () => boolean,
  ): Promise<void> {
    while (!finished()) {
      if (EvidenceBenchmarkOperationBlock.readStop(plan) !== null) return;
      const started: bigint = this.options.monotonic();
      try {
        const running: IEvidenceBenchmarkOperation.ICell[] = plan.cells.filter(
          (cell) =>
            EvidenceBenchmarkOperationStore.readState(cell).status ===
            "running",
        );
        const observations: IEvidenceBenchmarkOperation.IObservation[] =
          await this.boundedObservations(
            running,
            Math.min(1_000, plan.safety.maximumBlockDurationMs),
          );
        const host = this.options.sampler.sample();
        const ended: bigint = this.options.monotonic();
        const sample: IEvidenceBenchmarkOperation.IBlockSample =
          EvidenceBenchmarkOperationBlock.sample(plan, {
            atUtc: this.options.now(),
            monotonicNs: ended,
            samplerElapsedMs: Number(ended - started) / 1_000_000,
            host,
            observations,
          });
        if (
          sample.observedBlockTotalTokens >=
          plan.safety.maximumObservedBlockTotalTokens
        ) {
          const stop: IEvidenceBenchmarkOperation.IBlockStop =
            EvidenceBenchmarkOperationBlock.stop(plan, {
              boundary: "maximum_observed_block_total_tokens",
              limit: plan.safety.maximumObservedBlockTotalTokens,
              observations: this.lowerBound(sample.observations),
              observedAtUtc: this.options.now(),
            });
          this.requestBlockStop(plan, stop);
          return;
        }
      } catch (error) {
        const reason: string =
          error instanceof Error ? error.message : String(error);
        const observations: IEvidenceBenchmarkOperation.IObservation[] =
          this.lowerBound(EvidenceBenchmarkOperationBlock.latest(plan));
        const stop: IEvidenceBenchmarkOperation.IBlockStop =
          EvidenceBenchmarkOperationBlock.stop(plan, {
            boundary: "safety_monitor_failure",
            limit: reason,
            observations,
            observedAtUtc: this.options.now(),
          });
        this.requestBlockStop(plan, stop);
        return;
      }
      if (!finished())
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  private async guardDeadline(
    plan: IEvidenceBenchmarkOperation.IPlan,
    execution: IEvidenceBenchmarkOperation.IBlockExecutionSafety,
    finished: () => boolean,
  ): Promise<void> {
    const deadlineNs: bigint =
      BigInt(execution.launchedAtMonotonicNs) +
      BigInt(execution.maximumBlockDurationMs) * 1_000_000n;
    while (!finished()) {
      if (EvidenceBenchmarkOperationBlock.readStop(plan) !== null) return;
      const remainingNs: bigint = deadlineNs - this.options.monotonic();
      if (remainingNs <= 0n) {
        const observations: IEvidenceBenchmarkOperation.IObservation[] =
          this.lowerBound(EvidenceBenchmarkOperationBlock.latest(plan));
        const stop: IEvidenceBenchmarkOperation.IBlockStop =
          EvidenceBenchmarkOperationBlock.stop(plan, {
            boundary: "hard_deadline",
            limit: execution.hardDeadlineUtc,
            observations,
            observedAtUtc: this.options.now(),
          });
        this.requestBlockStop(plan, stop);
        return;
      }
      const waitMs: number = Math.max(
        1,
        Math.min(250, Math.ceil(Number(remainingNs) / 1_000_000)),
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private async boundedObservations(
    cells: readonly IEvidenceBenchmarkOperation.ICell[],
    timeoutMs: number,
  ): Promise<IEvidenceBenchmarkOperation.IObservation[]> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        Promise.all(cells.map((cell) => this.adapter().observe(cell))),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(
                new Error(`Benchmark observation exceeded ${timeoutMs} ms.`),
              ),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  private async emergencyAbort(
    plan: IEvidenceBenchmarkOperation.IPlan,
    controllers: ReadonlyMap<string, AbortController>,
    controllerFailures: Map<string, Error>,
    error: Error,
  ): Promise<void> {
    const requests: Promise<void>[] = [];
    for (const cell of plan.cells) {
      const controller: AbortController | undefined = controllers.get(
        cell.runId,
      );
      if (controller === undefined) continue;
      controllerFailures.set(cell.runId, error);
      const request: IEvidenceBenchmarkOperation.IAbortRequest = {
        schemaVersion: 1,
        runId: cell.runId,
        reason: `safety controller integrity failure: ${error.message}`,
        subtype: "liveness_loss",
        blockStopSha256: null,
        requestedAtUtc: this.options.now().toISOString(),
      };
      controller.abort(request);
      requests.push(this.adapter().abort(cell, request));
    }
    const settled: PromiseSettledResult<void>[] =
      await Promise.allSettled(requests);
    const rejected: PromiseRejectedResult[] = settled.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejected.length !== 0)
      throw new AggregateError(
        [error, ...rejected.map((result) => result.reason)],
        "Benchmark emergency quiescence failed.",
      );
  }

  private requestBlockStop(
    plan: IEvidenceBenchmarkOperation.IPlan,
    stop: IEvidenceBenchmarkOperation.IBlockStop,
  ): void {
    for (const cell of plan.cells) {
      const state: IEvidenceBenchmarkOperation.IState =
        EvidenceBenchmarkOperationStore.readState(cell);
      if (state.status !== "running") continue;
      try {
        EvidenceBenchmarkOperationStore.requestAbort(
          cell,
          `shared block safety stop ${stop.boundary}`,
          "safety_limit",
          stop.blockStopSha256,
          this.options.now(),
        );
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "EEXIST"
        ))
          throw error;
      }
    }
  }

  private lowerBound(
    observations: readonly IEvidenceBenchmarkOperation.IObservation[],
  ): IEvidenceBenchmarkOperation.IObservation[] {
    return observations.map((observation) => ({
      ...observation,
      usageLowerBound: true,
    }));
  }
}

/** Constructor dependencies for {@link EvidenceBenchmarkOperationOrchestrator}. */
export namespace EvidenceBenchmarkOperationOrchestrator {
  /** Admitted runner facade and UTC clock. */
  export interface IOptions {
    /** Fixed facade that owns launch gates, Codex, grading, and reporting. */
    adapter: IEvidenceBenchmarkOperationAdapter | null;

    /** UTC clock injected by deterministic fixtures. */
    now: () => Date;

    /** Monotonic nanosecond clock. */
    monotonic: () => bigint;

    /** Low-overhead host diagnostic sampler. */
    sampler: IEvidenceBenchmarkOperationSampler;
  }
}
