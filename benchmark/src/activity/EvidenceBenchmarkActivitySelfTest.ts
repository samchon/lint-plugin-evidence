import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EvidenceBenchmarkActivityCanonical } from "./EvidenceBenchmarkActivityCanonical.ts";
import { EvidenceBenchmarkActivityCodebook } from "./EvidenceBenchmarkActivityCodebook.ts";
import { EvidenceBenchmarkActivityJudgments } from "./EvidenceBenchmarkActivityJudgments.ts";
import { EvidenceBenchmarkActivityJcs } from "./EvidenceBenchmarkActivityJcs.ts";
import { EvidenceBenchmarkActivityObservations } from "./EvidenceBenchmarkActivityObservations.ts";
import { EvidenceBenchmarkActivityReducer } from "./EvidenceBenchmarkActivityReducer.ts";
import { EvidenceBenchmarkActivityRegistry } from "./EvidenceBenchmarkActivityRegistry.ts";
import { EvidenceBenchmarkActivityStrictJson } from "./EvidenceBenchmarkActivityStrictJson.ts";
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
        runId: fixture.input.binding.runId,
        manifestSha256: fixture.input.binding.runManifestSha256,
        usageReportSha256: digest("other-ledger"),
        eventChainHeadSha256: fixture.input.binding.eventChainTerminalSha256,
        activityLedgerSha256: fixture.input.binding.sourceActivityLedgerSha256,
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
    const censoredLedger = JSON.parse(
      Buffer.from(fixture.input.sourceUsageLedgerBytes).toString("utf8"),
    ) as Record<string, unknown>;
    censoredLedger.exactUsageComplete = false;
    const censoredLedgerBytes: Buffer = Buffer.from(
      `${JSON.stringify(censoredLedger)}\n`,
      "utf8",
    );
    const censoredActivity = JSON.parse(
      Buffer.from(fixture.input.sourceActivityLedgerBytes).toString("utf8"),
    ) as Record<string, unknown>;
    censoredActivity.usageReportSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(censoredLedgerBytes);
    const censoredActivityBytes: Buffer = Buffer.from(
      `${JSON.stringify(censoredActivity)}\n`,
      "utf8",
    );
    const censoredCore = JSON.parse(
      Buffer.from(fixture.input.parentCoreSealBytes).toString("utf8"),
    ) as Record<string, unknown>;
    censoredCore.usageReportSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(censoredLedgerBytes);
    censoredCore.activityLedgerSha256 =
      EvidenceBenchmarkActivityCanonical.sha256(censoredActivityBytes);
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
          sourceActivityLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
            censoredActivityBytes,
          ),
          parentCoreSealSha256:
            EvidenceBenchmarkActivityCanonical.sha256(censoredCoreBytes),
        },
        parentCoreSealBytes: censoredCoreBytes,
        sourceUsageLedgerBytes: censoredLedgerBytes,
        sourceActivityLedgerBytes: censoredActivityBytes,
      });
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
    assert.equal(report.exactTokenReconciled, true);
    assert.equal(report.exclusiveWallReconciled, true);
    assert.equal(report.wallTimeNs, "1000");
    assert.equal(report.coveredUnionWallNs, "800");
    assert.equal(report.residualWallNs, "200");
    assert.equal(report.semanticQuantitiesAreEstimates, true);
    assert.equal(report.semanticAttributionStatus, "complete");
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
  }

  interface Fixture {
    input: EvidenceBenchmarkActivityObservations.IInput;
    observations: IEvidenceBenchmarkActivity.IObservations;
  }

  function fixtureObservations(protocolRoot: string): Fixture {
    const sourceEventLedger: EventFixture = eventLedger([
      "event-a",
      "event-b",
      "item-a-started",
      "item-a-completed",
      "item-b-started",
      "item-b-completed",
      "item-c-started",
      "item-c-completed",
    ]);
    const responses: IEvidenceBenchmarkActivity.IResponseUsage[] = [
      {
        responseId: "response-a",
        threadId: "thread-primary",
        turnId: "turn-1",
        phase: "phase1",
        receivedAtUtc: "2026-07-29T00:00:00.000Z",
        receivedMonotonicNs: "500",
        rawEventId: sourceEventLedger.ids.get("event-a")!,
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
        rawEventId: sourceEventLedger.ids.get("event-b")!,
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
        activityProcessIdentitySchemaSha256: digest("process-identity-schema"),
        activityExecutionSchemaSha256: digest("execution-schema"),
      },
    };
    const runManifestBytes: Buffer = Buffer.from(
      `${JSON.stringify(runManifest)}\n`,
      "utf8",
    );
    const observedItems: IEvidenceBenchmarkActivity.IItemObservation[] = [
      item("item-a", "response-a", "100", "500", 600, sourceEventLedger.ids),
      item("item-b", "response-a", "300", "700", 500, sourceEventLedger.ids),
      item("item-c", "response-b", "400", "900", 500, sourceEventLedger.ids),
    ];
    const observedWall: IEvidenceBenchmarkActivity.IWallInterval = {
      startedMonotonicNs: "0",
      completedMonotonicNs: "1000",
    };
    const sourceActivityLedgerBytes: Buffer = activityLedger(
      sourceEventLedger.bytes,
      sourceEventLedger.head,
      sourceUsageLedgerBytes,
      observedWall,
      observedItems,
      responses.length,
    );
    const coreSealBytes: Buffer = Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        runId: "todo-plain-r1",
        manifestSha256:
          EvidenceBenchmarkActivityCanonical.sha256(runManifestBytes),
        usageReportSha256: EvidenceBenchmarkActivityCanonical.sha256(
          sourceUsageLedgerBytes,
        ),
        eventChainHeadSha256: sourceEventLedger.head,
        activityLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
          sourceActivityLedgerBytes,
        ),
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
      sourceEventLedgerSha256: EvidenceBenchmarkActivityCanonical.sha256(
        sourceEventLedger.bytes,
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
      activityProcessIdentitySchemaSha256: digest("process-identity-schema"),
      activityExecutionSchemaSha256: digest("execution-schema"),
    };
    const input: EvidenceBenchmarkActivityObservations.IInput = {
      protocolRoot,
      binding,
      parentCoreSealBytes: coreSealBytes,
      runManifestBytes,
      materializationManifestBytes,
      sourceUsageLedgerBytes,
      sourceEventLedgerBytes: sourceEventLedger.bytes,
      sourceActivityLedgerBytes,
      wall: observedWall,
      responses,
      items: observedItems,
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
    eventIds: ReadonlyMap<string, string>,
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
  ): IEvidenceBenchmarkActivity.IRaterArtifact {
    const assignmentId: string = `activity-rater-${side}-assignment`;
    const threadId: string = `rating-thread-${side}`;
    const sessionId: string = sessionOverride ?? `rating-session-${side}`;
    const process: ProcessFixture = processIdentity(
      assignmentId,
      `activity-rater-${side}`,
      sessionId,
      threadId,
    );
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
      providerOutputSha256,
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
      assignmentId,
      "activity-adjudicator",
      sessionId,
      threadId,
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
      providerOutputSha256,
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
  }

  interface ExecutionFixture {
    execution: IEvidenceBenchmarkActivity.IModelExecutionProvenance;
    evidence: IEvidenceBenchmarkActivity.IModelExecutionEvidence;
  }

  function processIdentity(
    assignmentId: string,
    agentRole: "activity-rater-a" | "activity-rater-b" | "activity-adjudicator",
    sessionId: string,
    threadId: string,
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
      assignmentId,
      agentRole,
      sessionId,
      threadId,
    };
    const identity: IEvidenceBenchmarkActivity.IProcessIdentityArtifact = {
      ...body,
      identitySha256: EvidenceBenchmarkActivityCanonical.object(body),
    };
    const bytes: Buffer = Buffer.from(`${JSON.stringify(identity)}\n`, "utf8");
    return {
      bytes,
      sha256: EvidenceBenchmarkActivityCanonical.sha256(bytes),
    };
  }

  function modelExecution(
    binding: IEvidenceBenchmarkActivity.IBinding,
    assignment:
      | IEvidenceBenchmarkActivity.IRaterAssignment
      | IEvidenceBenchmarkActivity.IAdjudicatorAssignment,
    providerOutputSha256: string,
    process: ProcessFixture,
    baseMonotonicNs: number,
  ): ExecutionFixture {
    const agentRole:
      "activity-rater-a" | "activity-rater-b" | "activity-adjudicator" =
      "turnClass" in assignment ? assignment.turnClass : "activity-adjudicator";
    const turnId: string = `${agentRole}-turn`;
    const responseId: string = `${agentRole}-response`;
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
          providerOutputSha256,
        },
      })}\n`,
      "utf8",
    );
    const rawResponseEnvelopeSha256: string =
      EvidenceBenchmarkActivityCanonical.sha256(rawResponseEnvelopeBytes);
    const eventBodies: Record<string, unknown>[] = [
      {
        runId: binding.runId,
        seq: 1,
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
        seq: 2,
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
        seq: 3,
        utc: "2026-07-29T01:00:00.002Z",
        monotonicNs: String(baseMonotonicNs + 200),
        phase: "reconciliation",
        actor: "app-server",
        type: "activity_raw_response_completed",
        payload: {
          providerOutputSha256,
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
    const rawEventId: string = events[2]!.eventSha256 as string;
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
      assignmentEventId: events[0]!.eventSha256 as string,
      turnStartedEventId: events[1]!.eventSha256 as string,
      assignmentMonotonicNs: String(baseMonotonicNs),
      turnStartedMonotonicNs: String(baseMonotonicNs + 100),
      responseReceivedMonotonicNs,
      responseReceivedAtUtc,
      responseUsage,
      providerOutputSha256,
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
        eventLedgerBytes,
        usageLedgerBytes,
        processIdentityArtifactBytes: process.bytes,
        rawResponseEnvelopeBytes,
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
          phase: row.phase,
          receivedAtUtc: row.receivedAtUtc,
          receivedMonotonicNs: row.receivedMonotonicNs,
          rawEventId: row.rawEventId,
          usage: row.usage,
        })),
      })}\n`,
      "utf8",
    );
  }

  interface EventFixture {
    bytes: Buffer;
    head: string;
    ids: ReadonlyMap<string, string>;
  }

  function eventLedger(eventIds: readonly string[]): EventFixture {
    let previous: string = "0".repeat(64);
    const ids: Map<string, string> = new Map();
    const events: Record<string, unknown>[] = eventIds.map(
      (eventId, index): Record<string, unknown> => {
        const body: Record<string, unknown> = {
          runId: "todo-plain-r1",
          seq: index + 1,
          utc: `2026-07-29T00:00:00.${String(index).padStart(3, "0")}Z`,
          monotonicNs: String(100 + index),
          phase: "agent",
          actor: "app-server",
          type: "raw_event_observed",
          payload: { eventId },
          rawRef: null,
          previousEventSha256: previous,
        };
        const eventSha256: string =
          EvidenceBenchmarkActivityJcs.eventSha256(body);
        ids.set(eventId, eventSha256);
        previous = eventSha256;
        return { ...body, eventSha256 };
      },
    );
    return {
      bytes: Buffer.from(
        `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      ),
      head: previous,
      ids,
    };
  }

  function activityLedger(
    eventBytes: Uint8Array,
    eventHead: string,
    usageBytes: Uint8Array,
    wall: IEvidenceBenchmarkActivity.IWallInterval,
    items: readonly IEvidenceBenchmarkActivity.IItemObservation[],
    responseCount: number,
  ): Buffer {
    return Buffer.from(
      `${JSON.stringify({
        schemaVersion: 1,
        runId: "todo-plain-r1",
        eventLedgerSha256:
          EvidenceBenchmarkActivityCanonical.sha256(eventBytes),
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
        items,
      })}\n`,
      "utf8",
    );
  }

  function digest(label: string): string {
    return EvidenceBenchmarkActivityCanonical.sha256(label);
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
