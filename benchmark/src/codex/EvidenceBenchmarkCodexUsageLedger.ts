import fs from "node:fs";

import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Deduplicates exact upstream usage and reconciles it against accumulated
 * thread counters and preserved rollouts.
 */
export class EvidenceBenchmarkCodexUsageLedger {
  private readonly responses = new Map<
    string,
    IEvidenceBenchmarkCodexRecord.IResponseUsage
  >();
  private readonly duplicateResponseIds = new Set<string>();
  private readonly latestThreadUsage = new Map<
    string,
    IEvidenceBenchmarkCodexRecord.IThreadUsage
  >();
  private readonly anomalies: string[] = [];
  private exactUsageComplete = true;

  /**
   * Restores a prior exact usage report without double-counting later replayed
   * app-server notifications.
   *
   * @param report Previously checkpointed usage report, when resuming.
   */
  public constructor(report?: IEvidenceBenchmarkCodexRecord.IUsageReport) {
    for (const response of report?.responses ?? [])
      this.responses.set(response.responseId, response);
    for (const responseId of report?.duplicateResponseIds ?? [])
      this.duplicateResponseIds.add(responseId);
    for (const usage of Object.values(report?.latestThreadUsage ?? {}))
      this.latestThreadUsage.set(usage.threadId, usage);
    this.anomalies.push(...(report?.anomalies ?? []));
    this.exactUsageComplete = report?.exactUsageComplete ?? true;
  }

  /**
   * Consumes only usage-bearing notifications and leaves every unknown method
   * to the raw protocol ledger.
   */
  public ingest(
    method: string,
    params: Readonly<Record<string, unknown>>,
    receivedAtUtc: string,
  ): void {
    try {
      if (method === "rawResponse/completed")
        this.ingestRawResponse(params, receivedAtUtc);
      else if (method === "thread/tokenUsage/updated")
        this.ingestThreadUsage(params, receivedAtUtc);
    } catch (error) {
      if (method === "rawResponse/completed") this.exactUsageComplete = false;
      this.anomalies.push(
        `${method}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Records a transport, schema, identity, or rollout anomaly for final audit. */
  public anomaly(message: string): void {
    this.anomalies.push(message);
  }

  /** Marks exact usage unavailable when the raw-event watchdog observes a gap. */
  public missingExactUsage(message: string): void {
    this.exactUsageComplete = false;
    this.anomalies.push(message);
  }

  /**
   * Validates preserved rollout JSONL files and reports truncated or malformed
   * lines without reconstructing missing live usage.
   */
  public async reconcileRollouts(paths: readonly string[]): Promise<void> {
    for (const target of [...new Set(paths)].sort()) {
      let bytes: Buffer;
      try {
        bytes = await fs.promises.readFile(target);
      } catch (error) {
        this.anomalies.push(
          `rollout unreadable ${target}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
      if (bytes.length !== 0 && bytes[bytes.length - 1] !== 0x0a)
        this.anomalies.push(
          `rollout has an incomplete trailing line: ${target}`,
        );
      const lines = bytes.toString("utf8").split("\n");
      for (let index = 0; index < lines.length - 1; ++index) {
        const line = lines[index]!;
        if (line.trim().length === 0) continue;
        try {
          JSON.parse(line);
        } catch (error) {
          this.anomalies.push(
            `rollout malformed JSON ${target}:${index + 1}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  /** Returns exact sums and non-fatal reconciliation differences. */
  public report(): IEvidenceBenchmarkCodexRecord.IUsageReport {
    const exactByThread: Record<
      string,
      IEvidenceBenchmarkCodexRecord.ITokenUsage
    > = {};
    let exactTotal = EvidenceBenchmarkCodexUsageLedger.zero();
    for (const response of this.responses.values()) {
      exactTotal = EvidenceBenchmarkCodexUsageLedger.add(
        exactTotal,
        response.usage,
      );
      exactByThread[response.threadId] = EvidenceBenchmarkCodexUsageLedger.add(
        exactByThread[response.threadId] ??
          EvidenceBenchmarkCodexUsageLedger.zero(),
        response.usage,
      );
    }
    const latestThreadUsage = Object.fromEntries(
      [...this.latestThreadUsage.entries()].sort(([left], [right]): number =>
        EvidenceBenchmarkCodexValue.utf8Compare(left, right),
      ),
    );
    const reconciliation: IEvidenceBenchmarkCodexRecord.IUsageDifference[] =
      Object.entries(exactByThread)
        .filter(
          ([threadId]): boolean => latestThreadUsage[threadId] !== undefined,
        )
        .map(
          ([
            threadId,
            exact,
          ]): IEvidenceBenchmarkCodexRecord.IUsageDifference => {
            const accumulated = latestThreadUsage[threadId]!.total;
            return {
              threadId,
              exact,
              accumulated,
              difference: EvidenceBenchmarkCodexUsageLedger.subtract(
                accumulated,
                exact,
              ),
            };
          },
        );
    const accumulatedUsageReconciled = reconciliation.every((entry): boolean =>
      Object.values(entry.difference).every((value): boolean => value === 0),
    );
    return {
      schemaVersion: 1,
      exactUsageComplete: this.exactUsageComplete,
      accumulatedUsageReconciled,
      responses: [...this.responses.values()],
      duplicateResponseIds: [...this.duplicateResponseIds],
      exactTotal,
      exactByThread,
      latestThreadUsage,
      reconciliation,
      anomalies: [...this.anomalies],
    };
  }

  /** Atomically writes the current exact usage and reconciliation report. */
  public async write(target: string): Promise<void> {
    await EvidenceBenchmarkCodexCheckpoint.write(target, this.report());
  }

  private ingestRawResponse(
    params: Readonly<Record<string, unknown>>,
    receivedAtUtc: string,
  ): void {
    const responseId = EvidenceBenchmarkCodexValue.string(
      params.responseId,
      "responseId",
    );
    if (!EvidenceBenchmarkCodexValue.isRecord(params.usage))
      throw new Error(`response ${responseId} has no exact usage`);
    const response: IEvidenceBenchmarkCodexRecord.IResponseUsage = {
      responseId,
      threadId: EvidenceBenchmarkCodexValue.string(params.threadId, "threadId"),
      turnId: EvidenceBenchmarkCodexValue.string(params.turnId, "turnId"),
      usage: EvidenceBenchmarkCodexUsageLedger.usage(
        params.usage,
        `response ${responseId}`,
      ),
      receivedAtUtc,
    };
    const existing = this.responses.get(responseId);
    if (existing !== undefined) {
      this.duplicateResponseIds.add(responseId);
      if (
        EvidenceBenchmarkCodexValue.canonicalJson({
          threadId: existing.threadId,
          turnId: existing.turnId,
          usage: existing.usage,
        }) !==
        EvidenceBenchmarkCodexValue.canonicalJson({
          threadId: response.threadId,
          turnId: response.turnId,
          usage: response.usage,
        })
      )
        this.exactUsageComplete = false;
      if (
        EvidenceBenchmarkCodexValue.canonicalJson({
          threadId: existing.threadId,
          turnId: existing.turnId,
          usage: existing.usage,
        }) !==
        EvidenceBenchmarkCodexValue.canonicalJson({
          threadId: response.threadId,
          turnId: response.turnId,
          usage: response.usage,
        })
      )
        this.anomalies.push(
          `rawResponse/completed: duplicate response ${responseId} changed payload`,
        );
      return;
    }
    this.responses.set(responseId, response);
  }

  private ingestThreadUsage(
    params: Readonly<Record<string, unknown>>,
    receivedAtUtc: string,
  ): void {
    if (!EvidenceBenchmarkCodexValue.isRecord(params.tokenUsage))
      throw new Error("tokenUsage must be an object");
    if (
      !EvidenceBenchmarkCodexValue.isRecord(params.tokenUsage.last) ||
      !EvidenceBenchmarkCodexValue.isRecord(params.tokenUsage.total)
    )
      throw new Error("tokenUsage requires last and total objects");
    const threadId = EvidenceBenchmarkCodexValue.string(
      params.threadId,
      "threadId",
    );
    this.latestThreadUsage.set(threadId, {
      threadId,
      turnId: EvidenceBenchmarkCodexValue.string(params.turnId, "turnId"),
      last: EvidenceBenchmarkCodexUsageLedger.usage(
        params.tokenUsage.last,
        `${threadId}.last`,
      ),
      total: EvidenceBenchmarkCodexUsageLedger.usage(
        params.tokenUsage.total,
        `${threadId}.total`,
      ),
      receivedAtUtc,
    });
  }

  private static usage(
    input: Readonly<Record<string, unknown>>,
    label: string,
  ): IEvidenceBenchmarkCodexRecord.ITokenUsage {
    const usage: IEvidenceBenchmarkCodexRecord.ITokenUsage = {
      totalTokens: EvidenceBenchmarkCodexValue.counter(
        input.totalTokens,
        `${label}.totalTokens`,
      ),
      inputTokens: EvidenceBenchmarkCodexValue.counter(
        input.inputTokens,
        `${label}.inputTokens`,
      ),
      cachedInputTokens: EvidenceBenchmarkCodexValue.counter(
        input.cachedInputTokens,
        `${label}.cachedInputTokens`,
      ),
      cacheWriteInputTokens: EvidenceBenchmarkCodexValue.counter(
        input.cacheWriteInputTokens,
        `${label}.cacheWriteInputTokens`,
        0,
      ),
      outputTokens: EvidenceBenchmarkCodexValue.counter(
        input.outputTokens,
        `${label}.outputTokens`,
      ),
      reasoningOutputTokens: EvidenceBenchmarkCodexValue.counter(
        input.reasoningOutputTokens,
        `${label}.reasoningOutputTokens`,
      ),
    };
    if (usage.cachedInputTokens > usage.inputTokens)
      throw new Error(
        `${label}.cachedInputTokens exceeds inclusive inputTokens`,
      );
    return usage;
  }

  private static zero(): IEvidenceBenchmarkCodexRecord.ITokenUsage {
    return {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
    };
  }

  private static add(
    left: IEvidenceBenchmarkCodexRecord.ITokenUsage,
    right: IEvidenceBenchmarkCodexRecord.ITokenUsage,
  ): IEvidenceBenchmarkCodexRecord.ITokenUsage {
    return {
      totalTokens: left.totalTokens + right.totalTokens,
      inputTokens: left.inputTokens + right.inputTokens,
      cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
      cacheWriteInputTokens:
        left.cacheWriteInputTokens + right.cacheWriteInputTokens,
      outputTokens: left.outputTokens + right.outputTokens,
      reasoningOutputTokens:
        left.reasoningOutputTokens + right.reasoningOutputTokens,
    };
  }

  private static subtract(
    left: IEvidenceBenchmarkCodexRecord.ITokenUsage,
    right: IEvidenceBenchmarkCodexRecord.ITokenUsage,
  ): IEvidenceBenchmarkCodexRecord.ITokenUsage {
    return {
      totalTokens: left.totalTokens - right.totalTokens,
      inputTokens: left.inputTokens - right.inputTokens,
      cachedInputTokens: left.cachedInputTokens - right.cachedInputTokens,
      cacheWriteInputTokens:
        left.cacheWriteInputTokens - right.cacheWriteInputTokens,
      outputTokens: left.outputTokens - right.outputTokens,
      reasoningOutputTokens:
        left.reasoningOutputTokens - right.reasoningOutputTokens,
    };
  }
}
