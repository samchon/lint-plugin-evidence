import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityCodebook } from "./EvidenceBenchmarkActivityCodebook.ts";
import type { IEvidenceBenchmarkActivity } from "./IEvidenceBenchmarkActivity.ts";

/** Builds an exact observation artifact from retained core-seal bytes. */
export namespace EvidenceBenchmarkActivityObservations {
  /** Byte-bound inputs supplied by the runner-to-attribution adapter. */
  export interface IInput {
    binding: IEvidenceBenchmarkActivity.IBinding;
    parentCoreSealBytes: Uint8Array;
    sourceUsageLedgerBytes: Uint8Array;
    wall: IEvidenceBenchmarkActivity.IWallInterval;
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[];
    items: readonly IEvidenceBenchmarkActivity.IItemObservation[];
  }

  /**
   * Validates exact counters and item lifecycle evidence without classifying
   * it.
   *
   * The source usage ledger must expose a top-level `responses` array. Its rows
   * are compared with the supplied observation rows, so an adapter cannot
   * silently replace or omit a counter while retaining the original digest.
   */
  export function create(
    input: IInput,
  ): IEvidenceBenchmarkActivity.IObservations {
    binding(input.binding);
    exactDigest(
      input.parentCoreSealBytes,
      input.binding.parentCoreSealSha256,
      "parent core seal",
    );
    exactDigest(
      input.sourceUsageLedgerBytes,
      input.binding.sourceUsageLedgerSha256,
      "source usage ledger",
    );
    wall(input.wall);
    const ledgerResponses: readonly unknown[] = sourceResponses(
      input.sourceUsageLedgerBytes,
    );
    responses(input.responses, ledgerResponses);
    items(input.items, input.responses, input.wall);
    const body = {
      schemaVersion: 1 as const,
      binding: input.binding,
      wall: input.wall,
      responses: input.responses,
      items: input.items,
    };
    return {
      ...body,
      observationSha256: EvidenceBenchmarkActivityCanonical.object(body),
    };
  }

  /** Verifies immutable artifact identities and the frozen codebook digest. */
  export function binding(input: IEvidenceBenchmarkActivity.IBinding): void {
    if (input.schemaVersion !== 1)
      throw new Error("Activity binding schemaVersion must be 1.");
    if (
      input.exactByteDigestAlgorithm !== "sha256(exact-bytes)" ||
      input.canonicalObjectDigestAlgorithm !==
        "sha256(utf8-bytewise-key-order-json-lf)"
    )
      throw new Error("Activity binding digest algorithms are not frozen.");
    for (const [key, value] of Object.entries(input)) {
      if (!key.endsWith("Sha256")) continue;
      if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
        throw new Error(`${key} must be a lowercase SHA-256.`);
    }
    if (input.runId.length === 0 || input.blockId.length === 0)
      throw new Error("Activity binding requires non-empty run and block IDs.");
    if (input.codebookSha256 !== EvidenceBenchmarkActivityCodebook.SHA256)
      throw new Error("Activity binding does not use the frozen codebook.");
  }

  /** Returns the exact and derived counter vector after arithmetic admission. */
  export function tokenVector(
    usage: Omit<
      IEvidenceBenchmarkActivity.ITokenVector,
      "normalizedNonCachedInputTokens"
    >,
  ): IEvidenceBenchmarkActivity.ITokenVector {
    const fields: readonly (keyof typeof usage)[] = [
      "inputTokens",
      "cachedInputTokens",
      "cacheWriteInputTokens",
      "outputTokens",
      "reasoningOutputTokens",
      "totalTokens",
    ];
    for (const field of fields)
      if (!Number.isSafeInteger(usage[field]) || usage[field] < 0)
        throw new Error(`${field} must be a nonnegative safe integer.`);
    if (
      usage.cachedInputTokens + usage.cacheWriteInputTokens >
      usage.inputTokens
    )
      throw new Error(
        "Cache-read and cache-write tokens exceed inclusive input.",
      );
    if (usage.totalTokens !== usage.inputTokens + usage.outputTokens)
      throw new Error("Provider total must equal inclusive input plus output.");
    if (usage.reasoningOutputTokens > usage.outputTokens)
      throw new Error("Reasoning output must be a subset of output.");
    return {
      ...usage,
      normalizedNonCachedInputTokens:
        usage.inputTokens -
        usage.cachedInputTokens -
        usage.cacheWriteInputTokens,
    };
  }

  function sourceResponses(bytes: Uint8Array): readonly unknown[] {
    const root: unknown = JSON.parse(Buffer.from(bytes).toString("utf8"));
    if (typeof root !== "object" || root === null || Array.isArray(root))
      throw new Error("Source usage ledger must be an object.");
    const result: unknown = (root as Record<string, unknown>).responses;
    if (!Array.isArray(result))
      throw new Error("Source usage ledger must expose a responses array.");
    return result;
  }

  function responses(
    observations: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
    ledger: readonly unknown[],
  ): void {
    if (observations.length !== ledger.length)
      throw new Error(
        "Activity observations and source usage ledger response counts differ.",
      );
    const observed: Map<string, IEvidenceBenchmarkActivity.IResponseUsage> =
      uniqueResponses(observations);
    const sourceIds: Set<string> = new Set();
    for (const [index, input] of ledger.entries()) {
      const row: Record<string, unknown> = record(
        input,
        `source responses[${index}]`,
      );
      const responseId: string = text(
        row.responseId,
        `source responses[${index}].responseId`,
      );
      if (sourceIds.has(responseId))
        throw new Error(`Duplicate source response ID: ${responseId}`);
      sourceIds.add(responseId);
      const counterpart: IEvidenceBenchmarkActivity.IResponseUsage | undefined =
        observed.get(responseId);
      if (counterpart === undefined)
        throw new Error(
          `Source response ${responseId} has no activity observation.`,
        );
      if (
        row.threadId !== counterpart.threadId ||
        row.turnId !== counterpart.turnId
      )
        throw new Error(
          `Source response ${responseId} thread or turn identity differs.`,
        );
      if (counterpart.usage === null) {
        if (row.usage !== null)
          throw new Error(
            `Response ${responseId} dropped non-null exact source usage.`,
          );
      } else {
        const exact: IEvidenceBenchmarkActivity.ITokenVector = tokenVector(
          counterpart.usage,
        );
        const source: Record<string, unknown> = record(
          row.usage,
          `source response ${responseId}.usage`,
        );
        for (const field of [
          "inputTokens",
          "cachedInputTokens",
          "cacheWriteInputTokens",
          "outputTokens",
          "reasoningOutputTokens",
          "totalTokens",
        ] as const)
          if (source[field] !== exact[field])
            throw new Error(
              `Source response ${responseId} differs at ${field}.`,
            );
      }
      text(counterpart.rawEventId, `${responseId}.rawEventId`);
      nanoseconds(
        counterpart.receivedMonotonicNs,
        `${responseId}.receivedMonotonicNs`,
      );
      if (!Number.isFinite(Date.parse(counterpart.receivedAtUtc)))
        throw new Error(`${responseId}.receivedAtUtc is not a date-time.`);
    }
  }

  function uniqueResponses(
    input: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
  ): Map<string, IEvidenceBenchmarkActivity.IResponseUsage> {
    const result: Map<string, IEvidenceBenchmarkActivity.IResponseUsage> =
      new Map();
    for (const response of input) {
      text(response.responseId, "responseId");
      if (result.has(response.responseId))
        throw new Error(
          `Duplicate observed response ID: ${response.responseId}`,
        );
      result.set(response.responseId, response);
    }
    return result;
  }

  function items(
    observations: readonly IEvidenceBenchmarkActivity.IItemObservation[],
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
    interval: IEvidenceBenchmarkActivity.IWallInterval,
  ): void {
    const responseIds: Set<string> = new Set(
      responses.map((response) => response.responseId),
    );
    const observationIds: Set<string> = new Set();
    const tupleIds: Set<string> = new Set();
    const wallStart: bigint = nanoseconds(
      interval.startedMonotonicNs,
      "wall start",
    );
    const wallEnd: bigint = nanoseconds(
      interval.completedMonotonicNs,
      "wall completion",
    );
    for (const item of observations) {
      text(item.observationId, "observationId");
      if (observationIds.has(item.observationId))
        throw new Error(`Duplicate item observation ID: ${item.observationId}`);
      observationIds.add(item.observationId);
      const tuple: string = `${item.threadId}\0${item.turnId}\0${item.itemId}`;
      if (tupleIds.has(tuple))
        throw new Error(
          `Duplicate item lifecycle tuple: ${item.threadId}/${item.turnId}/${item.itemId}`,
        );
      tupleIds.add(tuple);
      const started: bigint | null =
        item.startedReceiptMonotonicNs === null
          ? null
          : nanoseconds(
              item.startedReceiptMonotonicNs,
              `${item.observationId}.startedReceiptMonotonicNs`,
            );
      const completed: bigint | null =
        item.completedReceiptMonotonicNs === null
          ? null
          : nanoseconds(
              item.completedReceiptMonotonicNs,
              `${item.observationId}.completedReceiptMonotonicNs`,
            );
      if (started !== null && (started < wallStart || started > wallEnd))
        throw new Error(`${item.observationId} starts outside cell wall.`);
      if (completed !== null && (completed < wallStart || completed > wallEnd))
        throw new Error(`${item.observationId} completes outside cell wall.`);
      if (started !== null && completed !== null && completed < started)
        throw new Error(`${item.observationId} completes before it starts.`);
      sourceTime(
        item.startedAtSourceMs,
        `${item.observationId}.startedAtSourceMs`,
      );
      sourceTime(
        item.completedAtSourceMs,
        `${item.observationId}.completedAtSourceMs`,
      );
      if (
        item.startedAtSourceMs !== null &&
        item.completedAtSourceMs !== null &&
        item.completedAtSourceMs < item.startedAtSourceMs
      )
        throw new Error(`${item.observationId} source lifecycle is reversed.`);
      sourceTime(
        item.sourceDurationMs,
        `${item.observationId}.sourceDurationMs`,
      );
      if (item.linkage === "ordered_epoch") {
        if (
          item.linkedResponseId === null ||
          !responseIds.has(item.linkedResponseId)
        )
          throw new Error(
            `${item.observationId} ordered epoch lacks a known response.`,
          );
      } else if (item.linkedResponseId !== null)
        throw new Error(
          `${item.observationId} ambiguous or unlinked item cannot force a response join.`,
        );
      if (new Set(item.rawEventIds).size !== item.rawEventIds.length)
        throw new Error(`${item.observationId} repeats a raw event ID.`);
      item.rawEventIds.forEach((eventId) =>
        text(eventId, `${item.observationId}.rawEventIds`),
      );
    }
  }

  function wall(input: IEvidenceBenchmarkActivity.IWallInterval): void {
    const start: bigint = nanoseconds(
      input.startedMonotonicNs,
      "wall.startedMonotonicNs",
    );
    const completion: bigint = nanoseconds(
      input.completedMonotonicNs,
      "wall.completedMonotonicNs",
    );
    if (completion <= start)
      throw new Error("Activity observation wall must have positive duration.");
  }

  function exactDigest(
    bytes: Uint8Array,
    expected: string,
    label: string,
  ): void {
    if (EvidenceBenchmarkActivityCanonical.sha256(bytes) !== expected)
      throw new Error(`${label} bytes do not match the immutable binding.`);
  }

  function record(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be an object.`);
    return input as Record<string, unknown>;
  }

  function text(input: unknown, label: string): string {
    if (typeof input !== "string" || input.length === 0)
      throw new Error(`${label} must be a non-empty string.`);
    return input;
  }

  function nanoseconds(input: string, label: string): bigint {
    if (!/^(0|[1-9][0-9]*)$/.test(input))
      throw new Error(`${label} must be unsigned integer nanoseconds.`);
    return BigInt(input);
  }

  function sourceTime(input: number | null, label: string): void {
    if (input !== null && (!Number.isSafeInteger(input) || input < 0))
      throw new Error(`${label} must be null or nonnegative integer ms.`);
  }
}
