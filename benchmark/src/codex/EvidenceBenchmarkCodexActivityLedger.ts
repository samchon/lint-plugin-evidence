import path from "node:path";

import type { IEvidenceBenchmarkCodexRecord } from "../structures/IEvidenceBenchmarkCodexRecord.ts";
import { EvidenceBenchmarkCodexCheckpoint } from "./EvidenceBenchmarkCodexCheckpoint.ts";
import { EvidenceBenchmarkCodexValue } from "./EvidenceBenchmarkCodexValue.ts";

/**
 * Keeps exact tool durations, heuristic activity labels, and AI estimates in
 * one ledger without allowing estimates into exact token or time totals.
 */
export class EvidenceBenchmarkCodexActivityLedger {
  private readonly activities: IEvidenceBenchmarkCodexRecord.IActivity[] = [];

  /**
   * Restores prior annotations in append order.
   *
   * @param recovered Previously checkpointed annotations.
   */
  public constructor(
    recovered: readonly IEvidenceBenchmarkCodexRecord.IActivity[] = [],
  ) {
    this.activities.push(...recovered);
  }

  /** Classifies one completed tool item while retaining exact exposed duration. */
  public ingest(
    method: string,
    params: Readonly<Record<string, unknown>>,
    observedAtUtc: string,
  ): void {
    if (method !== "item/completed") return;
    if (!EvidenceBenchmarkCodexValue.isRecord(params.item)) return;
    const item = params.item;
    const itemType = typeof item.type === "string" ? item.type : "unknown";
    if (
      ![
        "commandExecution",
        "mcpToolCall",
        "dynamicToolCall",
        "webSearch",
        "fileChange",
      ].includes(itemType)
    )
      return;
    const command =
      typeof item.command === "string"
        ? item.command
        : Array.isArray(item.command)
          ? item.command.join(" ")
          : "";
    const classified =
      itemType === "commandExecution"
        ? EvidenceBenchmarkCodexActivityLedger.classifyCommand(command)
        : { category: "tool" as const, confidence: 1, basis: itemType };
    this.activities.push({
      sequence: this.activities.length + 1,
      threadId:
        typeof params.threadId === "string" ? params.threadId : undefined,
      turnId: typeof params.turnId === "string" ? params.turnId : undefined,
      itemId: typeof item.id === "string" ? item.id : undefined,
      category: classified.category,
      measurement:
        itemType === "commandExecution"
          ? "heuristic-classification"
          : "exact-event",
      confidence: classified.confidence,
      observedAtUtc,
      exactDurationMs:
        typeof item.durationMs === "number" &&
        Number.isSafeInteger(item.durationMs) &&
        item.durationMs >= 0
          ? item.durationMs
          : undefined,
      basis: classified.basis,
    });
  }

  /**
   * Appends an AI-derived estimate that downstream reducers must never merge
   * into exact usage or duration totals.
   */
  public estimate(
    activity: Omit<
      IEvidenceBenchmarkCodexRecord.IActivity,
      "sequence" | "measurement" | "observedAtUtc"
    >,
  ): void {
    if (
      activity.estimatedDurationMs === undefined &&
      activity.estimatedTokens === undefined
    )
      throw new Error("AI estimate requires an estimated duration or tokens");
    this.activities.push({
      ...activity,
      sequence: this.activities.length + 1,
      measurement: "ai-estimate",
      observedAtUtc: new Date().toISOString(),
    });
  }

  /** Returns annotations in immutable append order. */
  public report(): IEvidenceBenchmarkCodexRecord.IActivity[] {
    return this.activities.map(
      (activity): IEvidenceBenchmarkCodexRecord.IActivity => ({ ...activity }),
    );
  }

  /** Atomically writes the annotation report. */
  public async write(target: string): Promise<void> {
    await EvidenceBenchmarkCodexCheckpoint.write(target, {
      schemaVersion: 1,
      activities: this.report(),
    });
  }

  private static classifyCommand(command: string): {
    category: IEvidenceBenchmarkCodexRecord.ActivityCategory;
    confidence: number;
    basis: string;
  } {
    const normalized = command.replaceAll("\\", "/");
    if (/(^|\/)(?:SKILL|AGENTS)\.md\b/i.test(normalized))
      return {
        category: "skill",
        confidence: 0.98,
        basis: `skill-instruction read: ${path.basename(normalized)}`,
      };
    if (/\b(?:test|vitest|jest|playwright|go test)\b/i.test(command))
      return {
        category: "test",
        confidence: 0.9,
        basis: `test command: ${command}`,
      };
    if (/\b(?:build|tsc|ttsc|compile|lint|check)\b/i.test(command))
      return {
        category: "build",
        confidence: 0.85,
        basis: `build or static gate command: ${command}`,
      };
    if (/\b(?:requirements?|docs\/analysis|specification)\b/i.test(normalized))
      return {
        category: "requirement",
        confidence: 0.8,
        basis: `requirement inspection: ${command}`,
      };
    if (/\b(?:apply_patch|write|mkdir|new-item|cp|copy-item)\b/i.test(command))
      return {
        category: "implementation",
        confidence: 0.7,
        basis: `workspace mutation command: ${command}`,
      };
    return {
      category: "tool",
      confidence: 0.5,
      basis: `unclassified command tool: ${command}`,
    };
  }
}
