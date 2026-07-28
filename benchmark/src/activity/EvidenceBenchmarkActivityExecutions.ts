import path from "node:path";

import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityJcs } from "./EvidenceBenchmarkActivityJcs.ts";
import { EvidenceBenchmarkActivityObservations } from "./EvidenceBenchmarkActivityObservations.ts";
import { EvidenceBenchmarkActivityStrictJson } from "./EvidenceBenchmarkActivityStrictJson.ts";
import type { IEvidenceBenchmarkActivity } from "./IEvidenceBenchmarkActivity.ts";

/** Fail-closed admission of runner-owned activity model executions. */
export namespace EvidenceBenchmarkActivityExecutions {
  /** Admits exact event, usage, process, assignment, and output provenance. */
  export function admit(
    binding: IEvidenceBenchmarkActivity.IBinding,
    execution: IEvidenceBenchmarkActivity.IModelExecutionProvenance,
    evidence: IEvidenceBenchmarkActivity.IModelExecutionEvidence,
    expected: {
      assignmentSha256: string;
      agentRole:
        "activity-rater-a" | "activity-rater-b" | "activity-adjudicator";
      sessionId: string;
      threadId: string;
      providerOutputSha256: string;
      processProvenanceSha256: string;
    },
  ): void {
    if (
      execution.schemaVersion !== 1 ||
      execution.issuer !== "runner" ||
      execution.executionSchemaPath !==
        "benchmark/protocol/schema/activity-execution.schema.json" ||
      execution.executionSchemaSha256 !==
        binding.activityExecutionSchemaSha256 ||
      execution.assignmentSha256 !== expected.assignmentSha256 ||
      execution.agentRole !== expected.agentRole ||
      execution.sessionId !== expected.sessionId ||
      execution.threadId !== expected.threadId ||
      execution.providerOutputSha256 !== expected.providerOutputSha256
    )
      throw new Error("Activity execution differs from its runner assignment.");
    if (
      execution.processIdentityArtifactSha256 !==
      expected.processProvenanceSha256
    )
      throw new Error(
        "Activity execution process differs from its assignment.",
      );
    selfHash(execution);
    exactDigest(
      evidence.eventLedgerBytes,
      execution.eventLedgerSha256,
      "evaluation event ledger",
    );
    exactDigest(
      evidence.usageLedgerBytes,
      execution.usageLedgerSha256,
      "evaluation usage ledger",
    );
    exactDigest(
      evidence.processIdentityArtifactBytes,
      execution.processIdentityArtifactSha256,
      "process identity artifact",
    );
    exactDigest(
      evidence.rawResponseEnvelopeBytes,
      execution.rawResponseEnvelopeSha256,
      "raw response envelope",
    );
    exactDigest(
      evidence.structuredOutputEnvelopeBytes,
      execution.structuredOutputEnvelopeSha256,
      "structured output envelope",
    );
    if (
      evidence.rawResponseEnvelopeBytes.byteLength !==
      execution.rawResponseEnvelopeBytes
    )
      throw new Error("Raw response envelope byte length differs.");
    if (
      evidence.structuredOutputEnvelopeBytes.byteLength !==
      execution.structuredOutputEnvelopeBytes
    )
      throw new Error("Structured output envelope byte length differs.");
    if (
      evidence.processIdentityArtifactBytes.byteLength !==
      execution.processIdentityArtifactBytes
    )
      throw new Error("Process identity artifact byte length differs.");
    if (
      !Number.isSafeInteger(execution.processIdentityArtifactBytes) ||
      execution.processIdentityArtifactBytes <= 0 ||
      !Number.isSafeInteger(execution.rawResponseEnvelopeBytes) ||
      execution.rawResponseEnvelopeBytes <= 0 ||
      !Number.isSafeInteger(execution.rawResponseEnvelopeByteOffset) ||
      execution.rawResponseEnvelopeByteOffset < 0 ||
      !Number.isSafeInteger(execution.structuredOutputEnvelopeBytes) ||
      execution.structuredOutputEnvelopeBytes <= 0 ||
      !Number.isSafeInteger(execution.structuredOutputEnvelopeByteOffset) ||
      execution.structuredOutputEnvelopeByteOffset < 0
    )
      throw new Error("Activity execution byte span is invalid.");
    if (
      execution.processIdentitySchemaPath !==
        "benchmark/protocol/schema/activity-process-identity.schema.json" ||
      execution.processIdentitySchemaSha256 !==
        binding.activityProcessIdentitySchemaSha256
    )
      throw new Error("Activity execution uses an unpinned identity schema.");
    portablePath(execution.processIdentityArtifactPath);
    const processIdentity: Record<string, unknown> = identity(
      evidence.processIdentityArtifactBytes,
    );
    const events: ReadonlyMap<string, Record<string, unknown>> = eventLedger(
      evidence.eventLedgerBytes,
      execution.eventChainHeadSha256,
      binding.runId,
    );
    const processEvent: Record<string, unknown> = event(
      events,
      execution.processStartedEventId,
      "activity_process_started",
    );
    const assignmentEvent: Record<string, unknown> = event(
      events,
      execution.assignmentEventId,
      "activity_assignment_issued",
    );
    const turnEvent: Record<string, unknown> = event(
      events,
      execution.turnStartedEventId,
      "activity_turn_started",
    );
    const responseEvent: Record<string, unknown> = event(
      events,
      execution.rawEventId,
      "activity_raw_response_completed",
    );
    const itemEvent: Record<string, unknown> = event(
      events,
      execution.itemCompletedEventId,
      "activity_item_completed",
    );
    processEventPayload(processEvent, processIdentity);
    eventPayload(assignmentEvent, {
      assignmentSha256: execution.assignmentSha256,
      sessionId: execution.sessionId,
      threadId: execution.threadId,
    });
    eventPayload(turnEvent, {
      assignmentSha256: execution.assignmentSha256,
      threadId: execution.threadId,
      turnId: execution.turnId,
    });
    eventPayload(responseEvent, {
      responseId: execution.responseId,
      threadId: execution.threadId,
      turnId: execution.turnId,
    });
    eventPayload(itemEvent, {
      itemId: execution.structuredOutputItemId,
      threadId: execution.threadId,
      turnId: execution.turnId,
    });
    rawReference(responseEvent, execution);
    structuredOutput(
      itemEvent,
      evidence.structuredOutputEnvelopeBytes,
      execution,
    );
    rawResponse(evidence.rawResponseEnvelopeBytes, execution);
    const assignmentNs: bigint = eventTime(
      assignmentEvent,
      execution.assignmentMonotonicNs,
      "assignment",
    );
    const turnNs: bigint = eventTime(
      turnEvent,
      execution.turnStartedMonotonicNs,
      "turn start",
    );
    const responseNs: bigint = eventTime(
      responseEvent,
      execution.responseReceivedMonotonicNs,
      "response",
    );
    const processNs: bigint = eventTime(
      processEvent,
      processIdentity.startedMonotonicNs as string,
      "process start",
    );
    const itemNs: bigint = nanoseconds(
      itemEvent.monotonicNs as string,
      "item completion",
    );
    if (!(
      processNs < assignmentNs &&
      assignmentNs < turnNs &&
      turnNs < responseNs &&
      responseNs < itemNs
    ))
      throw new Error(
        "Activity assignment, turn, and response order is invalid.",
      );
    if (responseEvent.utc !== execution.responseReceivedAtUtc)
      throw new Error("Activity response UTC differs from its runner event.");
    usage(evidence.usageLedgerBytes, execution);
  }

  /** Proves multiple execution records did not reuse a model request. */
  export function independent(
    input: readonly IEvidenceBenchmarkActivity.IModelExecutionProvenance[],
  ): void {
    for (const field of [
      "sessionId",
      "threadId",
      "turnId",
      "responseId",
      "rawEventId",
      "processIdentityArtifactSha256",
    ] as const) {
      const values: Set<string> = new Set(input.map((row) => row[field]));
      if (values.size !== input.length)
        throw new Error(`Activity model executions reuse ${field}.`);
    }
  }

  function identity(bytes: Uint8Array): Record<string, unknown> {
    const value: Record<string, unknown> = record(
      EvidenceBenchmarkActivityStrictJson.parse(bytes, "process identity"),
      "process identity",
    );
    const identitySha256: string = sha(
      value.identitySha256,
      "process identity.identitySha256",
    );
    exactKeys(value, [
      "schemaVersion",
      "provider",
      "authenticationClass",
      "codexCliVersion",
      "codexExecutableSha256",
      "model",
      "effort",
      "requestedServiceTierMode",
      "requestedServiceTier",
      "effectiveServiceTier",
      "processInstanceId",
      "processId",
      "startedAtUtc",
      "startedMonotonicNs",
      "invocation",
      "identitySha256",
    ]);
    const { identitySha256: _ignored, ...body } = value;
    if (
      EvidenceBenchmarkActivityCanonical.object(body) !== identitySha256 ||
      value.schemaVersion !== 1 ||
      value.provider !== "openai" ||
      value.authenticationClass !== "chatgpt" ||
      value.codexCliVersion !== "0.145.0" ||
      value.codexExecutableSha256 !==
        "83751f15cb6a0a7b97df67752c001e3fe1c20e18ffbfec3ff63567296205eb6c" ||
      value.model !== "gpt-5.6-terra" ||
      value.effort !== "high" ||
      value.requestedServiceTierMode !== "omitted" ||
      value.requestedServiceTier !== null ||
      value.effectiveServiceTier !== null ||
      typeof value.processInstanceId !== "string" ||
      value.processInstanceId.length === 0 ||
      !Number.isSafeInteger(value.processId) ||
      (value.processId as number) <= 0 ||
      typeof value.startedAtUtc !== "string" ||
      !Number.isFinite(Date.parse(value.startedAtUtc)) ||
      typeof value.startedMonotonicNs !== "string" ||
      !Array.isArray(value.invocation) ||
      value.invocation.length === 0 ||
      value.invocation.some(
        (part) => typeof part !== "string" || part.length === 0,
      )
    )
      throw new Error("Process identity does not prove the frozen execution.");
    nanoseconds(value.startedMonotonicNs as string, "process start");
    return value;
  }

  function eventLedger(
    bytes: Uint8Array,
    expectedHead: string,
    runId: string,
  ): ReadonlyMap<string, Record<string, unknown>> {
    const content: string = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes,
    );
    if (!content.endsWith("\n"))
      throw new Error("Evaluation event ledger must end with LF.");
    const lines: string[] = content.slice(0, -1).split("\n");
    if (lines.length === 0 || lines.some((line) => line.length === 0))
      throw new Error("Evaluation event ledger must contain JSONL rows.");
    let previous: string = "0".repeat(64);
    const result: Map<string, Record<string, unknown>> = new Map();
    for (const [index, line] of lines.entries()) {
      const value: Record<string, unknown> = record(
        EvidenceBenchmarkActivityStrictJson.parse(
          Buffer.from(line, "utf8"),
          `evaluation event line ${index + 1}`,
        ),
        `evaluation event line ${index + 1}`,
      );
      const eventSha256: string = sha(
        value.eventSha256,
        `evaluation event line ${index + 1}.eventSha256`,
      );
      if (
        value.seq !== index + 1 ||
        value.runId !== runId ||
        value.previousEventSha256 !== previous ||
        EvidenceBenchmarkActivityJcs.eventSha256(value) !== eventSha256 ||
        result.has(eventSha256)
      )
        throw new Error(`Evaluation event chain differs at line ${index + 1}.`);
      result.set(eventSha256, value);
      previous = eventSha256;
    }
    if (previous !== expectedHead)
      throw new Error("Evaluation event chain head differs.");
    return result;
  }

  function event(
    events: ReadonlyMap<string, Record<string, unknown>>,
    eventId: string,
    type: string,
  ): Record<string, unknown> {
    const result: Record<string, unknown> | undefined = events.get(eventId);
    if (result === undefined || result.type !== type)
      throw new Error(`Activity execution lacks ${type} event membership.`);
    return result;
  }

  function eventPayload(
    event: Record<string, unknown>,
    expected: Readonly<Record<string, string>>,
  ): void {
    const payload: Record<string, unknown> = record(
      event.payload,
      "activity execution event payload",
    );
    for (const [field, value] of Object.entries(expected))
      if (payload[field] !== value)
        throw new Error(`Activity execution event differs at ${field}.`);
  }

  function processEventPayload(
    event: Record<string, unknown>,
    identity: Record<string, unknown>,
  ): void {
    const payload: Record<string, unknown> = record(
      event.payload,
      "activity process-start event payload",
    );
    exactKeys(payload, [
      "processInstanceId",
      "processId",
      "invocation",
      "codexExecutableSha256",
    ]);
    for (const field of [
      "processInstanceId",
      "processId",
      "invocation",
      "codexExecutableSha256",
    ] as const)
      if (
        EvidenceBenchmarkActivityCanonical.stringify(payload[field]) !==
        EvidenceBenchmarkActivityCanonical.stringify(identity[field])
      )
        throw new Error(`Activity process event differs at ${field}.`);
  }

  function eventTime(
    event: Record<string, unknown>,
    expected: string,
    label: string,
  ): bigint {
    if (event.monotonicNs !== expected)
      throw new Error(`Activity ${label} monotonic time differs.`);
    return nanoseconds(expected, label);
  }

  function usage(
    bytes: Uint8Array,
    execution: IEvidenceBenchmarkActivity.IModelExecutionProvenance,
  ): void {
    const root: Record<string, unknown> = record(
      EvidenceBenchmarkActivityStrictJson.parse(
        bytes,
        "evaluation usage ledger",
      ),
      "evaluation usage ledger",
    );
    if (root.exactUsageComplete !== true || !Array.isArray(root.responses))
      throw new Error("Evaluation usage ledger is not exact and complete.");
    const matches: Record<string, unknown>[] = root.responses
      .map((row, index) => record(row, `evaluation responses[${index}]`))
      .filter((row) => row.responseId === execution.responseId);
    if (matches.length !== 1)
      throw new Error("Evaluation usage ledger lacks one unique response.");
    const row: Record<string, unknown> = matches[0]!;
    if (
      row.threadId !== execution.threadId ||
      row.turnId !== execution.turnId ||
      row.phase !== "grading" ||
      row.receivedAtUtc !== execution.responseReceivedAtUtc ||
      row.receivedMonotonicNs !== execution.responseReceivedMonotonicNs ||
      row.rawEventId !== execution.rawEventId ||
      EvidenceBenchmarkActivityCanonical.stringify(row.usage) !==
        EvidenceBenchmarkActivityCanonical.stringify(execution.responseUsage)
    )
      throw new Error("Evaluation usage response provenance differs.");
    EvidenceBenchmarkActivityObservations.tokenVector(execution.responseUsage);
  }

  function selfHash(
    input: IEvidenceBenchmarkActivity.IModelExecutionProvenance,
  ): void {
    exactKeys(input as unknown as Record<string, unknown>, [
      "schemaVersion",
      "issuer",
      "executionSchemaPath",
      "executionSchemaSha256",
      "assignmentSha256",
      "agentRole",
      "threadId",
      "sessionId",
      "turnId",
      "responseId",
      "rawEventId",
      "processStartedEventId",
      "assignmentEventId",
      "turnStartedEventId",
      "assignmentMonotonicNs",
      "turnStartedMonotonicNs",
      "responseReceivedMonotonicNs",
      "responseReceivedAtUtc",
      "responseUsage",
      "providerOutputSha256",
      "itemCompletedEventId",
      "structuredOutputItemId",
      "structuredOutputEnvelopePath",
      "structuredOutputEnvelopeByteOffset",
      "structuredOutputEnvelopeBytes",
      "structuredOutputEnvelopeSha256",
      "rawResponseEnvelopeBytes",
      "rawResponseEnvelopePath",
      "rawResponseEnvelopeByteOffset",
      "rawResponseEnvelopeSha256",
      "processIdentitySchemaPath",
      "processIdentitySchemaSha256",
      "processIdentityArtifactPath",
      "processIdentityArtifactBytes",
      "processIdentityArtifactSha256",
      "eventLedgerSha256",
      "eventChainHeadSha256",
      "usageLedgerSha256",
      "executionSha256",
    ]);
    const { executionSha256: _ignored, ...body } = input;
    if (
      input.executionSha256 !== EvidenceBenchmarkActivityCanonical.object(body)
    )
      throw new Error("Activity model execution digest differs.");
  }

  function exactDigest(
    bytes: Uint8Array,
    expected: string,
    label: string,
  ): void {
    if (EvidenceBenchmarkActivityCanonical.sha256(bytes) !== expected)
      throw new Error(`${label} exact bytes differ.`);
  }

  function rawReference(
    event: Record<string, unknown>,
    execution: IEvidenceBenchmarkActivity.IModelExecutionProvenance,
  ): void {
    const rawRef: Record<string, unknown> = record(
      event.rawRef,
      "activity raw response reference",
    );
    if (
      rawRef.direction !== "server" ||
      rawRef.path !== execution.rawResponseEnvelopePath ||
      rawRef.byteOffset !== execution.rawResponseEnvelopeByteOffset ||
      rawRef.byteLength !== execution.rawResponseEnvelopeBytes ||
      rawRef.sha256 !== execution.rawResponseEnvelopeSha256
    )
      throw new Error(
        "Activity raw response reference differs from exact bytes.",
      );
  }

  function rawResponse(
    bytes: Uint8Array,
    execution: IEvidenceBenchmarkActivity.IModelExecutionProvenance,
  ): void {
    const envelope: Record<string, unknown> = record(
      EvidenceBenchmarkActivityStrictJson.parse(bytes, "raw response envelope"),
      "raw response envelope",
    );
    exactKeys(envelope, ["method", "params"]);
    const params: Record<string, unknown> = record(
      envelope.params,
      "raw response params",
    );
    exactKeys(params, ["responseId", "threadId", "turnId", "usage"]);
    if (
      envelope.method !== "rawResponse/completed" ||
      params.responseId !== execution.responseId ||
      params.threadId !== execution.threadId ||
      params.turnId !== execution.turnId ||
      EvidenceBenchmarkActivityCanonical.stringify(params.usage) !==
        EvidenceBenchmarkActivityCanonical.stringify(execution.responseUsage)
    )
      throw new Error(
        "Raw response envelope does not match the pinned notification shape.",
      );
  }

  function structuredOutput(
    event: Record<string, unknown>,
    bytes: Uint8Array,
    execution: IEvidenceBenchmarkActivity.IModelExecutionProvenance,
  ): void {
    const rawRef: Record<string, unknown> = record(
      event.rawRef,
      "structured output raw reference",
    );
    if (
      rawRef.direction !== "server" ||
      rawRef.path !== execution.structuredOutputEnvelopePath ||
      rawRef.byteOffset !== execution.structuredOutputEnvelopeByteOffset ||
      rawRef.byteLength !== execution.structuredOutputEnvelopeBytes ||
      rawRef.sha256 !== execution.structuredOutputEnvelopeSha256
    )
      throw new Error(
        "Structured output raw reference differs from exact bytes.",
      );
    const envelope: Record<string, unknown> = record(
      EvidenceBenchmarkActivityStrictJson.parse(
        bytes,
        "structured output envelope",
      ),
      "structured output envelope",
    );
    exactKeys(envelope, ["method", "params"]);
    const params: Record<string, unknown> = record(
      envelope.params,
      "item completed params",
    );
    exactKeys(params, ["completedAtMs", "item", "threadId", "turnId"]);
    const item: Record<string, unknown> = record(
      params.item,
      "item completed agent message",
    );
    exactKeys(item, ["id", "type", "phase", "text"]);
    if (
      envelope.method !== "item/completed" ||
      !Number.isSafeInteger(params.completedAtMs) ||
      params.threadId !== execution.threadId ||
      params.turnId !== execution.turnId ||
      item.id !== execution.structuredOutputItemId ||
      item.type !== "agentMessage" ||
      item.phase !== "final" ||
      typeof item.text !== "string"
    )
      throw new Error(
        "Structured output is not a final agent-message item completion.",
      );
    const providerOutput: unknown = EvidenceBenchmarkActivityStrictJson.parse(
      Buffer.from(item.text as string, "utf8"),
      "structured provider output text",
    );
    if (
      EvidenceBenchmarkActivityCanonical.object(providerOutput) !==
      execution.providerOutputSha256
    )
      throw new Error(
        "Structured output text differs from the provider output artifact.",
      );
  }

  function portablePath(input: string): void {
    const segments: string[] = input.split("/");
    if (
      input.length === 0 ||
      input.includes("\\") ||
      input.startsWith("/") ||
      path.win32.isAbsolute(input) ||
      segments.some(
        (segment) =>
          segment.length === 0 || segment === "." || segment === "..",
      )
    )
      throw new Error("Process identity artifact path is not portable.");
  }

  function nanoseconds(input: string, label: string): bigint {
    if (!/^(0|[1-9][0-9]*)$/.test(input))
      throw new Error(`${label} must be unsigned integer nanoseconds.`);
    return BigInt(input);
  }

  function sha(input: unknown, label: string): string {
    if (typeof input !== "string" || !/^[a-f0-9]{64}$/.test(input))
      throw new Error(`${label} must be a lowercase SHA-256.`);
    return input;
  }

  function record(input: unknown, label: string): Record<string, unknown> {
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error(`${label} must be an object.`);
    return input as Record<string, unknown>;
  }

  function exactKeys(
    input: Record<string, unknown>,
    expected: readonly string[],
  ): void {
    const actual: string[] = Object.keys(input).sort();
    const wanted: string[] = [...expected].sort();
    if (
      actual.length !== wanted.length ||
      actual.some((key, index) => key !== wanted[index])
    )
      throw new Error(
        "Activity provenance object has an unknown or missing field.",
      );
  }
}
