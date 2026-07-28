import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";
import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityCodebook } from "./EvidenceBenchmarkActivityCodebook.ts";
import { EvidenceBenchmarkActivityExecutions } from "./EvidenceBenchmarkActivityExecutions.ts";
import { EvidenceBenchmarkActivityJudgments } from "./EvidenceBenchmarkActivityJudgments.ts";
import { EvidenceBenchmarkActivityJcs } from "./EvidenceBenchmarkActivityJcs.ts";
import { EvidenceBenchmarkActivityObservations } from "./EvidenceBenchmarkActivityObservations.ts";
import { EvidenceBenchmarkActivityReducer } from "./EvidenceBenchmarkActivityReducer.ts";
import { EvidenceBenchmarkActivityRegistry } from "./EvidenceBenchmarkActivityRegistry.ts";
import { EvidenceBenchmarkActivityStrictJson } from "./EvidenceBenchmarkActivityStrictJson.ts";
import { EvidenceBenchmarkActivityVendorSchemas } from "./EvidenceBenchmarkActivityVendorSchemas.ts";
import type { IEvidenceBenchmarkActivity } from "./IEvidenceBenchmarkActivity.ts";

/** Runs paid-call-free fixtures for the complete activity attribution contract. */
export namespace EvidenceBenchmarkActivitySelfTest {
  const EXECUTION_EVIDENCE: WeakMap<
    | IEvidenceBenchmarkActivity.IRaterArtifact
    | IEvidenceBenchmarkActivity.IAdjudicatorArtifact,
    IEvidenceBenchmarkActivity.IModelExecutionEvidence
  > = new WeakMap();

  /** Executes integrity, judgment, uncertainty, and interval fixtures. */
  export function main(): void {
    const temporary: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-activity-attribution-"),
    );
    try {
      testCanonicalPins();
      testRegistryAdmission(temporary);
      const protocolRoot: string = canonicalProtocolRoot();
      testExactObservationIntegrity(protocolRoot);
      testRawProvenanceAttacks(protocolRoot);
      testIndependentJudgmentsAndReducer(protocolRoot);
      testFailClosedJudgments(protocolRoot);
      console.log("Activity attribution self-test passed without paid calls.");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  }

  function testCanonicalPins(): void {
    const benchmarkRoot: string = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );
    const pins = EvidenceBenchmarkActivityStrictJson.parse(
      fs.readFileSync(path.join(benchmarkRoot, "protocol/pins.json")),
      "canonical benchmark pins",
    ) as {
      activityAttribution: {
        codebookCanonicalObjectSha256: string;
        codebookSourceBytes: number;
        codebookSourcePath: string;
        codebookSourceSha256: string;
        assignmentSchema: PinnedFile;
        processIdentitySchema: PinnedFile;
        executionSchema: PinnedFile;
        ledgerSchema: PinnedFile;
        observationSchema: PinnedFile;
        reportSchema: PinnedFile;
        coreSealSchema: PinnedFile;
        usageReportSchema: PinnedFile;
        rawResponseCompletedVendorSchema: PinnedFile;
        itemStartedVendorSchema: PinnedFile;
        itemCompletedVendorSchema: PinnedFile;
      };
    };
    const activity = pins.activityAttribution;
    assert.equal(
      activity.codebookCanonicalObjectSha256,
      EvidenceBenchmarkActivityCodebook.SHA256,
    );
    pinnedFile(benchmarkRoot, {
      path: activity.codebookSourcePath,
      bytes: activity.codebookSourceBytes,
      sha256: activity.codebookSourceSha256,
    });
    for (const artifact of [
      activity.assignmentSchema,
      activity.processIdentitySchema,
      activity.executionSchema,
      activity.ledgerSchema,
      activity.observationSchema,
      activity.reportSchema,
      activity.coreSealSchema,
      activity.usageReportSchema,
      activity.rawResponseCompletedVendorSchema,
      activity.itemStartedVendorSchema,
      activity.itemCompletedVendorSchema,
    ])
      pinnedFile(benchmarkRoot, artifact);
  }

  interface PinnedFile {
    path: string;
    bytes: number;
    sha256: string;
  }

  function pinnedFile(benchmarkRoot: string, artifact: PinnedFile): void {
    const repositoryRoot: string = path.resolve(benchmarkRoot, "..");
    const bytes: Buffer = fs.readFileSync(
      path.join(repositoryRoot, ...artifact.path.split("/")),
    );
    assert.equal(bytes.byteLength, artifact.bytes, artifact.path);
    assert.equal(
      EvidenceBenchmarkActivityCanonical.sha256(bytes),
      artifact.sha256,
      artifact.path,
    );
    if (artifact.path.endsWith(".json"))
      EvidenceBenchmarkActivityStrictJson.parse(bytes, artifact.path);
  }

  /**
   * Verifies registry admission closes both provider/local schema pairs.
   *
   * A registry digest alone does not prove that its schema paths remain under
   * the frozen root or that the bytes still match each contract row.
   *
   * 1. Build both activity registry contracts from exact fixture bytes.
   * 2. Admit their provider and local closure.
   * 3. Reject a traversal path before any model-facing turn can start.
   */
  function testRegistryAdmission(temporary: string): void {
    const fixture = writeProtocol(path.join(temporary, "protocol"));
    const { root, registry, ratingProvider, admitted } = fixture;
    assert.equal(
      admitted.activityRatingProviderSchemaSha256,
      EvidenceBenchmarkActivityCanonical.sha256(ratingProvider),
    );
    const escaped = structuredClone(registry);
    escaped.contracts[0]!.providerSchema = "../outside.schema.json";
    fs.writeFileSync(
      path.join(root, "provider-output-registry.json"),
      `${JSON.stringify(escaped)}\n`,
      "utf8",
    );
    assert.throws(
      () => EvidenceBenchmarkActivityRegistry.admit(root),
      /portable relative path/,
    );
    fs.writeFileSync(
      path.join(root, "provider-output-registry.json"),
      '{"schemaVersion":1,"schemaVersion":1}\n',
      "utf8",
    );
    assert.throws(
      () => EvidenceBenchmarkActivityRegistry.admit(root),
      /duplicate object key/,
    );
  }

  /**
   * Verifies exact token rows cannot drift from the source ledger or core seal.
   *
   * Semantic attribution is downstream of exact accounting. Duplicate IDs,
   * invalid token arithmetic, or altered immutable bytes must stop the
   * reducer.
   *
   * 1. Create one valid observation artifact.
   * 2. Mutate the core seal and duplicate a response independently.
   * 3. Assert both invalid variants fail before semantic judgment.
   */
  function testExactObservationIntegrity(protocolRoot: string): void {
    const fixture: Fixture = fixtureObservations(protocolRoot);
    EvidenceBenchmarkProtocolValidator.validateBytes(
      canonicalProtocolRoot(),
      "activity-ledger.schema.json",
      fixture.input.sourceActivityLedgerBytes,
      "activity ledger positive fixture",
    );
    EvidenceBenchmarkProtocolValidator.validateValue(
      canonicalProtocolRoot(),
      "activity-observation.schema.json",
      fixture.observations,
      "activity observation positive fixture",
    );
    assert.equal(fixture.observations.responses.length, 2);
    assert.deepEqual(
      fixture.observations.phaseSegments.map((row) => row.phase),
      ["phase2_discovery", "phase2_fix", "phase2_discovery", "phase2_fix"],
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          parentCoreSealBytes: Buffer.from("altered\n"),
        }),
      /parent core seal/,
    );
    const disconnectedCoreValue = JSON.parse(
      Buffer.from(fixture.input.parentCoreSealBytes).toString("utf8"),
    ) as Record<string, unknown>;
    disconnectedCoreValue.usageReportSha256 = digest("other-ledger");
    const disconnectedCore: Buffer = Buffer.from(
      `${JSON.stringify(disconnectedCoreValue)}\n`,
      "utf8",
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          binding: {
            ...fixture.input.binding,
            parentCoreSealSha256:
              EvidenceBenchmarkActivityCanonical.sha256(disconnectedCore),
          },
          parentCoreSealBytes: disconnectedCore,
        }),
      /does not bind/,
    );
    const eventLines: Record<string, unknown>[] = Buffer.from(
      fixture.input.sourceEventLedgerBytes,
    )
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    eventLines[0]!.payload = { altered: true };
    const alteredEventBytes: Buffer = Buffer.from(
      `${eventLines.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    );
    const alteredActivity = JSON.parse(
      Buffer.from(fixture.input.sourceActivityLedgerBytes).toString("utf8"),
    ) as Record<string, unknown>;
    alteredActivity.eventLedgerSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(alteredEventBytes);
    const alteredActivityBytes: Buffer = Buffer.from(
      `${JSON.stringify(alteredActivity)}\n`,
      "utf8",
    );
    const alteredCore = JSON.parse(
      Buffer.from(fixture.input.parentCoreSealBytes).toString("utf8"),
    ) as Record<string, unknown>;
    alteredCore.activityLedgerSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(alteredActivityBytes);
    const alteredCoreBytes: Buffer = Buffer.from(
      `${JSON.stringify(alteredCore)}\n`,
      "utf8",
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          binding: {
            ...fixture.input.binding,
            sourceEventLedgerSha256:
              EvidenceBenchmarkActivityCanonical.sha256(alteredEventBytes),
            sourceActivityLedgerSha256:
              EvidenceBenchmarkActivityCanonical.sha256(alteredActivityBytes),
            parentCoreSealSha256:
              EvidenceBenchmarkActivityCanonical.sha256(alteredCoreBytes),
          },
          parentCoreSealBytes: alteredCoreBytes,
          sourceEventLedgerBytes: alteredEventBytes,
          sourceActivityLedgerBytes: alteredActivityBytes,
        }),
      /event ledger chain differs/,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          responses: [fixture.input.responses[0]!, fixture.input.responses[0]!],
        }),
      /Duplicate observed response ID|counts differ/,
    );
    const duplicateSegments = structuredClone(fixture.input.phaseSegments);
    duplicateSegments[2]!.phaseSegmentId = duplicateSegments[0]!.phaseSegmentId;
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          phaseSegments: duplicateSegments,
        }),
      /segment IDs must be non-empty and unique/,
    );
    const noncontiguousSegments = structuredClone(fixture.input.phaseSegments);
    noncontiguousSegments[1]!.wall.startedMonotonicNs = "251";
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          phaseSegments: noncontiguousSegments,
        }),
      /not a contiguous partition/,
    );
    const wrongSegmentResponses = structuredClone(fixture.input.responses);
    wrongSegmentResponses[0]!.phaseSegmentId = "discovery-2";
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          responses: wrongSegmentResponses,
        }),
      /provenance differs/,
    );
    const invalidUsage = structuredClone(fixture.input.responses);
    invalidUsage[0]!.usage!.totalTokens += 1;
    const ledgerBytes: Buffer = usageLedger(invalidUsage);
    const invalidActivity = JSON.parse(
      Buffer.from(fixture.input.sourceActivityLedgerBytes).toString("utf8"),
    ) as Record<string, unknown>;
    invalidActivity.usageReportSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(ledgerBytes);
    const invalidActivityBytes: Buffer = Buffer.from(
      `${JSON.stringify(invalidActivity)}\n`,
      "utf8",
    );
    const invalidCore = JSON.parse(
      Buffer.from(fixture.input.parentCoreSealBytes).toString("utf8"),
    ) as Record<string, unknown>;
    invalidCore.usageReportSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(ledgerBytes);
    invalidCore.activityLedgerSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(invalidActivityBytes);
    const invalidCoreBytes: Buffer = Buffer.from(
      `${JSON.stringify(invalidCore)}\n`,
      "utf8",
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          binding: {
            ...fixture.input.binding,
            sourceUsageLedgerSha256:
              EvidenceBenchmarkActivityCanonical.sha256(ledgerBytes),
            sourceActivityLedgerSha256:
              EvidenceBenchmarkActivityCanonical.sha256(invalidActivityBytes),
            parentCoreSealSha256:
              EvidenceBenchmarkActivityCanonical.sha256(invalidCoreBytes),
          },
          parentCoreSealBytes: invalidCoreBytes,
          sourceUsageLedgerBytes: ledgerBytes,
          sourceActivityLedgerBytes: invalidActivityBytes,
          responses: invalidUsage,
        }),
      /Provider total/,
    );
    const censoredInput: EvidenceBenchmarkActivityObservations.IInput =
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.responses[1]!.usage = null;
          const responseFrame: Record<string, unknown> = source.frames.find(
            (frame) =>
              recordValue(frame.envelope.params).responseId === "response-b",
          )!.envelope;
          recordValue(responseFrame.params).usage = null;
        },
      });
    const censored: IEvidenceBenchmarkActivity.IObservations =
      EvidenceBenchmarkActivityObservations.create(censoredInput);
    assert.equal(censored.sourceExactUsageComplete, false);
    const censoredRatings: IEvidenceBenchmarkActivity.IProviderRating[] =
      censored.responses.map((response) =>
        rating(
          response.responseId,
          { implementation: 10_000 },
          "shared",
          ["shared_product_work"],
          0.9,
          `Observed ${citation(censored, response.responseId)}.`,
        ),
      );
    const censoredRaterA: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      censored,
      "a",
      structuredClone(censoredRatings),
    );
    const censoredRaterB: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      censored,
      "b",
      structuredClone(censoredRatings),
    );
    const censoredReport: IEvidenceBenchmarkActivity.IReport =
      EvidenceBenchmarkActivityReducer.reduce({
        observations: censored,
        raters: [censoredRaterA, censoredRaterB],
        raterEvidence: [
          executionEvidence(censoredRaterA),
          executionEvidence(censoredRaterB),
        ],
      });
    assert.equal(censoredReport.exactMeasurementStatus, "right_censored");
  }

  /** Rejects raw-frame substitutions after every mutable outer seal is rebuilt. */
  function testRawProvenanceAttacks(protocolRoot: string): void {
    const fixture: Fixture = fixtureObservations(protocolRoot);
    const firstResponse = (source: MutableSource): MutableRawFrame =>
      source.frames.find(
        (frame) =>
          frame.envelope.method === "rawResponse/completed" &&
          recordValue(frame.envelope.params).responseId === "response-a",
      )!;
    const censorItemA = (
      source: MutableSource,
      linkage: IEvidenceBenchmarkActivity.Linkage,
      linkedResponseId: string | null,
    ): void => {
      const frameIndex: number = source.frames.findIndex(
        (frame) =>
          frame.envelope.method === "item/completed" &&
          recordValue(recordValue(frame.envelope.params).item).id === "item-a",
      );
      assert.notEqual(frameIndex, -1);
      const eventIndex: number = source.frames[frameIndex]!.eventIndex;
      source.frames.splice(frameIndex, 1);
      source.events.splice(eventIndex, 1);
      for (const frame of source.frames)
        if (frame.eventIndex > eventIndex) frame.eventIndex--;
      source.items[0] = {
        ...source.items[0]!,
        completedAtSourceMs: null,
        completedReceiptMonotonicNs: null,
        sourceDurationMs: null,
        linkedResponseId,
        linkage,
        rawEventIds: [source.items[0]!.rawEventIds[0]!],
      };
    };
    const reject = (
      input: EvidenceBenchmarkActivityObservations.IInput,
      expected: RegExp,
    ): void => {
      assert.throws(
        () => EvidenceBenchmarkActivityObservations.create(input),
        expected,
      );
    };

    const censoredItemInput: EvidenceBenchmarkActivityObservations.IInput =
      rebuildSource(fixture.input, {
        mutate(source): void {
          censorItemA(source, "ambiguous", null);
        },
      });
    const censoredItem: IEvidenceBenchmarkActivity.IObservations =
      EvidenceBenchmarkActivityObservations.create(censoredItemInput);
    assert.equal(censoredItem.items[0]!.linkage, "ambiguous");
    assert.equal(censoredItem.items[0]!.rawEventIds.length, 1);
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          censorItemA(source, "ordered_epoch", "response-a");
        },
      }),
      /linkage differs from ordered raw epochs/,
    );

    reject(
      rebuildSource(fixture.input, {
        corruptRebuiltEvent(event, frame): void {
          if (frame?.envelope.method === "rawResponse/completed")
            event.rawRef = null;
        },
      }),
      /raw reference/,
    );
    for (const [field, value] of [
      ["byteOffset", 1],
      ["byteLength", 1],
      ["sha256", digest("wrong-raw-slice")],
    ] as const)
      reject(
        rebuildSource(fixture.input, {
          corruptRebuiltEvent(event, frame): void {
            if (
              frame?.envelope.method !== "rawResponse/completed" ||
              recordValue(frame.envelope.params).responseId !== "response-a"
            )
              return;
            const rawRef: Record<string, unknown> = recordValue(event.rawRef);
            rawRef[field] =
              field === "byteOffset" || field === "byteLength"
                ? (rawRef[field] as number) + (value as number)
                : value;
          },
        }),
        /raw server frame inventory differs/,
      );
    reject(
      rebuildSource(fixture.input, {
        corruptRebuiltEvent(event, frame): void {
          if (frame === undefined) return;
          event.type = "raw_event_observed";
        },
      }),
      /one app-server start, one t0 milestone, one t0 binding|one-to-one/,
    );
    reject(
      rebuildSource(fixture.input, {
        corruptRebuiltEvent(event, frame): void {
          if (frame === undefined) return;
          event.payload = {
            ...recordValue(event.payload),
            unexpected: true,
          };
        },
      }),
      /frame payload fields differ/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.responses[0]!.rawEventId = source.items[0]!.rawEventIds[0]!;
        },
      }),
      /raw notification method differs/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.responses[0]!.responseId = "response-foreign";
        },
      }),
      /raw notification provenance differs/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.responses[0]!.usage!.inputTokens += 1;
          source.responses[0]!.usage!.totalTokens += 1;
        },
      }),
      /raw notification provenance differs/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.items[0]!.itemId = "item-foreign";
        },
      }),
      /raw item lifecycle provenance differs/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.items[0] = {
            ...source.items[0]!,
            rawEventIds: [
              source.responses[0]!.rawEventId,
              source.items[0]!.rawEventIds[1]!,
            ],
          };
        },
      }),
      /raw notification method differs/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          const template: Record<string, unknown> = structuredClone(
            source.events[firstResponse(source).eventIndex]!,
          );
          template.eventSha256 = digest("uncited-response-event");
          template.monotonicNs = "800";
          template.utc = "2026-07-29T00:00:00.800Z";
          source.events.push(template);
          source.frames.push({
            eventIndex: source.events.length - 1,
            oldEventId: template.eventSha256 as string,
            envelope: {
              method: "rawResponse/completed",
              params: {
                responseId: "response-hidden",
                threadId: "thread-primary",
                turnId: "turn-1",
                usage: {
                  inputTokens: 1,
                  cachedInputTokens: 0,
                  cacheWriteInputTokens: 0,
                  outputTokens: 1,
                  reasoningOutputTokens: 0,
                  totalTokens: 2,
                },
              },
            },
          });
        },
      }),
      /notification coverage is not exact and complete/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutateRawServer(bytes): Buffer {
          return Buffer.concat([
            bytes,
            Buffer.from('{"id":999,"result":{}}\n', "utf8"),
          ]);
        },
      }),
      /not one-to-one/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutateRawServer(bytes): Buffer {
          const newline: number = bytes.indexOf(0x0a);
          return Buffer.concat([
            bytes.subarray(0, newline + 1),
            Buffer.from("\n", "utf8"),
            bytes.subarray(newline + 1),
          ]);
        },
      }),
      /nonempty LF-delimited frames/,
    );
    let firstRawRef: Record<string, unknown> | undefined;
    let rawFrameIndex = 0;
    reject(
      rebuildSource(fixture.input, {
        corruptRebuiltEvent(event, frame): void {
          if (frame === undefined) return;
          rawFrameIndex++;
          if (firstRawRef === undefined)
            firstRawRef = structuredClone(recordValue(event.rawRef));
          else if (rawFrameIndex === 2)
            event.rawRef = structuredClone(firstRawRef);
        },
      }),
      /raw server frame inventory differs/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          const bound: Record<string, unknown> = structuredClone(
            source.events.find(
              (event) => event.type === "app_server_t0_bound",
            )!,
          );
          bound.eventSha256 = digest("duplicate-bound-event");
          bound.monotonicNs = "900";
          bound.utc = "2026-07-29T00:00:00.900Z";
          source.events.push(bound);
        },
      }),
      /one app-server start, one t0 milestone, one t0 binding/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.events.find(
            (event) => event.type === "app_server_t0_bound",
          )!.type = "app_server_t0_missing";
        },
      }),
      /one app-server start, one t0 milestone, one t0 binding/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          const t0: Record<string, unknown> = structuredClone(
            source.events.find(
              (event) =>
                event.type === "milestone_reached" &&
                recordValue(event.payload).name === "t0",
            )!,
          );
          t0.eventSha256 = digest("duplicate-t0-event");
          t0.monotonicNs = "900";
          t0.utc = "2026-07-29T00:00:00.900Z";
          source.events.push(t0);
        },
      }),
      /one app-server start, one t0 milestone, one t0 binding/,
    );
    reject(
      rebuildSource(fixture.input, {
        corruptRebuiltEvent(event, frame): void {
          if (frame === undefined) return;
          recordValue(event.payload).transportSessionId =
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        },
      }),
      /crosses a process or transport session/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          recordValue(
            source.events.find((event) => event.type === "app_server_started")!
              .payload,
          ).pid = 0;
        },
      }),
      /public launch identity is invalid/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          recordValue(
            source.events.find((event) => event.type === "app_server_started")!
              .payload,
          ).executableSha256 = digest("foreign-executable");
        },
      }),
      /public launch identity is invalid/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          recordValue(
            source.events.find((event) => event.type === "app_server_started")!
              .payload,
          ).absoluteCommand = "C:\\private\\codex.exe";
        },
      }),
      /start payload fields differ/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.items[2]!.linkedResponseId = "response-a";
        },
      }),
      /linkage differs from ordered raw epochs/,
    );
    reject(
      rebuildSource(fixture.input, {
        mutate(source): void {
          source.items[0] = {
            ...source.items[0]!,
            startedAtSourceMs: null,
            completedAtSourceMs: null,
            startedReceiptMonotonicNs: null,
            completedReceiptMonotonicNs: null,
            sourceDurationMs: null,
            linkedResponseId: null,
            linkage: "unlinked",
            rawEventIds: [],
          };
        },
      }),
      /has no observed lifecycle endpoint/,
    );
    reject(
      rebuildSource(fixture.input, {
        corruptRebuiltEvent(event, frame): void {
          if (
            frame?.envelope.method === "rawResponse/completed" &&
            recordValue(frame.envelope.params).responseId === "response-a"
          ) {
            event.monotonicNs = "50";
            event.utc = "2026-07-29T00:00:00.050Z";
          }
        },
      }),
      /event ledger chain differs/,
    );
    reject(
      rebindRunManifest(fixture.input, (manifest): void => {
        recordValue(manifest.runner).codexCliVersion = "0.146.0";
      }),
      /run manifest failed protocol validation/,
    );
  }

  /**
   * Verifies two isolated ratings and fresh adjudication reduce reproducibly.
   *
   * The fixture includes same-category overlap, cross-category overlap, source
   * duration drift, and uncovered wall so union, activity, overlap, exclusive,
   * probability, and residual quantities exercise different arithmetic.
   *
   * 1. Rate both response units in independent synthetic sessions.
   * 2. Bind a third session to the exact queue and both rating digests.
   * 3. Reconcile exact tokens and the complete wall while preserving estimates.
   */
  function testIndependentJudgmentsAndReducer(protocolRoot: string): void {
    const fixture: Fixture = fixtureObservations(protocolRoot);
    const raterA: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      fixture.observations,
      "a",
      [
        rating(
          "response-a",
          { method_reading: 8_000, planning_inventory: 2_000 },
          "direct_method_burden",
          ["direct_method_campaign"],
          0.9,
          `Method reading dominates ${citation(fixture.observations, "response-a")}.`,
        ),
        rating(
          "response-b",
          { implementation: 7_000, deterministic_feedback: 3_000 },
          "shared",
          ["shared_product_work"],
          0.8,
          `Implementation dominates ${citation(fixture.observations, "response-b")}.`,
        ),
      ],
    );
    const raterB: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      fixture.observations,
      "b",
      [
        rating(
          "response-a",
          { method_reading: 7_000, planning_inventory: 3_000 },
          "direct_method_burden",
          ["direct_method_campaign"],
          0.85,
          `Method reading dominates ${citation(fixture.observations, "response-a")}.`,
        ),
        rating(
          "response-b",
          { implementation: 6_000, deterministic_feedback: 4_000 },
          "shared",
          ["shared_product_work"],
          0.65,
          `Implementation is mixed with feedback ${citation(fixture.observations, "response-b")}.`,
        ),
      ],
    );
    const left = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      raterA,
      executionEvidence(raterA),
    );
    const right = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      raterB,
      executionEvidence(raterB),
    );
    const queue = EvidenceBenchmarkActivityJudgments.queue(
      fixture.observations,
      left,
      right,
    );
    assert.deepEqual(
      queue.map((entry) => entry.responseId),
      ["response-a", "response-b"],
    );
    const adjudicator: IEvidenceBenchmarkActivity.IAdjudicatorArtifact =
      adjudicatorArtifact(fixture.observations, raterA, raterB, queue);
    const report: IEvidenceBenchmarkActivity.IReport =
      EvidenceBenchmarkActivityReducer.reduce({
        observations: fixture.observations,
        raters: [raterA, raterB],
        raterEvidence: [executionEvidence(raterA), executionEvidence(raterB)],
        adjudicator,
        adjudicatorEvidence: executionEvidence(adjudicator),
      });
    EvidenceBenchmarkProtocolValidator.validateValue(
      canonicalProtocolRoot(),
      "activity-report.schema.json",
      report,
      "activity report positive fixture",
    );
    EvidenceBenchmarkProtocolValidator.validateValue(
      canonicalProtocolRoot(),
      "activity-execution.schema.json",
      raterA.execution,
      "activity execution positive fixture",
    );
    EvidenceBenchmarkProtocolValidator.validateBytes(
      canonicalProtocolRoot(),
      "activity-process-identity.schema.json",
      executionEvidence(raterA).processIdentityArtifactBytes,
      "activity process identity positive fixture",
    );
    assert.equal(report.exactTokenReconciled, true);
    assert.equal(report.exclusiveWallReconciled, true);
    assert.equal(report.wallTimeNs, "1000");
    assert.equal(report.coveredUnionWallNs, "300");
    assert.equal(report.residualWallNs, "800");
    assert.equal(report.semanticQuantitiesAreEstimates, true);
    assert.equal(report.semanticAttributionStatus, "complete");
    assert.equal(report.phaseAllocations.length, 2);
    assert.equal(report.phaseAllocations[0]!.phase, "phase2_discovery");
    assert.deepEqual(report.phaseAllocations[0]!.phaseSegmentIds, [
      "discovery-1",
      "discovery-2",
    ]);
    assert.equal(report.phaseAllocations[0]!.wallTimeNs, "500");
    assert.deepEqual(report.phaseAllocations[0]!.exactTotal, report.exactTotal);
    assert.equal(report.phaseAllocations[0]!.exactTokenReconciled, true);
    assert.equal(report.phaseAllocations[0]!.exclusiveWallReconciled, true);
    assert.equal(report.phaseAllocations[1]!.phase, "phase2_fix");
    assert.deepEqual(report.phaseAllocations[1]!.phaseSegmentIds, [
      "fix-1",
      "fix-2",
    ]);
    assert.equal(report.phaseAllocations[1]!.wallTimeNs, "500");
    assert.equal(report.phaseAllocations[1]!.exactTotal.totalTokens, 0);
    assert.equal(report.raterAgreement.primaryObservedAgreement, 1);
    assert.equal(report.raterAgreement.primaryCohenKappa, 1);
    assert.equal(report.raterAgreement.causalRoleAgreement, 1);
    assert.equal(report.raterAgreement.meanSecondaryMechanismJaccard, 1);
    assert.ok(report.raterAgreement.meanProbabilityJensenShannonBits > 0);
    assert.deepEqual(report.exactTotal, {
      inputTokens: 180,
      cachedInputTokens: 20,
      cacheWriteInputTokens: 10,
      normalizedNonCachedInputTokens: 150,
      outputTokens: 50,
      reasoningOutputTokens: 15,
      totalTokens: 230,
    });
    const methodTime = report.timeAllocations.find(
      (row) => row.primary === "method_reading",
    )!;
    assert.equal(methodTime.categoryUnionWallNs, "100");
    assert.equal(methodTime.sourceActivityTimeMs, 100);
    const implementationTime = report.timeAllocations.find(
      (row) => row.primary === "implementation",
    )!;
    assert.equal(implementationTime.categoryUnionWallNs, "100");
    assert.deepEqual(report.pairwiseOverlap, []);
    assert.equal(
      report.timeAllocations
        .map((row) => BigInt(row.exclusiveEquivalentWallNs))
        .reduce((sum, value) => sum + value, 0n),
      1_000n,
    );
    assert.equal(
      report.reportSha256,
      EvidenceBenchmarkActivityCanonical.object(
        Object.fromEntries(
          Object.entries(report).filter(([key]) => key !== "reportSha256"),
        ),
      ),
    );
  }

  /**
   * Verifies local semantics reject false independence and bad probabilities.
   *
   * Provider JSON Schema cannot prove basis-point totals, rater isolation,
   * event citation membership, or causal consistency, so these remain launch
   * gates.
   *
   * 1. Corrupt one probability sum.
   * 2. Reuse one rater session under a second turn class.
   * 3. Assert local admission rejects both otherwise schema-shaped outputs.
   */
  function testFailClosedJudgments(protocolRoot: string): void {
    const fixture: Fixture = fixtureObservations(protocolRoot);
    const valid: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      fixture.observations,
      "a",
      [
        rating(
          "response-a",
          { method_reading: 10_000 },
          "direct_method_burden",
          ["direct_method_campaign"],
          0.9,
          `Direct evidence ${citation(fixture.observations, "response-a")}.`,
        ),
        rating(
          "response-b",
          { implementation: 10_000 },
          "shared",
          ["shared_product_work"],
          0.9,
          `Direct evidence ${citation(fixture.observations, "response-b")}.`,
        ),
      ],
    );
    const invalidRatings = structuredClone(valid.providerOutput.ratings);
    invalidRatings[0]!.probabilityBasisPoints = {
      ...invalidRatings[0]!.probabilityBasisPoints,
      method_reading: 9_999,
    };
    const invalid: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      fixture.observations,
      "a",
      invalidRatings,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityJudgments.admitRater(
          fixture.observations,
          invalid,
          executionEvidence(invalid),
        ),
      /sum to 10,000/,
    );
    const forgedOutput: IEvidenceBenchmarkActivity.IRaterArtifact =
      structuredClone(valid);
    forgedOutput.providerOutput.ratings[0]!.rationale = `Forged ${citation(fixture.observations, "response-a")}.`;
    rehashRater(forgedOutput);
    assert.throws(
      () =>
        EvidenceBenchmarkActivityJudgments.admitRater(
          fixture.observations,
          forgedOutput,
          executionEvidence(valid),
        ),
      /execution differs from its runner assignment/,
    );
    const wrongIdentityEvidence: IEvidenceBenchmarkActivity.IModelExecutionEvidence =
      structuredClone(executionEvidence(valid));
    const wrongIdentity = JSON.parse(
      Buffer.from(wrongIdentityEvidence.processIdentityArtifactBytes).toString(
        "utf8",
      ),
    ) as Record<string, unknown>;
    wrongIdentity.authenticationClass = "api-key";
    wrongIdentityEvidence.processIdentityArtifactBytes = Buffer.from(
      `${JSON.stringify(wrongIdentity)}\n`,
      "utf8",
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityJudgments.admitRater(
          fixture.observations,
          valid,
          wrongIdentityEvidence,
        ),
      /process identity artifact exact bytes differ/,
    );
    const extraResponseEvidence: IEvidenceBenchmarkActivity.IModelExecutionEvidence =
      structuredClone(executionEvidence(valid));
    const extraUsage = JSON.parse(
      Buffer.from(extraResponseEvidence.usageLedgerBytes).toString("utf8"),
    ) as {
      exactUsageComplete: boolean;
      responses: Record<string, unknown>[];
    };
    extraUsage.responses.push({
      ...extraUsage.responses[0]!,
      responseId: "unbound-extra-response",
    });
    extraResponseEvidence.usageLedgerBytes = Buffer.from(
      `${JSON.stringify(extraUsage)}\n`,
      "utf8",
    );
    const extraResponseExecution = structuredClone(valid.execution);
    extraResponseExecution.usageLedgerSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(
        extraResponseEvidence.usageLedgerBytes,
      );
    const {
      executionSha256: _extraExecutionIgnored,
      ...extraResponseExecutionBody
    } = extraResponseExecution;
    extraResponseExecution.executionSha256 =
      EvidenceBenchmarkActivityCanonical.object(extraResponseExecutionBody);
    assert.throws(
      () =>
        EvidenceBenchmarkActivityExecutions.admit(
          fixture.observations.binding,
          extraResponseExecution,
          extraResponseEvidence,
          {
            assignmentSha256: valid.assignment.assignmentSha256,
            agentRole: valid.assignment.turnClass,
            sessionId: valid.assignment.sessionId,
            threadId: valid.assignment.threadId,
            providerOutputSha256: valid.providerOutputSha256,
            processProvenanceSha256: valid.assignment.processProvenanceSha256,
          },
        ),
      /usage ledger is not exact and complete/,
    );
    const reusedAssignment: IEvidenceBenchmarkActivity.IRaterArtifact =
      structuredClone(valid);
    reusedAssignment.assignment.observationSha256 = digest(
      "another-observation",
    );
    const { assignmentSha256: _assignmentIgnored, ...reusedAssignmentBody } =
      reusedAssignment.assignment;
    reusedAssignment.assignment.assignmentSha256 =
      EvidenceBenchmarkActivityCanonical.object(reusedAssignmentBody);
    rehashRater(reusedAssignment);
    assert.throws(
      () =>
        EvidenceBenchmarkActivityJudgments.admitRater(
          fixture.observations,
          reusedAssignment,
          executionEvidence(valid),
        ),
      /not sealed to observations/,
    );
    const duplicateSession: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      fixture.observations,
      "b",
      structuredClone(valid.providerOutput.ratings),
      valid.assignment.sessionId,
    );
    const admittedA = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      valid,
      executionEvidence(valid),
    );
    const admittedB = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      duplicateSession,
      executionEvidence(duplicateSession),
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityJudgments.independent(admittedA, admittedB),
      /sessionId/,
    );
    const sharedProcess: ProcessFixture = processIdentity(
      "shared-process-instance",
      800,
    );
    const sharedProcessA: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      fixture.observations,
      "a",
      structuredClone(valid.providerOutput.ratings),
      undefined,
      sharedProcess,
    );
    const sharedProcessB: IEvidenceBenchmarkActivity.IRaterArtifact = rater(
      fixture.observations,
      "b",
      structuredClone(valid.providerOutput.ratings),
      undefined,
      sharedProcess,
    );
    const sharedAdmittedA = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      sharedProcessA,
      executionEvidence(sharedProcessA),
    );
    const sharedAdmittedB = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      sharedProcessB,
      executionEvidence(sharedProcessB),
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityJudgments.independent(
          sharedAdmittedA,
          sharedAdmittedB,
        ),
      /processIdentityArtifactSha256/,
    );
  }

  interface Fixture {
    input: EvidenceBenchmarkActivityObservations.IInput;
    observations: IEvidenceBenchmarkActivity.IObservations;
  }

  function fixtureObservations(protocolRoot: string): Fixture {
    const usageA = {
      inputTokens: 100,
      cachedInputTokens: 20,
      cacheWriteInputTokens: 10,
      outputTokens: 30,
      reasoningOutputTokens: 10,
      totalTokens: 130,
    };
    const usageB = {
      inputTokens: 80,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 20,
      reasoningOutputTokens: 5,
      totalTokens: 100,
    };
    const sourceEventLedger: EventFixture = eventLedger([
      itemFrameFixture("item-a-started", "item/started", "item-a", 100, 100),
      itemFrameFixture(
        "item-a-completed",
        "item/completed",
        "item-a",
        200,
        200,
      ),
      responseFrameFixture(
        "event-a",
        "response-a",
        "thread-primary",
        225,
        usageA,
      ),
      itemFrameFixture("item-b-started", "item/started", "item-b", 300, 300),
      itemFrameFixture(
        "item-b-completed",
        "item/completed",
        "item-b",
        400,
        400,
      ),
      itemFrameFixture("item-c-started", "item/started", "item-c", 600, 600),
      itemFrameFixture(
        "item-c-completed",
        "item/completed",
        "item-c",
        700,
        700,
      ),
      responseFrameFixture(
        "event-b",
        "response-b",
        "thread-descendant",
        725,
        usageB,
      ),
    ]);
    const responses: IEvidenceBenchmarkActivity.IResponseUsage[] = [
      {
        responseId: "response-a",
        threadId: "thread-primary",
        turnId: "turn-1",
        phase: "phase2_discovery",
        phaseSegmentId: "discovery-1",
        receivedAtUtc: "2026-07-29T00:00:00.225Z",
        receivedMonotonicNs: "225",
        rawEventId: sourceEventLedger.ids.get("event-a")!,
        usage: usageA,
      },
      {
        responseId: "response-b",
        threadId: "thread-descendant",
        turnId: "turn-1",
        phase: "phase2_discovery",
        phaseSegmentId: "discovery-2",
        receivedAtUtc: "2026-07-29T00:00:00.725Z",
        receivedMonotonicNs: "725",
        rawEventId: sourceEventLedger.ids.get("event-b")!,
        usage: usageB,
      },
    ];
    const sourceUsageLedgerBytes: Buffer = usageLedger(responses);
    const registry: EvidenceBenchmarkActivityRegistry.IBinding =
      EvidenceBenchmarkActivityRegistry.admit(protocolRoot);
    const materializationManifest = {
      schemaVersion: 2,
      treeAlgorithm: "sha256-posix-path-nul-bytes-v1",
      baseTreeSha256: digest("base-tree"),
      armTreeSha256: digest("arm-tree"),
      requirementsTreeSha256: digest("requirements-tree"),
      workspaceTreeSha256: digest("workspace-tree"),
      inputSha256: digest("materialization-input"),
    };
    const materializationManifestBytes: Buffer = Buffer.from(
      `${JSON.stringify(materializationManifest)}\n`,
      "utf8",
    );
    const runManifest = runManifestFixture(protocolRoot);
    const runManifestBytes: Buffer = Buffer.from(
      `${JSON.stringify(runManifest)}\n`,
      "utf8",
    );
    const observedItems: IEvidenceBenchmarkActivity.IItemObservation[] = [
      item(
        "item-a",
        "response-a",
        "phase2_discovery",
        "discovery-1",
        "100",
        "200",
        100,
        sourceEventLedger.ids,
      ),
      item(
        "item-b",
        "response-a",
        "phase2_fix",
        "fix-1",
        "300",
        "400",
        100,
        sourceEventLedger.ids,
      ),
      item(
        "item-c",
        "response-b",
        "phase2_discovery",
        "discovery-2",
        "600",
        "700",
        100,
        sourceEventLedger.ids,
      ),
    ];
    const observedWall: IEvidenceBenchmarkActivity.IWallInterval = {
      startedMonotonicNs: "0",
      completedMonotonicNs: "1000",
    };
    const observedPhaseSegments: IEvidenceBenchmarkActivity.IPhaseSegment[] = [
      {
        phaseSegmentId: "discovery-1",
        phase: "phase2_discovery",
        wall: {
          startedMonotonicNs: "0",
          completedMonotonicNs: "250",
        },
      },
      {
        phaseSegmentId: "fix-1",
        phase: "phase2_fix",
        wall: {
          startedMonotonicNs: "250",
          completedMonotonicNs: "500",
        },
      },
      {
        phaseSegmentId: "discovery-2",
        phase: "phase2_discovery",
        wall: {
          startedMonotonicNs: "500",
          completedMonotonicNs: "750",
        },
      },
      {
        phaseSegmentId: "fix-2",
        phase: "phase2_fix",
        wall: {
          startedMonotonicNs: "750",
          completedMonotonicNs: "1000",
        },
      },
    ];
    const sourceActivityLedgerBytes: Buffer = activityLedger(
      sourceEventLedger.bytes,
      sourceEventLedger.head,
      sourceEventLedger.rawServerBytes,
      sourceUsageLedgerBytes,
      observedWall,
      observedPhaseSegments,
      observedItems,
      responses.length,
    );
    const coreSeal = {
      schemaVersion: 1,
      runId: "todo-plain-r1",
      terminalStatus: "completed",
      manifestSha256:
        EvidenceBenchmarkActivityCanonical.sha256(runManifestBytes),
      gradingInputManifestSha256: digest("grading-input"),
      coreTreeSha256: digest("core-tree"),
      eventChainHeadSha256: sourceEventLedger.head,
      rawServerLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
        sourceEventLedger.rawServerBytes,
      ),
      usageReportSha256: EvidenceBenchmarkActivityCanonical.sha256(
        sourceUsageLedgerBytes,
      ),
      activityLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
        sourceActivityLedgerBytes,
      ),
      costReportSha256: digest("cost-report"),
      tDoneSnapshotManifestSha256: null,
      tDrySnapshotManifestSha256: null,
      sealedAtUtc: "2026-07-29T00:00:01.000Z",
      sealSha256: digest("core-seal"),
    };
    const coreSealBytes: Buffer = Buffer.from(
      `${JSON.stringify(coreSeal)}\n`,
      "utf8",
    );
    const binding: IEvidenceBenchmarkActivity.IBinding = {
      schemaVersion: 1,
      exactByteDigestAlgorithm: "sha256(exact-bytes)",
      canonicalObjectDigestAlgorithm: "sha256(utf8-bytewise-key-order-json-lf)",
      frozenInputTreeAlgorithm: "sha256-posix-path-nul-bytes-v1",
      runId: "todo-plain-r1",
      blockId: "todo-reddit-r1",
      subject: "todo",
      arm: "plain",
      replicate: 1,
      milestone: "t_dry",
      baseTreeSha256: digest("base-tree"),
      armTreeSha256: digest("arm-tree"),
      requirementsTreeSha256: digest("requirements-tree"),
      workspaceTreeSha256: digest("workspace-tree"),
      materializationInputSha256: digest("materialization-input"),
      materializationManifestSha256: EvidenceBenchmarkActivityCanonical.sha256(
        materializationManifestBytes,
      ),
      runManifestSha256:
        EvidenceBenchmarkActivityCanonical.sha256(runManifestBytes),
      parentCoreSealSha256:
        EvidenceBenchmarkActivityCanonical.sha256(coreSealBytes),
      protocolRevisionSha256: digest("protocol"),
      codebookSha256: EvidenceBenchmarkActivityCodebook.SHA256,
      sourceUsageLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
        sourceUsageLedgerBytes,
      ),
      sourceEventLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
        sourceEventLedger.bytes,
      ),
      sourceRawServerLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
        sourceEventLedger.rawServerBytes,
      ),
      sourceActivityLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
        sourceActivityLedgerBytes,
      ),
      eventChainTerminalSha256: sourceEventLedger.head,
      providerOutputRegistrySha256: registry.registrySha256,
      activityRatingProviderSchemaSha256:
        registry.activityRatingProviderSchemaSha256,
      activityRatingLocalSchemaSha256: registry.activityRatingLocalSchemaSha256,
      adjudicationProviderSchemaSha256:
        registry.adjudicationProviderSchemaSha256,
      adjudicationLocalSchemaSha256: registry.adjudicationLocalSchemaSha256,
      activityProcessIdentitySchemaSha256: protocolFileSha256(
        protocolRoot,
        "schema/activity-process-identity.schema.json",
      ),
      activityExecutionSchemaSha256: protocolFileSha256(
        protocolRoot,
        "schema/activity-execution.schema.json",
      ),
    };
    const input: EvidenceBenchmarkActivityObservations.IInput = {
      protocolRoot,
      binding,
      parentCoreSealBytes: coreSealBytes,
      runManifestBytes,
      materializationManifestBytes,
      sourceUsageLedgerBytes,
      sourceEventLedgerBytes: sourceEventLedger.bytes,
      sourceRawServerLedgerBytes: sourceEventLedger.rawServerBytes,
      sourceActivityLedgerBytes,
      rawResponseCompletedSchemaBytes: protocolFile(
        protocolRoot,
        EvidenceBenchmarkActivityVendorSchemas.RAW_RESPONSE_COMPLETED.path,
      ),
      itemStartedSchemaBytes: protocolFile(
        protocolRoot,
        EvidenceBenchmarkActivityVendorSchemas.ITEM_STARTED.path,
      ),
      itemCompletedSchemaBytes: protocolFile(
        protocolRoot,
        EvidenceBenchmarkActivityVendorSchemas.ITEM_COMPLETED.path,
      ),
      wall: observedWall,
      phaseSegments: observedPhaseSegments,
      responses,
      items: observedItems,
    };
    return {
      input,
      observations: EvidenceBenchmarkActivityObservations.create(input),
    };
  }

  interface MutableRawFrame {
    eventIndex: number;
    oldEventId: string;
    envelope: Record<string, unknown>;
  }

  interface MutableSource {
    events: Record<string, unknown>[];
    frames: MutableRawFrame[];
    responses: IEvidenceBenchmarkActivity.IResponseUsage[];
    items: IEvidenceBenchmarkActivity.IItemObservation[];
  }

  interface RebuildSourceOptions {
    mutate?: (source: MutableSource) => void;
    corruptRebuiltEvent?: (
      event: Record<string, unknown>,
      frame: MutableRawFrame | undefined,
    ) => void;
    mutateRawServer?: (bytes: Buffer) => Buffer;
  }

  /**
   * Re-seals every attacker-controlled outer artifact after a source mutation.
   *
   * Negative fixtures therefore reach the raw-frame invariant under test
   * instead of failing early only because a stale outer digest was left
   * behind.
   */
  function rebuildSource(
    input: EvidenceBenchmarkActivityObservations.IInput,
    options: RebuildSourceOptions,
  ): EvidenceBenchmarkActivityObservations.IInput {
    const events: Record<string, unknown>[] = Buffer.from(
      input.sourceEventLedgerBytes,
    )
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const originalRaw: Buffer = Buffer.from(input.sourceRawServerLedgerBytes);
    const frames: MutableRawFrame[] = [];
    for (const [eventIndex, event] of events.entries()) {
      if (event.type !== "app_server_frame") continue;
      const rawRef: Record<string, unknown> = recordValue(event.rawRef);
      const offset: number = rawRef.byteOffset as number;
      const length: number = rawRef.byteLength as number;
      frames.push({
        eventIndex,
        oldEventId: event.eventSha256 as string,
        envelope: JSON.parse(
          originalRaw.subarray(offset, offset + length).toString("utf8"),
        ) as Record<string, unknown>,
      });
    }
    const source: MutableSource = {
      events,
      frames,
      responses: structuredClone([...input.responses]),
      items: structuredClone([...input.items]),
    };
    options.mutate?.(source);

    const encodedFrames: Buffer[] = frames.map((frame) =>
      Buffer.from(JSON.stringify(frame.envelope), "utf8"),
    );
    let rawOffset = 0;
    for (const [index, frame] of frames.entries()) {
      const bytes: Buffer = encodedFrames[index]!;
      source.events[frame.eventIndex]!.rawRef = {
        direction: "server",
        path: "server.raw.jsonl",
        byteOffset: rawOffset,
        byteLength: bytes.byteLength,
        sha256: EvidenceBenchmarkActivityCanonical.sha256(bytes),
      };
      rawOffset += bytes.byteLength + 1;
    }
    let rawServerBytes: Buffer = Buffer.from(
      `${encodedFrames.map((frame) => frame.toString("utf8")).join("\n")}\n`,
      "utf8",
    );
    rawServerBytes =
      options.mutateRawServer?.(rawServerBytes) ?? rawServerBytes;

    const frameByEventIndex: Map<number, MutableRawFrame> = new Map(
      frames.map((frame) => [frame.eventIndex, frame]),
    );
    const eventIdMap: Map<string, string> = new Map();
    let previous: string = "0".repeat(64);
    for (const [index, event] of source.events.entries()) {
      const oldEventId: string = event.eventSha256 as string;
      delete event.eventSha256;
      event.seq = index + 1;
      event.previousEventSha256 = previous;
      options.corruptRebuiltEvent?.(event, frameByEventIndex.get(index));
      const eventSha256: string =
        EvidenceBenchmarkActivityJcs.eventSha256(event);
      event.eventSha256 = eventSha256;
      eventIdMap.set(oldEventId, eventSha256);
      previous = eventSha256;
    }
    const remap = (eventId: string): string => {
      const mapped: string | undefined = eventIdMap.get(eventId);
      if (mapped === undefined)
        throw new Error(
          `Fixture mutation references unknown event ${eventId}.`,
        );
      return mapped;
    };
    for (const response of source.responses)
      response.rawEventId = remap(response.rawEventId);
    for (const item of source.items)
      item.rawEventIds = item.rawEventIds.map(remap);

    const sourceEventLedgerBytes: Buffer = Buffer.from(
      `${source.events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    );
    const sourceUsageLedgerBytes: Buffer = usageLedger(source.responses);
    const sourceActivityLedgerBytes: Buffer = activityLedger(
      sourceEventLedgerBytes,
      previous,
      rawServerBytes,
      sourceUsageLedgerBytes,
      input.wall,
      input.phaseSegments,
      source.items,
      source.responses.length,
    );
    const core: Record<string, unknown> = JSON.parse(
      Buffer.from(input.parentCoreSealBytes).toString("utf8"),
    ) as Record<string, unknown>;
    core.eventChainHeadSha256 = previous;
    core.rawServerLedgerSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(rawServerBytes);
    core.usageReportSha256 = EvidenceBenchmarkActivityCanonical.sha256(
      sourceUsageLedgerBytes,
    );
    core.activityLedgerSha256 = EvidenceBenchmarkActivityCanonical.sha256(
      sourceActivityLedgerBytes,
    );
    const parentCoreSealBytes: Buffer = Buffer.from(
      `${JSON.stringify(core)}\n`,
      "utf8",
    );
    return {
      ...input,
      binding: {
        ...input.binding,
        parentCoreSealSha256:
          EvidenceBenchmarkActivityCanonical.sha256(parentCoreSealBytes),
        sourceUsageLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
          sourceUsageLedgerBytes,
        ),
        sourceEventLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
          sourceEventLedgerBytes,
        ),
        sourceRawServerLedgerSha256:
          EvidenceBenchmarkActivityCanonical.sha256(rawServerBytes),
        sourceActivityLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
          sourceActivityLedgerBytes,
        ),
        eventChainTerminalSha256: previous,
      },
      parentCoreSealBytes,
      sourceUsageLedgerBytes,
      sourceEventLedgerBytes,
      sourceRawServerLedgerBytes: rawServerBytes,
      sourceActivityLedgerBytes,
      responses: source.responses,
      items: source.items,
    };
  }

  function rebindRunManifest(
    input: EvidenceBenchmarkActivityObservations.IInput,
    mutate: (manifest: Record<string, unknown>) => void,
  ): EvidenceBenchmarkActivityObservations.IInput {
    const manifest: Record<string, unknown> = JSON.parse(
      Buffer.from(input.runManifestBytes).toString("utf8"),
    ) as Record<string, unknown>;
    mutate(manifest);
    const runManifestBytes: Buffer = Buffer.from(
      `${JSON.stringify(manifest)}\n`,
      "utf8",
    );
    const core: Record<string, unknown> = JSON.parse(
      Buffer.from(input.parentCoreSealBytes).toString("utf8"),
    ) as Record<string, unknown>;
    core.manifestSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(runManifestBytes);
    const parentCoreSealBytes: Buffer = Buffer.from(
      `${JSON.stringify(core)}\n`,
      "utf8",
    );
    return {
      ...input,
      binding: {
        ...input.binding,
        runManifestSha256:
          EvidenceBenchmarkActivityCanonical.sha256(runManifestBytes),
        parentCoreSealSha256:
          EvidenceBenchmarkActivityCanonical.sha256(parentCoreSealBytes),
      },
      runManifestBytes,
      parentCoreSealBytes,
    };
  }

  function recordValue(input: unknown): Record<string, unknown> {
    assert.ok(
      typeof input === "object" && input !== null && !Array.isArray(input),
    );
    return input as Record<string, unknown>;
  }

  function item(
    itemId: string,
    responseId: string,
    phase: IEvidenceBenchmarkActivity.Phase,
    phaseSegmentId: string,
    start: string,
    end: string,
    sourceDurationMs: number,
    eventIds: ReadonlyMap<string, string>,
  ): IEvidenceBenchmarkActivity.IItemObservation {
    return {
      observationId: `observation-${itemId}`,
      threadId:
        responseId === "response-a" ? "thread-primary" : "thread-descendant",
      turnId: "turn-1",
      itemId,
      itemType: "sleep",
      phase,
      phaseSegmentId,
      startedAtSourceMs: Number(start),
      completedAtSourceMs: Number(end),
      startedReceiptMonotonicNs: start,
      completedReceiptMonotonicNs: end,
      sourceDurationMs,
      linkedResponseId: itemId === "item-b" ? null : responseId,
      linkage: itemId === "item-b" ? "unlinked" : "ordered_epoch",
      rawEventIds: [
        eventIds.get(`${itemId}-started`)!,
        eventIds.get(`${itemId}-completed`)!,
      ],
    };
  }

  function rating(
    responseId: string,
    nonzero: Partial<
      Record<IEvidenceBenchmarkActivity.PrimaryActivity, number>
    >,
    causalRole: IEvidenceBenchmarkActivity.CausalRole,
    secondaryMechanisms: IEvidenceBenchmarkActivity.SecondaryMechanism[],
    confidence: number,
    rationale: string,
  ): IEvidenceBenchmarkActivity.IProviderRating {
    return {
      responseId,
      probabilityBasisPoints: Object.fromEntries(
        EvidenceBenchmarkActivityCodebook.PRIMARY_ACTIVITIES.map((category) => [
          category,
          nonzero[category] ?? 0,
        ]),
      ) as unknown as IEvidenceBenchmarkActivity.ProbabilityBasisPoints,
      secondaryMechanisms,
      causalRole,
      confidence,
      rationale,
    };
  }

  function rater(
    observations: IEvidenceBenchmarkActivity.IObservations,
    side: "a" | "b",
    ratings: readonly IEvidenceBenchmarkActivity.IProviderRating[],
    sessionOverride?: string,
    processOverride?: ProcessFixture,
  ): IEvidenceBenchmarkActivity.IRaterArtifact {
    const assignmentId: string = `activity-rater-${side}-assignment`;
    const threadId: string = `rating-thread-${side}`;
    const sessionId: string = sessionOverride ?? `rating-session-${side}`;
    const process: ProcessFixture =
      processOverride ??
      processIdentity(`process-rater-${side}`, side === "a" ? 900 : 1_900);
    const providerOutput: IEvidenceBenchmarkActivity.IProviderRatingBlock = {
      schemaVersion: 1,
      role: "activity_rater",
      runId: observations.binding.runId,
      blockId: observations.binding.blockId,
      responseIds: observations.responses.map((row) => row.responseId),
      ratings,
      status: "completed",
    };
    const assignmentBody = {
      schemaVersion: 1 as const,
      issuer: "runner" as const,
      assignmentId,
      binding: observations.binding,
      observationSha256: observations.observationSha256,
      codebookSha256: observations.binding.codebookSha256,
      raterId: `rater-${side}`,
      threadId,
      sessionId,
      model: "gpt-5.6-terra" as const,
      effort: "high" as const,
      turnClass: `activity-rater-${side}` as const,
      responseIds: observations.responses.map((row) => row.responseId),
      allowedEvidenceEventIds: observations.eventIds,
      otherRaterOutputVisible: false as const,
      aggregateArmResultsVisible: false as const,
      processProvenanceSha256: process.sha256,
      issuedAtUtc: "2026-07-29T01:00:00.000Z",
      sealedInputsSha256: EvidenceBenchmarkActivityCanonical.object({
        binding: observations.binding,
        observationSha256: observations.observationSha256,
        codebookSha256: observations.binding.codebookSha256,
        responseIds: observations.responses.map((row) => row.responseId),
        allowedEvidenceEventIds: observations.eventIds,
        turnClass: `activity-rater-${side}`,
      }),
    };
    const assignment: IEvidenceBenchmarkActivity.IRaterAssignment = {
      ...assignmentBody,
      assignmentSha256:
        EvidenceBenchmarkActivityCanonical.object(assignmentBody),
    };
    const providerOutputSha256: string =
      EvidenceBenchmarkActivityCanonical.object(providerOutput);
    const executionFixture: ExecutionFixture = modelExecution(
      observations.binding,
      assignment,
      providerOutput,
      process,
      side === "a" ? 1_000 : 2_000,
    );
    const body = {
      schemaVersion: 1 as const,
      assignment,
      assignmentSha256: assignment.assignmentSha256,
      providerOutput,
      providerOutputSha256,
      execution: executionFixture.execution,
    };
    const artifact: IEvidenceBenchmarkActivity.IRaterArtifact = {
      ...body,
      artifactSha256: EvidenceBenchmarkActivityCanonical.object(body),
    };
    EXECUTION_EVIDENCE.set(artifact, executionFixture.evidence);
    return artifact;
  }

  function adjudicatorArtifact(
    observations: IEvidenceBenchmarkActivity.IObservations,
    left: IEvidenceBenchmarkActivity.IRaterArtifact,
    right: IEvidenceBenchmarkActivity.IRaterArtifact,
    queue: readonly IEvidenceBenchmarkActivity.IAdjudicationQueueEntry[],
  ): IEvidenceBenchmarkActivity.IAdjudicatorArtifact {
    const assignmentId: string = "activity-adjudicator-assignment";
    const threadId: string = "adjudication-thread-c";
    const sessionId: string = "adjudication-session-c";
    const process: ProcessFixture = processIdentity(
      "process-adjudicator-c",
      2_900,
    );
    const queueSha256: string =
      EvidenceBenchmarkActivityCanonical.object(queue);
    const raterArtifactSha256 = [
      left.artifactSha256,
      right.artifactSha256,
    ] as const;
    const sealedInputsSha256: string =
      EvidenceBenchmarkActivityCanonical.object({
        observationSha256: observations.observationSha256,
        raterArtifactSha256,
        queueSha256,
        codebookSha256: observations.binding.codebookSha256,
        parentCoreSealSha256: observations.binding.parentCoreSealSha256,
      });
    const providerOutput: IEvidenceBenchmarkActivity.IProviderAdjudication = {
      schemaVersion: 1,
      role: "llm_adjudicator",
      adjudicationId: "activity-adjudication-1",
      bundleId: "todo-plain-r1-activity",
      subject: "todo",
      phase: "t_dry",
      population: "activity",
      sealedInputsSha256,
      queueSha256,
      decisions: queue.map((entry, index) => ({
        itemId: entry.responseId,
        decision: index === 0 ? "rater_a" : "rater_b",
        confidence: 0.9,
        rationale: `Fresh decision ${citation(observations, entry.responseId)}.`,
      })),
      status: "completed",
    };
    const assignmentBody = {
      schemaVersion: 1 as const,
      issuer: "runner" as const,
      assignmentId,
      binding: observations.binding,
      observationSha256: observations.observationSha256,
      adjudicatorId: "adjudicator-c",
      threadId,
      sessionId,
      model: "gpt-5.6-terra" as const,
      effort: "high" as const,
      raterArtifactSha256,
      queueSha256,
      allowedEvidenceEventIds: observations.eventIds,
      processProvenanceSha256: process.sha256,
      issuedAtUtc: "2026-07-29T01:01:00.000Z",
      sealedInputsSha256,
    };
    const assignment: IEvidenceBenchmarkActivity.IAdjudicatorAssignment = {
      ...assignmentBody,
      assignmentSha256:
        EvidenceBenchmarkActivityCanonical.object(assignmentBody),
    };
    const providerOutputSha256: string =
      EvidenceBenchmarkActivityCanonical.object(providerOutput);
    const executionFixture: ExecutionFixture = modelExecution(
      observations.binding,
      assignment,
      providerOutput,
      process,
      3_000,
    );
    const body = {
      schemaVersion: 1 as const,
      assignment,
      assignmentSha256: assignment.assignmentSha256,
      providerOutput,
      providerOutputSha256,
      execution: executionFixture.execution,
    };
    const artifact: IEvidenceBenchmarkActivity.IAdjudicatorArtifact = {
      ...body,
      artifactSha256: EvidenceBenchmarkActivityCanonical.object(body),
    };
    EXECUTION_EVIDENCE.set(artifact, executionFixture.evidence);
    return artifact;
  }

  function rehashRater(
    artifact: IEvidenceBenchmarkActivity.IRaterArtifact,
  ): void {
    artifact.assignmentSha256 = artifact.assignment.assignmentSha256;
    artifact.providerOutputSha256 = EvidenceBenchmarkActivityCanonical.object(
      artifact.providerOutput,
    );
    const { artifactSha256: _ignored, ...body } = artifact;
    artifact.artifactSha256 = EvidenceBenchmarkActivityCanonical.object(body);
  }

  function rehashAssignment(
    observations: IEvidenceBenchmarkActivity.IObservations,
    assignment: IEvidenceBenchmarkActivity.IRaterAssignment,
  ): void {
    assignment.sealedInputsSha256 = EvidenceBenchmarkActivityCanonical.object({
      binding: observations.binding,
      observationSha256: observations.observationSha256,
      codebookSha256: observations.binding.codebookSha256,
      responseIds: observations.responses.map((row) => row.responseId),
      allowedEvidenceEventIds: assignment.allowedEvidenceEventIds,
      turnClass: assignment.turnClass,
    });
    const { assignmentSha256: _ignored, ...body } = assignment;
    assignment.assignmentSha256 =
      EvidenceBenchmarkActivityCanonical.object(body);
  }

  interface ProcessFixture {
    bytes: Buffer;
    sha256: string;
    identity: IEvidenceBenchmarkActivity.IProcessIdentityArtifact;
  }

  interface ExecutionFixture {
    execution: IEvidenceBenchmarkActivity.IModelExecutionProvenance;
    evidence: IEvidenceBenchmarkActivity.IModelExecutionEvidence;
  }

  function processIdentity(
    processInstanceId: string,
    startedMonotonicNs: number,
  ): ProcessFixture {
    const body = {
      schemaVersion: 1 as const,
      provider: "openai" as const,
      authenticationClass: "chatgpt" as const,
      codexCliVersion: "0.145.0" as const,
      codexExecutableSha256:
        "83751f15cb6a0a7b97df67752c001e3fe1c20e18ffbfec3ff63567296205eb6c",
      model: "gpt-5.6-terra" as const,
      effort: "high" as const,
      requestedServiceTierMode: "omitted" as const,
      requestedServiceTier: null,
      effectiveServiceTier: null,
      processInstanceId,
      processId: startedMonotonicNs,
      startedAtUtc: "2026-07-29T00:59:59.999Z",
      startedMonotonicNs: String(startedMonotonicNs),
      invocation: ["D:/tools/codex.exe", "app-server"],
    };
    const identity: IEvidenceBenchmarkActivity.IProcessIdentityArtifact = {
      ...body,
      identitySha256: EvidenceBenchmarkActivityCanonical.object(body),
    };
    const bytes: Buffer = Buffer.from(`${JSON.stringify(identity)}\n`, "utf8");
    return {
      bytes,
      sha256: EvidenceBenchmarkActivityCanonical.sha256(bytes),
      identity,
    };
  }

  function modelExecution(
    binding: IEvidenceBenchmarkActivity.IBinding,
    assignment:
      | IEvidenceBenchmarkActivity.IRaterAssignment
      | IEvidenceBenchmarkActivity.IAdjudicatorAssignment,
    providerOutput:
      | IEvidenceBenchmarkActivity.IProviderRatingBlock
      | IEvidenceBenchmarkActivity.IProviderAdjudication,
    process: ProcessFixture,
    baseMonotonicNs: number,
  ): ExecutionFixture {
    const repositoryRoot: string = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../..",
    );
    const rawResponseCompletedSchemaBytes: Buffer = fs.readFileSync(
      path.join(
        repositoryRoot,
        ...EvidenceBenchmarkActivityVendorSchemas.RAW_RESPONSE_COMPLETED.path.split(
          "/",
        ),
      ),
    );
    const itemCompletedSchemaBytes: Buffer = fs.readFileSync(
      path.join(
        repositoryRoot,
        ...EvidenceBenchmarkActivityVendorSchemas.ITEM_COMPLETED.path.split(
          "/",
        ),
      ),
    );
    const agentRole:
      "activity-rater-a" | "activity-rater-b" | "activity-adjudicator" =
      "turnClass" in assignment ? assignment.turnClass : "activity-adjudicator";
    const turnId: string = `${agentRole}-turn`;
    const responseId: string = `${agentRole}-response`;
    const providerOutputSha256: string =
      EvidenceBenchmarkActivityCanonical.object(providerOutput);
    const responseUsage = {
      inputTokens: 10,
      cachedInputTokens: 2,
      cacheWriteInputTokens: 1,
      outputTokens: 5,
      reasoningOutputTokens: 2,
      totalTokens: 15,
    };
    const rawResponseEnvelopeBytes: Buffer = Buffer.from(
      `${JSON.stringify({
        method: "rawResponse/completed",
        params: {
          responseId,
          threadId: assignment.threadId,
          turnId,
          usage: responseUsage,
        },
      })}\n`,
      "utf8",
    );
    const rawResponseEnvelopeSha256: string =
      EvidenceBenchmarkActivityCanonical.sha256(rawResponseEnvelopeBytes);
    const structuredOutputItemId: string = `${agentRole}-final-item`;
    const structuredOutputEnvelopeBytes: Buffer = Buffer.from(
      `${JSON.stringify({
        method: "item/completed",
        params: {
          completedAtMs: 1_775_000_000_000,
          threadId: assignment.threadId,
          turnId,
          item: {
            id: structuredOutputItemId,
            type: "agentMessage",
            phase: "final_answer",
            text: EvidenceBenchmarkActivityCanonical.stringify(providerOutput),
          },
        },
      })}\n`,
      "utf8",
    );
    const structuredOutputEnvelopeSha256: string =
      EvidenceBenchmarkActivityCanonical.sha256(structuredOutputEnvelopeBytes);
    const eventBodies: Record<string, unknown>[] = [
      {
        runId: binding.runId,
        seq: 1,
        utc: process.identity.startedAtUtc,
        monotonicNs: process.identity.startedMonotonicNs,
        phase: "reconciliation",
        actor: "runner",
        type: "activity_process_started",
        payload: {
          processInstanceId: process.identity.processInstanceId,
          processId: process.identity.processId,
          invocation: process.identity.invocation,
          codexExecutableSha256: process.identity.codexExecutableSha256,
        },
        rawRef: null,
        previousEventSha256: "0".repeat(64),
      },
      {
        runId: binding.runId,
        seq: 2,
        utc: "2026-07-29T01:00:00.000Z",
        monotonicNs: String(baseMonotonicNs),
        phase: "reconciliation",
        actor: "runner",
        type: "activity_assignment_issued",
        payload: {
          assignmentSha256: assignment.assignmentSha256,
          sessionId: assignment.sessionId,
          threadId: assignment.threadId,
        },
        rawRef: null,
        previousEventSha256: "0".repeat(64),
      },
      {
        runId: binding.runId,
        seq: 3,
        utc: "2026-07-29T01:00:00.001Z",
        monotonicNs: String(baseMonotonicNs + 100),
        phase: "reconciliation",
        actor: "app-server",
        type: "activity_turn_started",
        payload: {
          assignmentSha256: assignment.assignmentSha256,
          threadId: assignment.threadId,
          turnId,
        },
        rawRef: null,
        previousEventSha256: "",
      },
      {
        runId: binding.runId,
        seq: 4,
        utc: "2026-07-29T01:00:00.002Z",
        monotonicNs: String(baseMonotonicNs + 200),
        phase: "reconciliation",
        actor: "app-server",
        type: "activity_raw_response_completed",
        payload: {
          responseId,
          threadId: assignment.threadId,
          turnId,
        },
        rawRef: {
          direction: "server",
          path: "logs/server.raw.jsonl",
          byteOffset: 0,
          byteLength: rawResponseEnvelopeBytes.byteLength,
          sha256: rawResponseEnvelopeSha256,
        },
        previousEventSha256: "",
      },
      {
        runId: binding.runId,
        seq: 5,
        utc: "2026-07-29T01:00:00.003Z",
        monotonicNs: String(baseMonotonicNs + 300),
        phase: "reconciliation",
        actor: "app-server",
        type: "activity_item_completed",
        payload: {
          itemId: structuredOutputItemId,
          threadId: assignment.threadId,
          turnId,
        },
        rawRef: {
          direction: "server",
          path: "logs/server.raw.jsonl",
          byteOffset: rawResponseEnvelopeBytes.byteLength,
          byteLength: structuredOutputEnvelopeBytes.byteLength,
          sha256: structuredOutputEnvelopeSha256,
        },
        previousEventSha256: "",
      },
    ];
    const events: Record<string, unknown>[] = [];
    let previous: string = "0".repeat(64);
    for (const body of eventBodies) {
      body.previousEventSha256 = previous;
      const eventSha256: string =
        EvidenceBenchmarkActivityJcs.eventSha256(body);
      events.push({ ...body, eventSha256 });
      previous = eventSha256;
    }
    const eventLedgerBytes: Buffer = Buffer.from(
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
      "utf8",
    );
    const rawEventId: string = events[3]!.eventSha256 as string;
    const responseReceivedMonotonicNs: string = String(baseMonotonicNs + 200);
    const responseReceivedAtUtc = "2026-07-29T01:00:00.002Z";
    const usageLedgerBytes: Buffer = Buffer.from(
      `${JSON.stringify({
        exactUsageComplete: true,
        responses: [
          {
            responseId,
            threadId: assignment.threadId,
            turnId,
            phase: "grading",
            receivedAtUtc: responseReceivedAtUtc,
            receivedMonotonicNs: responseReceivedMonotonicNs,
            rawEventId,
            usage: responseUsage,
          },
        ],
      })}\n`,
      "utf8",
    );
    const body = {
      schemaVersion: 1 as const,
      issuer: "runner" as const,
      executionSchemaPath:
        "benchmark/protocol/schema/activity-execution.schema.json" as const,
      executionSchemaSha256: binding.activityExecutionSchemaSha256,
      assignmentSha256: assignment.assignmentSha256,
      agentRole,
      threadId: assignment.threadId,
      sessionId: assignment.sessionId,
      turnId,
      responseId,
      rawEventId,
      processStartedEventId: events[0]!.eventSha256 as string,
      assignmentEventId: events[1]!.eventSha256 as string,
      turnStartedEventId: events[2]!.eventSha256 as string,
      assignmentMonotonicNs: String(baseMonotonicNs),
      turnStartedMonotonicNs: String(baseMonotonicNs + 100),
      responseReceivedMonotonicNs,
      responseReceivedAtUtc,
      responseUsage,
      providerOutputSha256,
      itemCompletedEventId: events[4]!.eventSha256 as string,
      structuredOutputItemId,
      structuredOutputEnvelopePath: "logs/server.raw.jsonl" as const,
      structuredOutputEnvelopeByteOffset: rawResponseEnvelopeBytes.byteLength,
      structuredOutputEnvelopeBytes: structuredOutputEnvelopeBytes.byteLength,
      structuredOutputEnvelopeSha256,
      rawResponseEnvelopeBytes: rawResponseEnvelopeBytes.byteLength,
      rawResponseEnvelopePath: "logs/server.raw.jsonl" as const,
      rawResponseEnvelopeByteOffset: 0,
      rawResponseEnvelopeSha256,
      processIdentitySchemaPath:
        "benchmark/protocol/schema/activity-process-identity.schema.json" as const,
      processIdentitySchemaSha256: binding.activityProcessIdentitySchemaSha256,
      processIdentityArtifactPath: `benchmark/result/todo/plain/provenance/${agentRole}.identity.json`,
      processIdentityArtifactBytes: process.bytes.byteLength,
      processIdentityArtifactSha256: process.sha256,
      eventLedgerSha256:
        EvidenceBenchmarkActivityCanonical.sha256(eventLedgerBytes),
      eventChainHeadSha256: previous,
      usageLedgerSha256:
        EvidenceBenchmarkActivityCanonical.sha256(usageLedgerBytes),
    };
    return {
      execution: {
        ...body,
        executionSha256: EvidenceBenchmarkActivityCanonical.object(body),
      },
      evidence: {
        rawResponseCompletedSchemaBytes,
        itemCompletedSchemaBytes,
        eventLedgerBytes,
        usageLedgerBytes,
        processIdentityArtifactBytes: process.bytes,
        rawResponseEnvelopeBytes,
        structuredOutputEnvelopeBytes,
      },
    };
  }

  function executionEvidence(
    artifact:
      | IEvidenceBenchmarkActivity.IRaterArtifact
      | IEvidenceBenchmarkActivity.IAdjudicatorArtifact,
  ): IEvidenceBenchmarkActivity.IModelExecutionEvidence {
    const result:
      IEvidenceBenchmarkActivity.IModelExecutionEvidence | undefined =
      EXECUTION_EVIDENCE.get(artifact);
    assert.ok(result);
    return result;
  }

  const SOURCE_TOKEN_FIELDS = [
    "inputTokens",
    "cachedInputTokens",
    "cacheWriteInputTokens",
    "outputTokens",
    "reasoningOutputTokens",
    "totalTokens",
  ] as const;

  type SourceTokens = Omit<
    IEvidenceBenchmarkActivity.ITokenVector,
    "normalizedNonCachedInputTokens"
  >;

  function sourceTokenZero(): SourceTokens {
    return {
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    };
  }

  function sourceTokenTotal(
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
  ): SourceTokens {
    const result: SourceTokens = sourceTokenZero();
    for (const response of responses) {
      if (response.usage === null) continue;
      for (const field of SOURCE_TOKEN_FIELDS)
        result[field] += response.usage[field];
    }
    return result;
  }

  function usageLedger(
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
  ): Buffer {
    const exactTotal = sourceTokenTotal(responses);
    const exactByThread: Record<string, SourceTokens> = {};
    for (const response of responses) {
      if (response.usage === null) continue;
      const current = exactByThread[response.threadId] ?? sourceTokenZero();
      for (const field of SOURCE_TOKEN_FIELDS)
        current[field] += response.usage[field];
      exactByThread[response.threadId] = current;
    }
    return Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        exactUsageComplete: responses.every((row) => row.usage !== null),
        accumulatedUsageReconciled: false,
        responses: responses.map((row) => ({
          responseId: row.responseId,
          threadId: row.threadId,
          turnId: row.turnId,
          phase: row.phase,
          phaseSegmentId: row.phaseSegmentId,
          receivedAtUtc: row.receivedAtUtc,
          receivedMonotonicNs: row.receivedMonotonicNs,
          rawEventId: row.rawEventId,
          usage: row.usage,
        })),
        duplicateResponseIds: [],
        exactTotal,
        exactByThread,
        latestThreadUsage: {},
        reconciliation: [],
        anomalies: [],
      })}\n`,
      "utf8",
    );
  }

  interface RawFrameFixture {
    key: string;
    monotonicNs: number;
    envelope: Record<string, unknown>;
  }

  const PROCESS_INSTANCE_NONCE = "0123456789abcdef0123456789abcdef";
  const TRANSPORT_SESSION_ID = "fedcba9876543210fedcba9876543210";
  const CODEX_EXECUTABLE_SHA256 =
    "83751f15cb6a0a7b97df67752c001e3fe1c20e18ffbfec3ff63567296205eb6c";

  interface EventFixture {
    bytes: Buffer;
    head: string;
    ids: ReadonlyMap<string, string>;
    rawServerBytes: Buffer;
  }

  function eventLedger(frames: readonly RawFrameFixture[]): EventFixture {
    let previous: string = "0".repeat(64);
    const ids: Map<string, string> = new Map();
    const rawFrames: Buffer[] = frames.map((frame) =>
      Buffer.from(JSON.stringify(frame.envelope), "utf8"),
    );
    const events: Record<string, unknown>[] = [];
    const append = (
      monotonicNs: number,
      phase: "setup" | "agent",
      actor: "runner" | "app-server",
      type: string,
      payload: Record<string, unknown>,
      rawRef: Record<string, unknown> | null = null,
    ): string => {
      const body: Record<string, unknown> = {
        runId: "todo-plain-r1",
        seq: events.length + 1,
        utc: `2026-07-29T00:00:00.${String(monotonicNs).padStart(3, "0")}Z`,
        monotonicNs: String(monotonicNs),
        phase,
        actor,
        type,
        payload,
        rawRef,
        previousEventSha256: previous,
      };
      const eventSha256: string =
        EvidenceBenchmarkActivityJcs.eventSha256(body);
      events.push({ ...body, eventSha256 });
      previous = eventSha256;
      return eventSha256;
    };
    const publicLaunch = {
      binaryRole: "codex-app-server",
      executableFileName: "codex.exe",
      executableVersion: "0.145.0",
      executableSha256: CODEX_EXECUTABLE_SHA256,
      arguments: [{ kind: "literal", value: "app-server" }],
      environmentProvenanceSha256: digest("environment-provenance"),
      environmentManifestFileSha256: digest("environment-manifest"),
    };
    const processStartEventSha256: string = append(
      0,
      "setup",
      "runner",
      "app_server_started",
      {
        ...publicLaunch,
        processInstanceNonce: PROCESS_INSTANCE_NONCE,
        transportSessionId: TRANSPORT_SESSION_ID,
        pid: 12_345,
        startedAtUtc: "2026-07-29T00:00:00.000Z",
        t0Binding: "pending",
        normalizedPublicInvocationSha256:
          EvidenceBenchmarkActivityCanonical.sha256(
            EvidenceBenchmarkActivityCanonical.stringify({
              binaryRole: publicLaunch.binaryRole,
              executableFileName: publicLaunch.executableFileName,
              executableVersion: publicLaunch.executableVersion,
              executableSha256: publicLaunch.executableSha256,
              arguments: publicLaunch.arguments,
            }),
          ),
      },
    );
    const t0EventSha256: string = append(
      0,
      "agent",
      "runner",
      "milestone_reached",
      { name: "t0" },
    );
    append(2, "agent", "runner", "app_server_t0_bound", {
      processInstanceNonce: PROCESS_INSTANCE_NONCE,
      transportSessionId: TRANSPORT_SESSION_ID,
      processStartEventSha256,
      t0EventSha256,
      startMinusT0MonotonicNs: "0",
    });
    let rawOffset: number = 0;
    for (const [index, frame] of frames.entries()) {
      const rawBytes: Buffer = rawFrames[index]!;
      const eventSha256: string = append(
        frame.monotonicNs,
        "agent",
        "app-server",
        "app_server_frame",
        {
          parseError: null,
          processInstanceNonce: PROCESS_INSTANCE_NONCE,
          transportSessionId: TRANSPORT_SESSION_ID,
        },
        {
          direction: "server",
          path: "server.raw.jsonl",
          byteOffset: rawOffset,
          byteLength: rawBytes.byteLength,
          sha256: EvidenceBenchmarkActivityCanonical.sha256(rawBytes),
        },
      );
      ids.set(frame.key, eventSha256);
      rawOffset += rawBytes.byteLength + 1;
    }
    const rawServerBytes: Buffer = Buffer.from(
      `${rawFrames.map((frame) => frame.toString("utf8")).join("\n")}\n`,
      "utf8",
    );
    return {
      bytes: Buffer.from(
        `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      ),
      head: previous,
      ids,
      rawServerBytes,
    };
  }

  function activityLedger(
    eventBytes: Uint8Array,
    eventHead: string,
    rawServerBytes: Uint8Array,
    usageBytes: Uint8Array,
    wall: IEvidenceBenchmarkActivity.IWallInterval,
    phaseSegments: readonly IEvidenceBenchmarkActivity.IPhaseSegment[],
    items: readonly IEvidenceBenchmarkActivity.IItemObservation[],
    responseCount: number,
  ): Buffer {
    return Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        runId: "todo-plain-r1",
        eventLedgerSha256:
          EvidenceBenchmarkActivityCanonical.sha256(eventBytes),
        rawServerLedgerSha256:
          EvidenceBenchmarkActivityCanonical.sha256(rawServerBytes),
        eventChainHeadSha256: eventHead,
        usageReportSha256:
          EvidenceBenchmarkActivityCanonical.sha256(usageBytes),
        eventCaptureComplete: true,
        eventChainClosed: true,
        activityCaptureComplete: true,
        activityLedgerClosed: true,
        expectedResponseCount: responseCount,
        expectedItemObservationCount: items.length,
        wall,
        phaseSegments,
        items,
      })}\n`,
      "utf8",
    );
  }

  function responseFrameFixture(
    key: string,
    responseId: string,
    threadId: string,
    monotonicNs: number,
    usage: Record<string, number>,
  ): RawFrameFixture {
    return {
      key,
      monotonicNs,
      envelope: {
        method: "rawResponse/completed",
        params: {
          responseId,
          threadId,
          turnId: "turn-1",
          usage,
        },
      },
    };
  }

  function itemFrameFixture(
    key: string,
    method: "item/started" | "item/completed",
    itemId: string,
    monotonicNs: number,
    sourceTimestampMs: number,
  ): RawFrameFixture {
    return {
      key,
      monotonicNs,
      envelope: {
        method,
        params: {
          ...(method === "item/started"
            ? { startedAtMs: sourceTimestampMs }
            : { completedAtMs: sourceTimestampMs }),
          item: {
            id: itemId,
            type: "sleep",
            durationMs: 100,
          },
          threadId:
            itemId === "item-c" ? "thread-descendant" : "thread-primary",
          turnId: "turn-1",
        },
      },
    };
  }

  function digest(label: string): string {
    return EvidenceBenchmarkActivityCanonical.sha256(label);
  }

  function canonicalProtocolRoot(): string {
    return path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../protocol",
    );
  }

  function runManifestFixture(protocolRoot: string): Record<string, unknown> {
    const schema: Record<string, unknown> = JSON.parse(
      protocolFile(protocolRoot, "schema/run-manifest.schema.json").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;
    const properties: Record<string, unknown> = recordValue(schema.properties);
    const runnerSchema: Record<string, unknown> = recordValue(
      properties.runner,
    );
    return {
      schemaVersion: 1,
      experiment: {
        runId: "todo-plain-r1",
        subject: "todo",
        arm: "plain",
        replicate: 1,
        blockId: "todo-reddit-r1",
        sourceRevision: "a".repeat(40),
        templateSha256: digest("template"),
        requirementsSha256: digest("requirements"),
        materializerManifestSchemaVersion: 2,
        treeAlgorithm: "sha256-posix-path-nul-bytes-v1",
        subjectFreezeManifestSha256:
          "409aa670f85c94cac653a4041a55a611e0a94873f2152f94947cbe4cefe0ac24",
        quotaPolicySha256:
          "5dae599895578b207c7b46628b7cfc2ee17dce1b4973288199047b0111607763",
        protocolRawTreeAlgorithmId: "sha256-posix-path-nul-bytes-v1",
        protocolRawTreeSha256: digest("protocol"),
        costPredictionsSha256: digest("cost-predictions"),
        acceptanceCatalogSha256: digest("acceptance-catalog"),
        acceptanceCatalogCount: 1,
        contextCatalogSha256: null,
        contextCatalogCount: 0,
        denominatorsSummed: false,
        projectInputSha256: digest("materialization-input"),
        productTgzSha256: digest("product-tgz"),
        environmentSha256: digest("environment"),
        concurrency: 4,
        costAuthorization: {
          id: "fixture-authorization",
          approvedAtUtc: "2026-07-29T00:00:00.000Z",
          maximumObservedTotalTokens: 1,
          maximumObservedBlockTotalTokens: 1,
          hardWallDurationSeconds: 1,
          blockHardWallDurationSeconds: 1,
          hardCeilingGuaranteed: false,
          monetaryStatus: "unavailable",
        },
      },
      runner: requiredConstObject(runnerSchema, "run manifest runner"),
      createdAtUtc: "2026-07-29T00:00:00.000Z",
    };
  }

  function requiredConstObject(
    schema: Record<string, unknown>,
    label: string,
  ): Record<string, unknown> {
    const required: unknown = schema.required;
    const properties: Record<string, unknown> = recordValue(schema.properties);
    assert.ok(Array.isArray(required));
    return Object.fromEntries(
      required.map((field): [string, unknown] => {
        assert.equal(typeof field, "string");
        const property: Record<string, unknown> = recordValue(
          properties[field],
        );
        if (Object.hasOwn(property, "const"))
          return [field, structuredClone(property.const)];
        if (property.type === "object")
          return [field, requiredConstObject(property, `${label}.${field}`)];
        throw new Error(`${label}.${field} fixture lacks a frozen value.`);
      }),
    );
  }

  function protocolFile(
    protocolRoot: string,
    repositoryRelativePath: string,
  ): Buffer {
    const prefix = "benchmark/protocol/";
    const relative: string = repositoryRelativePath.startsWith(prefix)
      ? repositoryRelativePath.slice(prefix.length)
      : repositoryRelativePath;
    return fs.readFileSync(path.join(protocolRoot, ...relative.split("/")));
  }

  function protocolFileSha256(
    protocolRoot: string,
    repositoryRelativePath: string,
  ): string {
    return EvidenceBenchmarkActivityCanonical.sha256(
      protocolFile(protocolRoot, repositoryRelativePath),
    );
  }

  function citation(
    observations: IEvidenceBenchmarkActivity.IObservations,
    responseId: string,
  ): string {
    const response = observations.responses.find(
      (row) => row.responseId === responseId,
    );
    assert.ok(response);
    return `[[event:${response.rawEventId}]]`;
  }

  function writeBytes(location: string, content: string): Buffer {
    const bytes: Buffer = Buffer.from(content, "utf8");
    fs.writeFileSync(location, bytes);
    return bytes;
  }

  function writeProtocol(root: string) {
    fs.mkdirSync(path.join(root, "schema"), { recursive: true });
    const ratingProvider: Buffer = writeBytes(
      path.join(root, "schema/activity-rating-provider.schema.json"),
      '{"type":"object","properties":{"role":{"type":"string"}}}\n',
    );
    const ratingLocal: Buffer = writeBytes(
      path.join(root, "schema/activity-rating-local.schema.json"),
      '{"$ref":"activity-rating-provider.schema.json"}\n',
    );
    const adjudicationProvider: Buffer = writeBytes(
      path.join(root, "schema/adjudication-provider.schema.json"),
      '{"type":"object","properties":{"population":{"type":"string"}}}\n',
    );
    const adjudicationLocal: Buffer = writeBytes(
      path.join(root, "schema/adjudication-local.schema.json"),
      '{"$ref":"adjudication-provider.schema.json"}\n',
    );
    const registry = registryFixture({
      ratingProvider,
      ratingLocal,
      adjudicationProvider,
      adjudicationLocal,
    });
    fs.writeFileSync(
      path.join(root, "provider-output-registry.json"),
      `${JSON.stringify(registry)}\n`,
      "utf8",
    );
    return {
      root,
      registry,
      ratingProvider,
      admitted: EvidenceBenchmarkActivityRegistry.admit(root),
    };
  }

  function registryFixture(input: {
    ratingProvider: Buffer;
    ratingLocal: Buffer;
    adjudicationProvider: Buffer;
    adjudicationLocal: Buffer;
  }) {
    const row = (
      id: string,
      turns: string[],
      providerSchema: string,
      provider: Buffer,
      localSchema: string,
      local: Buffer,
    ) => ({
      id,
      turns,
      providerSchema,
      providerBytes: provider.byteLength,
      providerSha256: EvidenceBenchmarkActivityCanonical.sha256(provider),
      localSchema,
      localBytes: local.byteLength,
      localSha256: EvidenceBenchmarkActivityCanonical.sha256(local),
    });
    return {
      schemaVersion: 1,
      providerKeywordAllowlist: [
        "$schema",
        "$id",
        "$ref",
        "title",
        "type",
        "additionalProperties",
        "required",
        "properties",
        "enum",
        "items",
      ],
      contracts: [
        row(
          "activity-rating-block",
          ["activity-rater-a", "activity-rater-b"],
          "schema/activity-rating-provider.schema.json",
          input.ratingProvider,
          "schema/activity-rating-local.schema.json",
          input.ratingLocal,
        ),
        row(
          "fresh-ai-adjudication",
          ["semantic-adjudicator", "activity-adjudicator"],
          "schema/adjudication-provider.schema.json",
          input.adjudicationProvider,
          "schema/adjudication-local.schema.json",
          input.adjudicationLocal,
        ),
      ],
    };
  }
}
