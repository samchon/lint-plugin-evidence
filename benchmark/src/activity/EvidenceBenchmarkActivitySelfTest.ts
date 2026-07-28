import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityCodebook } from "./EvidenceBenchmarkActivityCodebook.ts";
import { EvidenceBenchmarkActivityJudgments } from "./EvidenceBenchmarkActivityJudgments.ts";
import { EvidenceBenchmarkActivityObservations } from "./EvidenceBenchmarkActivityObservations.ts";
import { EvidenceBenchmarkActivityReducer } from "./EvidenceBenchmarkActivityReducer.ts";
import { EvidenceBenchmarkActivityRegistry } from "./EvidenceBenchmarkActivityRegistry.ts";
import type { IEvidenceBenchmarkActivity } from "./IEvidenceBenchmarkActivity.ts";

/** Runs paid-call-free fixtures for the complete activity attribution contract. */
export namespace EvidenceBenchmarkActivitySelfTest {
  /** Executes integrity, judgment, uncertainty, and interval fixtures. */
  export function main(): void {
    const temporary: string = fs.mkdtempSync(
      path.join(os.tmpdir(), "evidence-activity-attribution-"),
    );
    try {
      testRegistryAdmission(temporary);
      const protocolRoot: string = writeProtocol(
        path.join(temporary, "fixture-protocol"),
      ).root;
      testExactObservationIntegrity(protocolRoot);
      testIndependentJudgmentsAndReducer(protocolRoot);
      testFailClosedJudgments(protocolRoot);
      console.log("Activity attribution self-test passed without paid calls.");
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
    }
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
    assert.equal(fixture.observations.responses.length, 2);
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          parentCoreSealBytes: Buffer.from("altered\n"),
        }),
      /parent core seal/,
    );
    const disconnectedCore: Buffer = Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        complete: true,
        runId: fixture.input.binding.runId,
        manifestSha256: fixture.input.binding.runManifestSha256,
        usageSha256: digest("other-ledger"),
        finalEventSha256: fixture.input.binding.eventChainTerminalSha256,
      })}\n`,
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
    assert.throws(
      () =>
        EvidenceBenchmarkActivityObservations.create({
          ...fixture.input,
          responses: [fixture.input.responses[0]!, fixture.input.responses[0]!],
        }),
      /Duplicate observed response ID|counts differ/,
    );
    const invalidUsage = structuredClone(fixture.input.responses);
    invalidUsage[0]!.usage!.totalTokens += 1;
    const ledgerBytes: Buffer = usageLedger(invalidUsage);
    const invalidCore = JSON.parse(
      Buffer.from(fixture.input.parentCoreSealBytes).toString("utf8"),
    ) as Record<string, unknown>;
    invalidCore.usageSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(ledgerBytes);
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
            parentCoreSealSha256:
              EvidenceBenchmarkActivityCanonical.sha256(invalidCoreBytes),
          },
          parentCoreSealBytes: invalidCoreBytes,
          sourceUsageLedgerBytes: ledgerBytes,
          responses: invalidUsage,
        }),
      /Provider total/,
    );
    const censoredLedger = JSON.parse(
      Buffer.from(fixture.input.sourceUsageLedgerBytes).toString("utf8"),
    ) as Record<string, unknown>;
    censoredLedger.exactUsageComplete = false;
    const censoredLedgerBytes: Buffer = Buffer.from(
      `${JSON.stringify(censoredLedger)}\n`,
      "utf8",
    );
    const censoredCore = JSON.parse(
      Buffer.from(fixture.input.parentCoreSealBytes).toString("utf8"),
    ) as Record<string, unknown>;
    censoredCore.usageSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(censoredLedgerBytes);
    const censoredCoreBytes: Buffer = Buffer.from(
      `${JSON.stringify(censoredCore)}\n`,
      "utf8",
    );
    const censored: IEvidenceBenchmarkActivity.IObservations =
      EvidenceBenchmarkActivityObservations.create({
        ...fixture.input,
        binding: {
          ...fixture.input.binding,
          sourceUsageLedgerSha256:
            EvidenceBenchmarkActivityCanonical.sha256(censoredLedgerBytes),
          parentCoreSealSha256:
            EvidenceBenchmarkActivityCanonical.sha256(censoredCoreBytes),
        },
        parentCoreSealBytes: censoredCoreBytes,
        sourceUsageLedgerBytes: censoredLedgerBytes,
      });
    assert.equal(censored.sourceExactUsageComplete, false);
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
          "Method reading dominates [[event:event-a]].",
        ),
        rating(
          "response-b",
          { implementation: 7_000, deterministic_feedback: 3_000 },
          "shared",
          ["shared_product_work"],
          0.8,
          "Implementation dominates [[event:event-b]].",
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
          "Method reading dominates [[event:event-a]].",
        ),
        rating(
          "response-b",
          { implementation: 6_000, deterministic_feedback: 4_000 },
          "shared",
          ["shared_product_work"],
          0.65,
          "Implementation is mixed with feedback [[event:event-b]].",
        ),
      ],
    );
    const left = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      raterA,
    );
    const right = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      raterB,
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
        adjudicator,
      });
    assert.equal(report.exactTokenReconciled, true);
    assert.equal(report.exclusiveWallReconciled, true);
    assert.equal(report.wallTimeNs, "1000");
    assert.equal(report.coveredUnionWallNs, "800");
    assert.equal(report.residualWallNs, "200");
    assert.equal(report.semanticQuantitiesAreEstimates, true);
    assert.equal(report.semanticAttributionStatus, "complete");
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
    assert.equal(methodTime.categoryUnionWallNs, "600");
    assert.equal(methodTime.sourceActivityTimeMs, 1_100);
    const implementationTime = report.timeAllocations.find(
      (row) => row.primary === "implementation",
    )!;
    assert.equal(implementationTime.categoryUnionWallNs, "500");
    assert.deepEqual(report.pairwiseOverlap, [
      {
        left: "method_reading",
        right: "implementation",
        overlapWallNs: "300",
      },
    ]);
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
          "Direct evidence [[event:event-a]].",
        ),
        rating(
          "response-b",
          { implementation: 10_000 },
          "shared",
          ["shared_product_work"],
          0.9,
          "Direct evidence [[event:event-b]].",
        ),
      ],
    );
    const invalid = structuredClone(valid);
    invalid.providerOutput.ratings[0]!.probabilityBasisPoints = {
      ...invalid.providerOutput.ratings[0]!.probabilityBasisPoints,
      method_reading: 9_999,
    };
    rehashRater(invalid);
    assert.throws(
      () =>
        EvidenceBenchmarkActivityJudgments.admitRater(
          fixture.observations,
          invalid,
        ),
      /sum to 10,000/,
    );
    const duplicateSession: IEvidenceBenchmarkActivity.IRaterArtifact =
      structuredClone(valid);
    duplicateSession.turnClass = "activity-rater-b";
    duplicateSession.raterId = "rater-b";
    duplicateSession.threadId = "thread-b";
    rehashRater(duplicateSession);
    const admittedA = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      valid,
    );
    const admittedB = EvidenceBenchmarkActivityJudgments.admitRater(
      fixture.observations,
      duplicateSession,
    );
    assert.throws(
      () =>
        EvidenceBenchmarkActivityJudgments.independent(admittedA, admittedB),
      /sessionId/,
    );
  }

  interface Fixture {
    input: EvidenceBenchmarkActivityObservations.IInput;
    observations: IEvidenceBenchmarkActivity.IObservations;
  }

  function fixtureObservations(protocolRoot: string): Fixture {
    const responses: IEvidenceBenchmarkActivity.IResponseUsage[] = [
      {
        responseId: "response-a",
        threadId: "thread-primary",
        turnId: "turn-1",
        phase: "phase1",
        receivedAtUtc: "2026-07-29T00:00:00.000Z",
        receivedMonotonicNs: "500",
        rawEventId: "event-a",
        usage: {
          inputTokens: 100,
          cachedInputTokens: 20,
          cacheWriteInputTokens: 10,
          outputTokens: 30,
          reasoningOutputTokens: 10,
          totalTokens: 130,
        },
      },
      {
        responseId: "response-b",
        threadId: "thread-descendant",
        turnId: "turn-1",
        phase: "phase1",
        receivedAtUtc: "2026-07-29T00:00:00.001Z",
        receivedMonotonicNs: "900",
        rawEventId: "event-b",
        usage: {
          inputTokens: 80,
          cachedInputTokens: 0,
          cacheWriteInputTokens: 0,
          outputTokens: 20,
          reasoningOutputTokens: 5,
          totalTokens: 100,
        },
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
    const runManifest = {
      experiment: {
        runId: "todo-plain-r1",
        blockId: "todo-reddit-r1",
        subject: "todo",
        arm: "plain",
        replicate: 1,
        projectInputSha256: digest("materialization-input"),
        protocolRevisionSha256: digest("protocol"),
      },
      runner: {
        providerOutputRegistrySha256: registry.registrySha256,
      },
    };
    const runManifestBytes: Buffer = Buffer.from(
      `${JSON.stringify(runManifest)}\n`,
      "utf8",
    );
    const coreSealBytes: Buffer = Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        complete: true,
        runId: "todo-plain-r1",
        manifestSha256:
          EvidenceBenchmarkActivityCanonical.sha256(runManifestBytes),
        usageSha256: EvidenceBenchmarkActivityCanonical.sha256(
          sourceUsageLedgerBytes,
        ),
        finalEventSha256: digest("events"),
      })}\n`,
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
      eventChainTerminalSha256: digest("events"),
      providerOutputRegistrySha256: registry.registrySha256,
      activityRatingProviderSchemaSha256:
        registry.activityRatingProviderSchemaSha256,
      activityRatingLocalSchemaSha256: registry.activityRatingLocalSchemaSha256,
      adjudicationProviderSchemaSha256:
        registry.adjudicationProviderSchemaSha256,
      adjudicationLocalSchemaSha256: registry.adjudicationLocalSchemaSha256,
    };
    const input: EvidenceBenchmarkActivityObservations.IInput = {
      protocolRoot,
      binding,
      parentCoreSealBytes: coreSealBytes,
      runManifestBytes,
      materializationManifestBytes,
      sourceUsageLedgerBytes,
      wall: {
        startedMonotonicNs: "0",
        completedMonotonicNs: "1000",
      },
      responses,
      items: [
        item("item-a", "response-a", "100", "500", 600),
        item("item-b", "response-a", "300", "700", 500),
        item("item-c", "response-b", "400", "900", 500),
      ],
    };
    return {
      input,
      observations: EvidenceBenchmarkActivityObservations.create(input),
    };
  }

  function item(
    itemId: string,
    responseId: string,
    start: string,
    end: string,
    sourceDurationMs: number,
  ): IEvidenceBenchmarkActivity.IItemObservation {
    return {
      observationId: `observation-${itemId}`,
      threadId:
        responseId === "response-a" ? "thread-primary" : "thread-descendant",
      turnId: "turn-1",
      itemId,
      itemType: itemId === "item-c" ? "collabAgentCall" : "commandExecution",
      phase: "phase1",
      startedAtSourceMs: Number(start),
      completedAtSourceMs: Number(end),
      startedReceiptMonotonicNs: start,
      completedReceiptMonotonicNs: end,
      sourceDurationMs,
      linkedResponseId: responseId,
      linkage: "ordered_epoch",
      rawEventIds: [`${itemId}-started`, `${itemId}-completed`],
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
    ratings: IEvidenceBenchmarkActivity.IProviderRating[],
  ): IEvidenceBenchmarkActivity.IRaterArtifact {
    const providerOutput: IEvidenceBenchmarkActivity.IProviderRatingBlock = {
      schemaVersion: 1,
      role: "activity_rater",
      runId: observations.binding.runId,
      blockId: observations.binding.blockId,
      responseIds: observations.responses.map((row) => row.responseId),
      ratings,
      status: "completed",
    };
    const body = {
      schemaVersion: 1 as const,
      binding: observations.binding,
      raterId: `rater-${side}`,
      threadId: `rating-thread-${side}`,
      sessionId: `rating-session-${side}`,
      model: "gpt-5.6-terra",
      effort: "high",
      turnClass: `activity-rater-${side}` as const,
      otherRaterOutputVisible: false as const,
      aggregateArmResultsVisible: false as const,
      allowedEvidenceEventIds: ["event-a", "event-b"],
      providerOutput,
      providerOutputSha256:
        EvidenceBenchmarkActivityCanonical.object(providerOutput),
    };
    return {
      ...body,
      artifactSha256: EvidenceBenchmarkActivityCanonical.object(body),
    };
  }

  function adjudicatorArtifact(
    observations: IEvidenceBenchmarkActivity.IObservations,
    left: IEvidenceBenchmarkActivity.IRaterArtifact,
    right: IEvidenceBenchmarkActivity.IRaterArtifact,
    queue: readonly IEvidenceBenchmarkActivity.IAdjudicationQueueEntry[],
  ): IEvidenceBenchmarkActivity.IAdjudicatorArtifact {
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
        rationale: `Fresh decision [[event:${index === 0 ? "event-a" : "event-b"}]].`,
      })),
      status: "completed",
    };
    const body = {
      schemaVersion: 1 as const,
      binding: observations.binding,
      adjudicatorId: "adjudicator-c",
      threadId: "adjudication-thread-c",
      sessionId: "adjudication-session-c",
      model: "gpt-5.6-terra",
      effort: "high",
      raterArtifactSha256,
      providerOutput,
      providerOutputSha256:
        EvidenceBenchmarkActivityCanonical.object(providerOutput),
    };
    return {
      ...body,
      artifactSha256: EvidenceBenchmarkActivityCanonical.object(body),
    };
  }

  function rehashRater(
    artifact: IEvidenceBenchmarkActivity.IRaterArtifact,
  ): void {
    artifact.providerOutputSha256 = EvidenceBenchmarkActivityCanonical.object(
      artifact.providerOutput,
    );
    const { artifactSha256: _ignored, ...body } = artifact;
    artifact.artifactSha256 = EvidenceBenchmarkActivityCanonical.object(body);
  }

  function usageLedger(
    responses: readonly IEvidenceBenchmarkActivity.IResponseUsage[],
  ): Buffer {
    return Buffer.from(
      `${JSON.stringify({
        exactUsageComplete: responses.every((row) => row.usage !== null),
        responses: responses.map((row) => ({
          responseId: row.responseId,
          threadId: row.threadId,
          turnId: row.turnId,
          usage: row.usage,
        })),
      })}\n`,
      "utf8",
    );
  }

  function digest(label: string): string {
    return EvidenceBenchmarkActivityCanonical.sha256(label);
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
