import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";
import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityCodebook } from "./EvidenceBenchmarkActivityCodebook.ts";
import { EvidenceBenchmarkActivityJcs } from "./EvidenceBenchmarkActivityJcs.ts";
import { EvidenceBenchmarkActivityRegistry } from "./EvidenceBenchmarkActivityRegistry.ts";
import { EvidenceBenchmarkActivityStrictJson } from "./EvidenceBenchmarkActivityStrictJson.ts";
import { EvidenceBenchmarkActivityVendorSchemas } from "./EvidenceBenchmarkActivityVendorSchemas.ts";
import type { IEvidenceBenchmarkActivity } from "./IEvidenceBenchmarkActivity.ts";

/** Builds an exact observation artifact from retained core-seal bytes. */
export namespace EvidenceBenchmarkActivityObservations {
  /** Byte-bound inputs supplied by the runner-to-attribution adapter. */
  export interface IInput {
    /** Frozen protocol root containing the exact provider output registry. */
    protocolRoot: string;

    /** Immutable identities shared by every downstream artifact. */
    binding: IEvidenceBenchmarkActivity.IBinding;

    /** Exact retained parent core-seal bytes. */
    parentCoreSealBytes: Uint8Array;

    /** Exact retained immutable outer run-manifest bytes. */
    runManifestBytes: Uint8Array;

    /** Exact retained materialization-manifest bytes. */
    materializationManifestBytes: Uint8Array;

    /** Exact retained source usage-ledger bytes. */
    sourceUsageLedgerBytes: Uint8Array;

    /** Exact retained append-only semantic event-ledger bytes. */
    sourceEventLedgerBytes: Uint8Array;

    /** Exact retained raw app-server frame-ledger bytes. */
    sourceRawServerLedgerBytes: Uint8Array;

    /** Exact retained runner-owned activity lifecycle-ledger bytes. */
    sourceActivityLedgerBytes: Uint8Array;

    /** Exact frozen raw-response notification schema bytes. */
    rawResponseCompletedSchemaBytes: Uint8Array;

    /** Exact frozen item-started notification schema bytes. */
    itemStartedSchemaBytes: Uint8Array;

    /** Exact frozen item-completed notification schema bytes. */
    itemCompletedSchemaBytes: Uint8Array;

    /** Complete cell wall in monotonic nanoseconds. */
    wall: IEvidenceBenchmarkActivity.IWallInterval;

    /** Ordered contiguous runner segment partition of the complete cell wall. */
    phaseSegments: readonly IEvidenceBenchmarkActivity.IPhaseSegment[];

    /** One exact observation per source usage-ledger row. */
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[];

    /** Exact or censored item lifecycle observations. */
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
    registry(input);
    exactDigest(
      input.parentCoreSealBytes,
      input.binding.parentCoreSealSha256,
      "parent core seal",
    );
    exactDigest(
      input.runManifestBytes,
      input.binding.runManifestSha256,
      "run manifest",
    );
    exactDigest(
      input.materializationManifestBytes,
      input.binding.materializationManifestSha256,
      "materialization manifest",
    );
    exactDigest(
      input.sourceUsageLedgerBytes,
      input.binding.sourceUsageLedgerSha256,
      "source usage ledger",
    );
    exactDigest(
      input.sourceEventLedgerBytes,
      input.binding.sourceEventLedgerSha256,
      "source event ledger",
    );
    exactDigest(
      input.sourceRawServerLedgerBytes,
      input.binding.sourceRawServerLedgerSha256,
      "source raw server ledger",
    );
    if (input.sourceRawServerLedgerBytes.at(-1) !== 0x0a)
      throw new Error("Source raw server ledger must end with LF.");
    exactDigest(
      input.sourceActivityLedgerBytes,
      input.binding.sourceActivityLedgerSha256,
      "source activity ledger",
    );
    const retainedRun: IRetainedRun = retainedChain(input);
    wall(input.wall);
    phaseSegments(input.phaseSegments, input.wall);
    const ledger: ISourceLedger = sourceLedger(
      input.protocolRoot,
      input.sourceUsageLedgerBytes,
    );
    const eventLedger: IEventLedger = events(
      input.protocolRoot,
      input.sourceEventLedgerBytes,
      input.binding,
      retainedRun,
    );
    const rawNotifications: IRawNotificationInventory = rawInventory(
      eventLedger,
      input.sourceRawServerLedgerBytes,
    );
    const activityLedger: IActivityLedger = activity(
      input.protocolRoot,
      input.sourceActivityLedgerBytes,
      input.binding,
      input.wall,
      input.phaseSegments,
      input.items,
      input.responses.length,
    );
    responses(
      input.responses,
      ledger.responses,
      eventLedger,
      input.phaseSegments,
      input.sourceRawServerLedgerBytes,
      input.rawResponseCompletedSchemaBytes,
    );
    items(
      input.items,
      input.responses,
      input.wall,
      eventLedger,
      input.phaseSegments,
      input.sourceRawServerLedgerBytes,
      input.itemStartedSchemaBytes,
      input.itemCompletedSchemaBytes,
    );
    rawEventOwnership(input.responses, input.items);
    notificationCoverage(rawNotifications, input.responses, input.items);
    const body = {
      schemaVersion: 1 as const,
      binding: input.binding,
      wall: input.wall,
      phaseSegments: input.phaseSegments,
      responses: input.responses,
      sourceExactUsageComplete: ledger.exactUsageComplete,
      sourceEventCaptureComplete: activityLedger.eventCaptureComplete,
      sourceEventChainClosed: activityLedger.eventChainClosed,
      eventIds: [...eventLedger.eventIds],
      sourceRawServerLedgerSha256: input.binding.sourceRawServerLedgerSha256,
      sourceActivityCaptureComplete: activityLedger.activityCaptureComplete,
      sourceActivityLedgerClosed: activityLedger.activityLedgerClosed,
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
        "sha256(utf8-bytewise-key-order-json-lf)" ||
      input.frozenInputTreeAlgorithm !== "sha256-posix-path-nul-bytes-v1"
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

  interface ISourceLedger {
    exactUsageComplete: boolean;
    responses: readonly unknown[];
  }

  interface IEventLedger {
    eventIds: ReadonlySet<string>;
    events: ReadonlyMap<string, Record<string, unknown>>;
    ordered: readonly Record<string, unknown>[];
  }

  interface IRawNotificationInventory {
    responses: ReadonlySet<string>;
    items: ReadonlySet<string>;
  }

  interface IActivityLedger {
    eventCaptureComplete: boolean;
    eventChainClosed: boolean;
    activityCaptureComplete: boolean;
    activityLedgerClosed: boolean;
  }

  interface IRetainedRun {
    codexCliVersion: string;
    codexExecutableSha256: string;
  }

  function sourceLedger(
    protocolRoot: string,
    bytes: Uint8Array,
  ): ISourceLedger {
    const root: unknown = EvidenceBenchmarkProtocolValidator.validateBytes(
      protocolRoot,
      "usage-report.schema.json",
      bytes,
      "source usage ledger",
    );
    if (typeof root !== "object" || root === null || Array.isArray(root))
      throw new Error("Source usage ledger must be an object.");
    const source: Record<string, unknown> = root as Record<string, unknown>;
    if (typeof source.exactUsageComplete !== "boolean")
      throw new Error(
        "Source usage ledger must expose exactUsageComplete as a boolean.",
      );
    const result: unknown = source.responses;
    if (!Array.isArray(result))
      throw new Error("Source usage ledger must expose a responses array.");
    const rows: Record<string, unknown>[] = result.map((row, index) =>
      record(row, `source responses[${index}]`),
    );
    const exactUsageComplete: boolean = rows.every((row) => row.usage !== null);
    if (source.exactUsageComplete !== exactUsageComplete)
      throw new Error(
        "Source usage completeness differs from its response population.",
      );
    if (
      !Array.isArray(source.duplicateResponseIds) ||
      source.duplicateResponseIds.length !== 0
    )
      throw new Error("Source usage ledger retains duplicate response IDs.");
    const total: Record<string, number> = sourceTokenZero();
    const byThread: Record<string, Record<string, number>> = {};
    for (const [index, row] of rows.entries()) {
      if (row.usage === null) continue;
      const usage: Record<string, unknown> = record(
        row.usage,
        `source responses[${index}].usage`,
      );
      const threadId: string = text(
        row.threadId,
        `source responses[${index}].threadId`,
      );
      const thread: Record<string, number> =
        byThread[threadId] ?? sourceTokenZero();
      for (const field of SOURCE_TOKEN_FIELDS) {
        const value: unknown = usage[field];
        if (!Number.isSafeInteger(value) || (value as number) < 0)
          throw new Error(
            `source responses[${index}].usage.${field} is invalid.`,
          );
        total[field] = total[field]! + (value as number);
        thread[field] = thread[field]! + (value as number);
      }
      byThread[threadId] = thread;
    }
    if (
      EvidenceBenchmarkActivityCanonical.stringify(source.exactTotal) !==
        EvidenceBenchmarkActivityCanonical.stringify(total) ||
      EvidenceBenchmarkActivityCanonical.stringify(source.exactByThread) !==
        EvidenceBenchmarkActivityCanonical.stringify(byThread)
    )
      throw new Error(
        "Source usage aggregate counters differ from exact responses.",
      );
    return {
      exactUsageComplete: source.exactUsageComplete,
      responses: result,
    };
  }

  function retainedChain(input: IInput): IRetainedRun {
    const core: Record<string, unknown> =
      EvidenceBenchmarkProtocolValidator.validateBytes(
        input.protocolRoot,
        "core-seal.schema.json",
        input.parentCoreSealBytes,
        "parent core seal",
      );
    if (
      core.schemaVersion !== 1 ||
      core.runId !== input.binding.runId ||
      core.manifestSha256 !== input.binding.runManifestSha256 ||
      core.usageReportSha256 !== input.binding.sourceUsageLedgerSha256 ||
      core.eventChainHeadSha256 !== input.binding.eventChainTerminalSha256 ||
      core.rawServerLedgerSha256 !==
        input.binding.sourceRawServerLedgerSha256 ||
      core.activityLedgerSha256 !== input.binding.sourceActivityLedgerSha256
    )
      throw new Error(
        "Parent core seal does not bind this run manifest, usage ledger, event chain, and activity ledger.",
      );
    const run: Record<string, unknown> =
      EvidenceBenchmarkProtocolValidator.validateBytes(
        input.protocolRoot,
        "run-manifest.schema.json",
        input.runManifestBytes,
        "run manifest",
      );
    const experiment: Record<string, unknown> = record(
      run.experiment,
      "run manifest experiment",
    );
    const runner: Record<string, unknown> = record(
      run.runner,
      "run manifest runner",
    );
    if (
      experiment.runId !== input.binding.runId ||
      experiment.blockId !== input.binding.blockId ||
      experiment.subject !== input.binding.subject ||
      experiment.arm !== input.binding.arm ||
      experiment.replicate !== input.binding.replicate ||
      experiment.projectInputSha256 !==
        input.binding.materializationInputSha256 ||
      experiment.protocolRawTreeSha256 !==
        input.binding.protocolRevisionSha256 ||
      runner.providerOutputRegistrySha256 !==
        input.binding.providerOutputRegistrySha256 ||
      runner.activityProcessIdentitySchemaSha256 !==
        input.binding.activityProcessIdentitySchemaSha256 ||
      runner.activityExecutionSchemaSha256 !==
        input.binding.activityExecutionSchemaSha256
    )
      throw new Error(
        "Run manifest does not bind this run, block, protocol, registry, and materialization input.",
      );
    const materialization: Record<string, unknown> = jsonObject(
      input.materializationManifestBytes,
      "materialization manifest",
    );
    for (const [field, expected] of [
      ["schemaVersion", 2],
      ["treeAlgorithm", input.binding.frozenInputTreeAlgorithm],
      ["baseTreeSha256", input.binding.baseTreeSha256],
      ["armTreeSha256", input.binding.armTreeSha256],
      ["requirementsTreeSha256", input.binding.requirementsTreeSha256],
      ["workspaceTreeSha256", input.binding.workspaceTreeSha256],
      ["inputSha256", input.binding.materializationInputSha256],
    ] as const)
      if (materialization[field] !== expected)
        throw new Error(
          `Materialization manifest differs at ${String(field)}.`,
        );
    return {
      codexCliVersion: text(runner.codexCliVersion, "runner codexCliVersion"),
      codexExecutableSha256: sha256(
        runner.codexExecutableSha256,
        "runner codexExecutableSha256",
      ),
    };
  }

  function registry(input: IInput): void {
    const admitted: EvidenceBenchmarkActivityRegistry.IBinding =
      EvidenceBenchmarkActivityRegistry.admit(input.protocolRoot);
    for (const [field, expected] of [
      ["registrySha256", input.binding.providerOutputRegistrySha256],
      [
        "activityRatingProviderSchemaSha256",
        input.binding.activityRatingProviderSchemaSha256,
      ],
      [
        "activityRatingLocalSchemaSha256",
        input.binding.activityRatingLocalSchemaSha256,
      ],
      [
        "adjudicationProviderSchemaSha256",
        input.binding.adjudicationProviderSchemaSha256,
      ],
      [
        "adjudicationLocalSchemaSha256",
        input.binding.adjudicationLocalSchemaSha256,
      ],
    ] as const)
      if (admitted[field] !== expected)
        throw new Error(`Activity registry binding differs at ${field}.`);
  }

  function responses(
    observations: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
    ledger: readonly unknown[],
    eventLedger: IEventLedger,
    segments: readonly IEvidenceBenchmarkActivity.IPhaseSegment[],
    rawServerLedgerBytes: Uint8Array,
    rawResponseSchemaBytes: Uint8Array,
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
        row.turnId !== counterpart.turnId ||
        row.phase !== counterpart.phase ||
        row.phaseSegmentId !== counterpart.phaseSegmentId ||
        row.receivedAtUtc !== counterpart.receivedAtUtc ||
        row.receivedMonotonicNs !== counterpart.receivedMonotonicNs ||
        row.rawEventId !== counterpart.rawEventId
      )
        throw new Error(`Source response ${responseId} provenance differs.`);
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
      const responseFrame: IRawFrame = rawFrame(
        eventLedger,
        counterpart.rawEventId,
        rawServerLedgerBytes,
        "rawResponse/completed",
        `source response ${responseId}`,
      );
      EvidenceBenchmarkActivityVendorSchemas.admitRawResponse(
        rawResponseSchemaBytes,
        responseFrame.params,
      );
      exactKeys(
        responseFrame.params,
        ["responseId", "threadId", "turnId", "usage"],
        `source response ${responseId} raw params`,
      );
      if (
        responseFrame.event.monotonicNs !== counterpart.receivedMonotonicNs ||
        responseFrame.event.utc !== counterpart.receivedAtUtc ||
        responseFrame.params.responseId !== counterpart.responseId ||
        responseFrame.params.threadId !== counterpart.threadId ||
        responseFrame.params.turnId !== counterpart.turnId ||
        EvidenceBenchmarkActivityCanonical.stringify(
          responseFrame.params.usage,
        ) !== EvidenceBenchmarkActivityCanonical.stringify(counterpart.usage)
      )
        throw new Error(
          `Source response ${responseId} raw notification provenance differs.`,
        );
      nanoseconds(
        counterpart.receivedMonotonicNs,
        `${responseId}.receivedMonotonicNs`,
      );
      const segment: IEvidenceBenchmarkActivity.IPhaseSegment | undefined =
        segments.find(
          (row) => row.phaseSegmentId === counterpart.phaseSegmentId,
        );
      if (
        segment === undefined ||
        segment.phase !== counterpart.phase ||
        BigInt(counterpart.receivedMonotonicNs) <
          BigInt(segment.wall.startedMonotonicNs) ||
        BigInt(counterpart.receivedMonotonicNs) >
          BigInt(segment.wall.completedMonotonicNs)
      )
        throw new Error(
          `Source response ${responseId} is outside its exact phase segment.`,
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

  function rawEventOwnership(
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
    items: readonly IEvidenceBenchmarkActivity.IItemObservation[],
  ): void {
    const owners: Map<string, string> = new Map();
    const claim = (eventId: string, owner: string): void => {
      const prior: string | undefined = owners.get(eventId);
      if (prior !== undefined)
        throw new Error(
          `Raw event ${eventId} is claimed by both ${prior} and ${owner}.`,
        );
      owners.set(eventId, owner);
    };
    for (const response of responses)
      claim(response.rawEventId, `response ${response.responseId}`);
    for (const item of items)
      for (const eventId of item.rawEventIds)
        claim(eventId, `item ${item.observationId}`);
  }

  function notificationCoverage(
    inventory: IRawNotificationInventory,
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
    items: readonly IEvidenceBenchmarkActivity.IItemObservation[],
  ): void {
    exactSet(
      inventory.responses,
      new Set(responses.map((response) => response.rawEventId)),
      "rawResponse/completed notification coverage",
    );
    exactSet(
      inventory.items,
      new Set(items.flatMap((item) => item.rawEventIds)),
      "item lifecycle notification coverage",
    );
  }

  function items(
    observations: readonly IEvidenceBenchmarkActivity.IItemObservation[],
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
    interval: IEvidenceBenchmarkActivity.IWallInterval,
    eventLedger: IEventLedger,
    segments: readonly IEvidenceBenchmarkActivity.IPhaseSegment[],
    rawServerLedgerBytes: Uint8Array,
    itemStartedSchemaBytes: Uint8Array,
    itemCompletedSchemaBytes: Uint8Array,
  ): void {
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
      const segment: IEvidenceBenchmarkActivity.IPhaseSegment | undefined =
        segments.find((row) => row.phaseSegmentId === item.phaseSegmentId);
      if (
        segment === undefined ||
        segment.phase !== item.phase ||
        (started !== null &&
          started < BigInt(segment.wall.startedMonotonicNs)) ||
        (completed !== null &&
          completed > BigInt(segment.wall.completedMonotonicNs))
      )
        throw new Error(
          `${item.observationId} is outside its exact phase segment.`,
        );
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
      const expectedEventCount: number =
        (started === null ? 0 : 1) + (completed === null ? 0 : 1);
      if (expectedEventCount === 0)
        throw new Error(
          `${item.observationId} has no observed lifecycle endpoint.`,
        );
      const derivedLinkage = deriveLinkage(item, responses);
      if (
        item.linkage !== derivedLinkage.linkage ||
        item.linkedResponseId !== derivedLinkage.responseId
      )
        throw new Error(
          `${item.observationId} response linkage differs from ordered raw epochs.`,
        );
      if (new Set(item.rawEventIds).size !== item.rawEventIds.length)
        throw new Error(`${item.observationId} repeats a raw event ID.`);
      if (item.rawEventIds.length !== expectedEventCount)
        throw new Error(
          `${item.observationId} raw event count differs from its lifecycle endpoints.`,
        );
      let rawEventIndex: number = 0;
      if (started !== null) {
        const startedFrame: IRawFrame = rawFrame(
          eventLedger,
          text(
            item.rawEventIds[rawEventIndex++],
            `${item.observationId}.startedRawEventId`,
          ),
          rawServerLedgerBytes,
          "item/started",
          `${item.observationId} start`,
        );
        EvidenceBenchmarkActivityVendorSchemas.admitItemStarted(
          itemStartedSchemaBytes,
          startedFrame.params,
        );
        itemFrame(
          item,
          startedFrame,
          "startedAtMs",
          item.startedAtSourceMs,
          item.startedReceiptMonotonicNs,
        );
      } else if (item.startedAtSourceMs !== null)
        throw new Error(
          `${item.observationId} has source start without a raw start event.`,
        );
      if (completed !== null) {
        const completedFrame: IRawFrame = rawFrame(
          eventLedger,
          text(
            item.rawEventIds[rawEventIndex++],
            `${item.observationId}.completedRawEventId`,
          ),
          rawServerLedgerBytes,
          "item/completed",
          `${item.observationId} completion`,
        );
        EvidenceBenchmarkActivityVendorSchemas.admitItemCompleted(
          itemCompletedSchemaBytes,
          completedFrame.params,
        );
        const completedItem: Record<string, unknown> = itemFrame(
          item,
          completedFrame,
          "completedAtMs",
          item.completedAtSourceMs,
          item.completedReceiptMonotonicNs,
        );
        const sourceDuration: unknown = completedItem.durationMs;
        if (
          (sourceDuration === undefined || sourceDuration === null
            ? null
            : sourceDuration) !== item.sourceDurationMs
        )
          throw new Error(
            `${item.observationId} source duration differs from its raw item.`,
          );
      } else if (
        item.completedAtSourceMs !== null ||
        item.sourceDurationMs !== null
      )
        throw new Error(
          `${item.observationId} has completion data without a raw completion event.`,
        );
    }
  }

  interface IRawFrame {
    event: Record<string, unknown>;
    params: Record<string, unknown>;
  }

  function deriveLinkage(
    item: IEvidenceBenchmarkActivity.IItemObservation,
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
  ): {
    linkage: IEvidenceBenchmarkActivity.Linkage;
    responseId: string | null;
  } {
    if (
      item.startedReceiptMonotonicNs === null ||
      item.completedReceiptMonotonicNs === null
    )
      return { linkage: "ambiguous", responseId: null };
    const anchor: string = item.completedReceiptMonotonicNs;
    const candidates: IEvidenceBenchmarkActivity.IResponseUsage[] = responses
      .filter(
        (response) =>
          response.threadId === item.threadId &&
          response.turnId === item.turnId &&
          BigInt(response.receivedMonotonicNs) >= BigInt(anchor),
      )
      .sort((left, right) => {
        const leftTime = BigInt(left.receivedMonotonicNs);
        const rightTime = BigInt(right.receivedMonotonicNs);
        return leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0;
      });
    const first: IEvidenceBenchmarkActivity.IResponseUsage | undefined =
      candidates[0];
    if (first === undefined) return { linkage: "unlinked", responseId: null };
    if (candidates[1]?.receivedMonotonicNs === first.receivedMonotonicNs)
      return { linkage: "ambiguous", responseId: null };
    return { linkage: "ordered_epoch", responseId: first.responseId };
  }

  function rawFrame(
    ledger: IEventLedger,
    eventId: string,
    rawServerLedgerBytes: Uint8Array,
    method: "rawResponse/completed" | "item/started" | "item/completed",
    label: string,
  ): IRawFrame {
    const event: Record<string, unknown> | undefined =
      ledger.events.get(eventId);
    if (
      event === undefined ||
      event.actor !== "app-server" ||
      event.phase !== "agent" ||
      event.type !== "app_server_frame"
    )
      throw new Error(`${label} is not an app-server frame event.`);
    const payload: Record<string, unknown> = record(
      event.payload,
      `${label} event payload`,
    );
    exactKeys(
      payload,
      ["parseError", "processInstanceNonce", "transportSessionId"],
      `${label} event payload`,
    );
    if (payload.parseError !== null)
      throw new Error(`${label} event records an app-server parse error.`);
    const rawRef: Record<string, unknown> = record(
      event.rawRef,
      `${label} raw reference`,
    );
    exactKeys(
      rawRef,
      ["direction", "path", "byteOffset", "byteLength", "sha256"],
      `${label} raw reference`,
    );
    if (
      rawRef.direction !== "server" ||
      rawRef.path !== "server.raw.jsonl" ||
      !Number.isSafeInteger(rawRef.byteOffset) ||
      (rawRef.byteOffset as number) < 0 ||
      !Number.isSafeInteger(rawRef.byteLength) ||
      (rawRef.byteLength as number) <= 0 ||
      (rawRef.byteOffset as number) + (rawRef.byteLength as number) >
        rawServerLedgerBytes.byteLength
    )
      throw new Error(`${label} raw reference is outside server.raw.jsonl.`);
    const slice: Uint8Array = rawServerLedgerBytes.subarray(
      rawRef.byteOffset as number,
      (rawRef.byteOffset as number) + (rawRef.byteLength as number),
    );
    if (
      EvidenceBenchmarkActivityCanonical.sha256(slice) !==
        sha256(rawRef.sha256, `${label} raw reference sha256`) ||
      slice.at(-1) === 0x0a ||
      slice.at(-1) === 0x0d
    )
      throw new Error(`${label} raw slice differs from its event reference.`);
    const envelope: Record<string, unknown> = record(
      EvidenceBenchmarkActivityStrictJson.parse(slice, `${label} raw slice`),
      `${label} raw envelope`,
    );
    exactKeys(envelope, ["method", "params"], `${label} raw envelope`);
    const params: Record<string, unknown> = record(
      envelope.params,
      `${label} params`,
    );
    if (envelope.method !== method)
      throw new Error(`${label} raw notification method differs.`);
    return { event, params };
  }

  function itemFrame(
    observation: IEvidenceBenchmarkActivity.IItemObservation,
    frame: IRawFrame,
    sourceTimestampField: "startedAtMs" | "completedAtMs",
    sourceTimestamp: number | null,
    receiptMonotonicNs: string | null,
  ): Record<string, unknown> {
    exactKeys(
      frame.params,
      [sourceTimestampField, "item", "threadId", "turnId"],
      `${observation.observationId} raw item params`,
    );
    const rawItem: Record<string, unknown> = record(
      frame.params.item,
      `${observation.observationId} raw item`,
    );
    if (
      sourceTimestamp === null ||
      receiptMonotonicNs === null ||
      frame.event.monotonicNs !== receiptMonotonicNs ||
      frame.params[sourceTimestampField] !== sourceTimestamp ||
      frame.params.threadId !== observation.threadId ||
      frame.params.turnId !== observation.turnId ||
      rawItem.id !== observation.itemId ||
      rawItem.type !== observation.itemType
    )
      throw new Error(
        `${observation.observationId} raw item lifecycle provenance differs.`,
      );
    return rawItem;
  }

  function events(
    protocolRoot: string,
    bytes: Uint8Array,
    binding: IEvidenceBenchmarkActivity.IBinding,
    retainedRun: IRetainedRun,
  ): IEventLedger {
    const content: string = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes,
    );
    if (!content.endsWith("\n"))
      throw new Error("Source event ledger must end with LF.");
    const lines: string[] = content.slice(0, -1).split("\n");
    if (lines.length === 0 || lines.some((line) => line.length === 0))
      throw new Error("Source event ledger must contain nonempty JSONL rows.");
    const eventIds: Set<string> = new Set();
    const eventMap: Map<string, Record<string, unknown>> = new Map();
    const ordered: Record<string, unknown>[] = [];
    let previous: string = "0".repeat(64);
    let previousMonotonicNs = -1n;
    let previousUtc = Number.NEGATIVE_INFINITY;
    for (const [index, line] of lines.entries()) {
      const event: Record<string, unknown> = record(
        EvidenceBenchmarkProtocolValidator.validateText(
          protocolRoot,
          "event.schema.json",
          line,
          `source event ledger line ${index + 1}`,
        ),
        `source event ledger line ${index + 1}`,
      );
      const eventSha256: string = sha256(
        event.eventSha256,
        `source event ledger line ${index + 1}.eventSha256`,
      );
      const eventMonotonicNs: bigint = BigInt(
        text(
          event.monotonicNs,
          `source event ledger line ${index + 1}.monotonicNs`,
        ),
      );
      const eventUtc: number = Date.parse(
        text(event.utc, `source event ledger line ${index + 1}.utc`),
      );
      if (
        event.runId !== binding.runId ||
        event.seq !== index + 1 ||
        event.previousEventSha256 !== previous ||
        EvidenceBenchmarkActivityJcs.eventSha256(event) !== eventSha256 ||
        eventMonotonicNs < previousMonotonicNs ||
        !Number.isFinite(eventUtc) ||
        eventUtc < previousUtc
      )
        throw new Error(
          `Source event ledger chain differs at line ${index + 1}.`,
        );
      if (eventIds.has(eventSha256))
        throw new Error(`Source event ledger repeats ${eventSha256}.`);
      eventIds.add(eventSha256);
      eventMap.set(eventSha256, event);
      ordered.push(event);
      previous = eventSha256;
      previousMonotonicNs = eventMonotonicNs;
      previousUtc = eventUtc;
    }
    if (previous !== binding.eventChainTerminalSha256)
      throw new Error("Source event ledger terminal hash differs.");
    processLineage(ordered, retainedRun);
    return { eventIds, events: eventMap, ordered };
  }

  function rawInventory(
    ledger: IEventLedger,
    bytes: Uint8Array,
  ): IRawNotificationInventory {
    const lines: Array<{
      offset: number;
      length: number;
      sha256: string;
      bytes: Uint8Array;
    }> = [];
    let offset = 0;
    for (let cursor = 0; cursor < bytes.byteLength; cursor++) {
      if (bytes[cursor] !== 0x0a) continue;
      const length: number = cursor - offset;
      if (length <= 0 || bytes[cursor - 1] === 0x0d)
        throw new Error(
          "Source raw server ledger must be nonempty LF-delimited frames.",
        );
      const slice: Uint8Array = bytes.subarray(offset, cursor);
      lines.push({
        offset,
        length,
        sha256: EvidenceBenchmarkActivityCanonical.sha256(slice),
        bytes: slice,
      });
      offset = cursor + 1;
    }
    if (offset !== bytes.byteLength)
      throw new Error("Source raw server ledger has an unterminated frame.");
    const frames: Record<string, unknown>[] = ledger.ordered.filter(
      (event) => event.type === "app_server_frame",
    );
    if (frames.length !== lines.length)
      throw new Error(
        "Source raw server lines and app-server frame events are not one-to-one.",
      );
    const responseNotifications: Set<string> = new Set();
    const itemNotifications: Set<string> = new Set();
    for (const [index, event] of frames.entries()) {
      const line = lines[index]!;
      const rawRef: Record<string, unknown> = record(
        event.rawRef,
        `app-server frame ${index + 1} raw reference`,
      );
      if (
        rawRef.direction !== "server" ||
        rawRef.path !== "server.raw.jsonl" ||
        rawRef.byteOffset !== line.offset ||
        rawRef.byteLength !== line.length ||
        rawRef.sha256 !== line.sha256
      )
        throw new Error(
          "Source raw server frame inventory differs from event order.",
        );
      const payload: Record<string, unknown> = record(
        event.payload,
        `app-server frame ${index + 1} payload`,
      );
      if (payload.parseError !== null) continue;
      const envelope: Record<string, unknown> = record(
        EvidenceBenchmarkActivityStrictJson.parse(
          line.bytes,
          `app-server frame ${index + 1}`,
        ),
        `app-server frame ${index + 1} envelope`,
      );
      const eventId: string = sha256(
        event.eventSha256,
        `app-server frame ${index + 1} eventSha256`,
      );
      if (envelope.method === "rawResponse/completed")
        responseNotifications.add(eventId);
      else if (
        envelope.method === "item/started" ||
        envelope.method === "item/completed"
      )
        itemNotifications.add(eventId);
    }
    return {
      responses: responseNotifications,
      items: itemNotifications,
    };
  }

  function processLineage(
    events: readonly Record<string, unknown>[],
    retainedRun: IRetainedRun,
  ): void {
    const starts: Record<string, unknown>[] = events.filter(
      (event) => event.type === "app_server_started",
    );
    const bindings: Record<string, unknown>[] = events.filter(
      (event) => event.type === "app_server_t0_bound",
    );
    const frames: Record<string, unknown>[] = events.filter(
      (event) => event.type === "app_server_frame",
    );
    if (starts.length !== 1 || bindings.length !== 1 || frames.length === 0)
      throw new Error(
        "Source event ledger must contain one app-server start, one t0 binding, and at least one frame.",
      );
    const start: Record<string, unknown> = starts[0]!;
    const bound: Record<string, unknown> = bindings[0]!;
    if (
      start.actor !== "runner" ||
      start.phase !== "setup" ||
      start.rawRef !== null ||
      bound.actor !== "runner" ||
      bound.phase !== "agent" ||
      bound.rawRef !== null
    )
      throw new Error("App-server process lineage event provenance differs.");
    const startPayload: Record<string, unknown> = record(
      start.payload,
      "app-server start payload",
    );
    exactKeys(
      startPayload,
      [
        "binaryRole",
        "executableFileName",
        "executableVersion",
        "executableSha256",
        "arguments",
        "environmentProvenanceSha256",
        "environmentManifestFileSha256",
        "processInstanceNonce",
        "transportSessionId",
        "pid",
        "startedAtUtc",
        "t0Binding",
        "normalizedPublicInvocationSha256",
      ],
      "app-server start payload",
    );
    const nonce: string = nonce32(
      startPayload.processInstanceNonce,
      "app-server processInstanceNonce",
    );
    const session: string = nonce32(
      startPayload.transportSessionId,
      "app-server transportSessionId",
    );
    const executableFileName: string = portableBasename(
      startPayload.executableFileName,
      "app-server executableFileName",
    );
    const executableSha256: string = sha256(
      startPayload.executableSha256,
      "app-server executableSha256",
    );
    const argumentsValue: unknown = startPayload.arguments;
    if (!Array.isArray(argumentsValue))
      throw new Error("App-server public arguments must be an array.");
    const arguments_: Record<string, unknown>[] = argumentsValue.map(
      (argument, index) =>
        publicArgument(argument, `app-server argument ${index}`),
    );
    const literalAppServer: Record<string, unknown> | undefined =
      arguments_.at(-1);
    if (
      startPayload.binaryRole !== "codex-app-server" ||
      startPayload.executableVersion !== retainedRun.codexCliVersion ||
      executableSha256 !== retainedRun.codexExecutableSha256 ||
      startPayload.t0Binding !== "pending" ||
      !Number.isSafeInteger(startPayload.pid) ||
      (startPayload.pid as number) <= 0 ||
      !Number.isFinite(
        Date.parse(text(startPayload.startedAtUtc, "app-server startedAtUtc")),
      ) ||
      arguments_.length < 1 ||
      arguments_.length > 2 ||
      literalAppServer?.kind !== "literal" ||
      literalAppServer.value !== "app-server" ||
      (arguments_.length === 2 && arguments_[0]!.kind !== "absolute-role")
    )
      throw new Error("App-server public launch identity is invalid.");
    const environmentProvenanceSha256: string = sha256(
      startPayload.environmentProvenanceSha256,
      "app-server environmentProvenanceSha256",
    );
    const environmentManifestFileSha256: string = sha256(
      startPayload.environmentManifestFileSha256,
      "app-server environmentManifestFileSha256",
    );
    const normalizedPublicInvocationSha256: string = sha256(
      startPayload.normalizedPublicInvocationSha256,
      "app-server normalizedPublicInvocationSha256",
    );
    const normalizedInvocation: string =
      EvidenceBenchmarkActivityCanonical.sha256(
        EvidenceBenchmarkActivityCanonical.stringify({
          binaryRole: "codex-app-server",
          executableFileName,
          executableVersion: retainedRun.codexCliVersion,
          executableSha256,
          arguments: arguments_,
        }),
      );
    if (normalizedPublicInvocationSha256 !== normalizedInvocation)
      throw new Error(
        "App-server normalized public invocation digest differs.",
      );
    void environmentProvenanceSha256;
    void environmentManifestFileSha256;
    const bindingPayload: Record<string, unknown> = record(
      bound.payload,
      "app-server t0 binding payload",
    );
    exactKeys(
      bindingPayload,
      [
        "processInstanceNonce",
        "transportSessionId",
        "processStartEventSha256",
        "t0EventSha256",
        "startMinusT0MonotonicNs",
      ],
      "app-server t0 binding payload",
    );
    const t0Event: Record<string, unknown> | undefined = events.find(
      (event) => event.eventSha256 === bindingPayload.t0EventSha256,
    );
    const startMinusT0: string = text(
      bindingPayload.startMinusT0MonotonicNs,
      "app-server startMinusT0MonotonicNs",
    );
    if (
      bindingPayload.processInstanceNonce !== nonce ||
      bindingPayload.transportSessionId !== session ||
      bindingPayload.processStartEventSha256 !== start.eventSha256 ||
      !/^(0|-[1-9][0-9]*)$/.test(startMinusT0) ||
      t0Event === undefined ||
      t0Event.type !== "milestone_reached" ||
      record(t0Event.payload, "t0 event payload").name !== "t0" ||
      (start.seq as number) >= (t0Event.seq as number) ||
      (t0Event.seq as number) >= (bound.seq as number) ||
      BigInt(startMinusT0) !==
        BigInt(start.monotonicNs as string) -
          BigInt(t0Event.monotonicNs as string)
    )
      throw new Error("App-server t0 binding does not close process lineage.");
    for (const frame of frames) {
      const payload: Record<string, unknown> = record(
        frame.payload,
        "app-server frame payload",
      );
      exactKeys(
        payload,
        ["parseError", "processInstanceNonce", "transportSessionId"],
        "app-server frame payload",
      );
      if (
        payload.processInstanceNonce !== nonce ||
        payload.transportSessionId !== session ||
        (frame.seq as number) <= (bound.seq as number)
      )
        throw new Error(
          "App-server frame crosses a process or transport session.",
        );
    }
  }

  function activity(
    protocolRoot: string,
    bytes: Uint8Array,
    binding: IEvidenceBenchmarkActivity.IBinding,
    interval: IEvidenceBenchmarkActivity.IWallInterval,
    segments: readonly IEvidenceBenchmarkActivity.IPhaseSegment[],
    observations: readonly IEvidenceBenchmarkActivity.IItemObservation[],
    responseCount: number,
  ): IActivityLedger {
    const source: Record<string, unknown> =
      EvidenceBenchmarkProtocolValidator.validateBytes(
        protocolRoot,
        "activity-ledger.schema.json",
        bytes,
        "source activity ledger",
      );
    if (
      source.schemaVersion !== 1 ||
      source.runId !== binding.runId ||
      source.eventLedgerSha256 !== binding.sourceEventLedgerSha256 ||
      source.eventChainHeadSha256 !== binding.eventChainTerminalSha256 ||
      source.usageReportSha256 !== binding.sourceUsageLedgerSha256 ||
      source.rawServerLedgerSha256 !== binding.sourceRawServerLedgerSha256
    )
      throw new Error(
        "Source activity ledger is not bound to the retained run.",
      );
    for (const field of [
      "eventCaptureComplete",
      "eventChainClosed",
      "activityCaptureComplete",
      "activityLedgerClosed",
    ] as const)
      if (typeof source[field] !== "boolean")
        throw new Error(`Source activity ledger ${field} must be boolean.`);
    if (
      source.expectedResponseCount !== responseCount ||
      source.expectedItemObservationCount !== observations.length
    )
      throw new Error("Source activity ledger expected counts differ.");
    if (
      EvidenceBenchmarkActivityCanonical.stringify(source.wall) !==
        EvidenceBenchmarkActivityCanonical.stringify(interval) ||
      EvidenceBenchmarkActivityCanonical.stringify(source.phaseSegments) !==
        EvidenceBenchmarkActivityCanonical.stringify(segments) ||
      EvidenceBenchmarkActivityCanonical.stringify(source.items) !==
        EvidenceBenchmarkActivityCanonical.stringify(observations)
    )
      throw new Error("Source activity ledger wall or items differ.");
    return {
      eventCaptureComplete: source.eventCaptureComplete as boolean,
      eventChainClosed: source.eventChainClosed as boolean,
      activityCaptureComplete: source.activityCaptureComplete as boolean,
      activityLedgerClosed: source.activityLedgerClosed as boolean,
    };
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

  function phaseSegments(
    input: readonly IEvidenceBenchmarkActivity.IPhaseSegment[],
    complete: IEvidenceBenchmarkActivity.IWallInterval,
  ): void {
    if (input.length === 0)
      throw new Error(
        "Activity observation requires at least one phase segment.",
      );
    if (
      input.some((row) => row.phaseSegmentId.length === 0) ||
      new Set(input.map((row) => row.phaseSegmentId)).size !== input.length
    )
      throw new Error(
        "Activity observation phase segment IDs must be non-empty and unique.",
      );
    let cursor: bigint = BigInt(complete.startedMonotonicNs);
    for (const row of input) {
      wall(row.wall);
      const start: bigint = BigInt(row.wall.startedMonotonicNs);
      const end: bigint = BigInt(row.wall.completedMonotonicNs);
      if (start !== cursor)
        throw new Error(
          "Activity phase segments are not a contiguous partition.",
        );
      cursor = end;
    }
    if (cursor !== BigInt(complete.completedMonotonicNs))
      throw new Error(
        "Activity phase segments do not cover the complete wall.",
      );
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

  function exactKeys(
    input: Record<string, unknown>,
    expected: readonly string[],
    label: string,
  ): void {
    const actual: string[] = Object.keys(input).sort(compareUtf8);
    const frozen: string[] = [...expected].sort(compareUtf8);
    if (
      actual.length !== frozen.length ||
      actual.some((key, index) => key !== frozen[index])
    )
      throw new Error(`${label} fields differ from the frozen contract.`);
  }

  function exactSet(
    expected: ReadonlySet<string>,
    actual: ReadonlySet<string>,
    label: string,
  ): void {
    if (
      expected.size !== actual.size ||
      [...expected].some((value) => !actual.has(value))
    )
      throw new Error(`${label} is not exact and complete.`);
  }

  function jsonObject(
    bytes: Uint8Array,
    label: string,
  ): Record<string, unknown> {
    return record(
      EvidenceBenchmarkActivityStrictJson.parse(bytes, label),
      label,
    );
  }

  function text(input: unknown, label: string): string {
    if (typeof input !== "string" || input.length === 0)
      throw new Error(`${label} must be a non-empty string.`);
    return input;
  }

  function sha256(input: unknown, label: string): string {
    if (typeof input !== "string" || !/^[a-f0-9]{64}$/.test(input))
      throw new Error(`${label} must be a lowercase SHA-256.`);
    return input;
  }

  function nonce32(input: unknown, label: string): string {
    if (typeof input !== "string" || !/^[a-f0-9]{32}$/.test(input))
      throw new Error(`${label} must be 32 lowercase hexadecimal digits.`);
    return input;
  }

  function portableBasename(input: unknown, label: string): string {
    const value: string = text(input, label);
    if (
      value.includes("/") ||
      value.includes("\\") ||
      /^[a-zA-Z]:/.test(value) ||
      value === "." ||
      value === ".."
    )
      throw new Error(`${label} must not contain a host path.`);
    return value;
  }

  function publicArgument(
    input: unknown,
    label: string,
  ): Record<string, unknown> {
    const argument: Record<string, unknown> = record(input, label);
    if (argument.kind === "literal") {
      exactKeys(argument, ["kind", "value"], label);
      const value: string = text(argument.value, `${label}.value`);
      if (
        value.includes("/") ||
        value.includes("\\") ||
        /^[a-zA-Z]:/.test(value)
      )
        throw new Error(`${label} literal leaks a host path.`);
      return argument;
    }
    exactKeys(
      argument,
      ["kind", "role", "fileName", "byteLength", "sha256"],
      label,
    );
    if (
      argument.kind !== "absolute-role" ||
      argument.role !== "app-server-entrypoint" ||
      !Number.isSafeInteger(argument.byteLength) ||
      (argument.byteLength as number) <= 0
    )
      throw new Error(`${label} absolute role is invalid.`);
    portableBasename(argument.fileName, `${label}.fileName`);
    sha256(argument.sha256, `${label}.sha256`);
    return argument;
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

  const SOURCE_TOKEN_FIELDS = [
    "inputTokens",
    "cachedInputTokens",
    "cacheWriteInputTokens",
    "outputTokens",
    "reasoningOutputTokens",
    "totalTokens",
  ] as const;

  function sourceTokenZero(): Record<
    (typeof SOURCE_TOKEN_FIELDS)[number],
    number
  > {
    return {
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    };
  }

  function compareUtf8(left: string, right: string): number {
    return Buffer.compare(
      Buffer.from(left, "utf8"),
      Buffer.from(right, "utf8"),
    );
  }
}
