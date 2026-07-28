import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { EvidenceBenchmarkHash } from "../EvidenceBenchmarkHash.ts";
import { EvidenceBenchmarkProtocolValidator } from "../EvidenceBenchmarkProtocolValidator.ts";
import { EvidenceBenchmarkQualityArtifacts } from "../grading/EvidenceBenchmarkQualityArtifacts.ts";
import { EvidenceBenchmarkPublicSafetyScanner } from "../safety/EvidenceBenchmarkPublicSafetyScanner.ts";

/** Runs canonical quality artifact round-trip and negative fixtures. */
export namespace EvidenceBenchmarkQualityArtifactsTest {
  const protocolRevision: string = digest("protocol-revision");
  const parentCore: string = digest("parent-core");
  const runId: string = "quality-artifact-run";
  const bundleId: string = "bundle-quality-artifact";
  const criterionId: string = "REQ-TODO.AC-001";

  /** Emits every quality vertical without a provider or paid model call. */
  export function main(protocolRoot: string, temporary: string): void {
    const qualityDone = qualityInputs("t_done");
    const qualityDry = qualityInputs("t_dry");
    const qualityDoneEmission = roundTrip(
      protocolRoot,
      temporary,
      "quality-inputs-done.json",
      "quality-inputs.schema.json",
      qualityDone,
    );
    const durableTarget = path.join(temporary, "quality-inputs-done.json");
    const durableBefore = fs.readFileSync(durableTarget);
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.write(
          protocolRoot,
          "quality-inputs.schema.json",
          qualityDone,
          durableTarget,
        ),
      "write-once target exists",
    );
    assert.deepEqual(fs.readFileSync(durableTarget), durableBefore);
    assert.equal(
      fs.readdirSync(temporary).some((entry) => entry.includes(".orphan")),
      false,
    );
    const qualityDryEmission = roundTrip(
      protocolRoot,
      temporary,
      "quality-inputs-dry.json",
      "quality-inputs.schema.json",
      qualityDry,
    );
    const sourceDone = rawTree("source-done");
    const sourceDry = rawTree("source-dry");
    const bundleDone = rawTree("bundle-done");
    const bundleDry = rawTree("bundle-dry");
    const gradingInput = {
      schemaVersion: 2,
      runId,
      runManifestSha256: digest("run-manifest"),
      subjectFreezeManifestSha256: digest("subject-freeze"),
      requirementsRawTreeSha256: digest("requirements"),
      acceptanceCatalogSha256: digest("acceptance-catalog"),
      contextCatalogSha256: null,
      tDoneSourceRawTree: sourceDone,
      tDoneBundleRawTree: bundleDone,
      tDrySourceRawTree: sourceDry,
      tDryBundleRawTree: bundleDry,
      rubricSha256: digest("rubric"),
      promptSha256: digest("grader-prompt"),
      providerOutputRegistrySha256: digest("provider-registry"),
      qualityInputsSha256: EvidenceBenchmarkHash.object([
        qualityDoneEmission.sha256,
        qualityDryEmission.sha256,
      ]),
      protocolRevisionSha256: protocolRevision,
    };
    EvidenceBenchmarkQualityArtifacts.validateGradingInput(gradingInput, runId);
    const gradingInputEmission = roundTrip(
      protocolRoot,
      temporary,
      "grading-input.json",
      "grading-input-manifest.schema.json",
      gradingInput,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.emit(
          protocolRoot,
          "grading-input-manifest.schema.json",
          { ...gradingInput, schemaVersion: 1 },
        ),
      "schemaVersion",
    );

    const bundleManifest = bundle(sourceDone, bundleDone);
    EvidenceBenchmarkQualityArtifacts.validateBundle(bundleManifest);
    const bundleEmission = roundTrip(
      protocolRoot,
      temporary,
      "bundle-manifest.json",
      "bundle-manifest.schema.json",
      bundleManifest,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateBundle({
          ...bundleManifest,
          determinismCheck: {
            secondOutputRawTree: rawTree("other-output"),
            passed: true,
          },
        }),
      "double hash",
    );

    const plan = gradingPlan(bundleEmission.sha256);
    EvidenceBenchmarkQualityArtifacts.validatePlan(plan, parentCore);
    const planEmission = roundTrip(
      protocolRoot,
      temporary,
      "grading-plan.json",
      "grading-block-plan.schema.json",
      plan,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validatePlan(
          { ...plan, parentCoreSealSha256: digest("other-core") },
          parentCore,
        ),
      "parent core",
    );

    const plannedBlock = (plan.populations[0] as { blocks: unknown[] })
      .blocks[0]!;
    const providerBlock = gradeBlock();
    EvidenceBenchmarkQualityArtifacts.validateGradeBlock(
      providerBlock,
      plannedBlock,
      {
        gradeId: "grade-quality-a",
        bundleId,
        subject: "todo",
        phase: "t_done",
        graderPseudonym: "blind-grader-a",
        rubricSha256: digest("rubric"),
        catalogSha256: digest("acceptance-catalog"),
        population: "acceptance",
      },
    );
    const blockEmission = roundTrip(
      protocolRoot,
      temporary,
      "grade-block.json",
      "grade-block-local.schema.json",
      providerBlock,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.emit(
          protocolRoot,
          "grade-block-local.schema.json",
          {
            schemaVersion: 1,
            blockId: "block-acceptance-000",
            ratings: [semanticRating(false)],
          },
        ),
      "required",
    );

    const sourceResponseIds = ["response-grade-a"];
    const assembledGrade = grade(
      planEmission.sha256,
      sourceResponseIds,
      "grade-quality-a",
      "blind-grader-a",
    );
    EvidenceBenchmarkQualityArtifacts.validateGrade(assembledGrade, {
      gradingPlanSha256: planEmission.sha256,
      parentCoreSealSha256: parentCore,
      sourceResponseIds,
    });
    const gradeAEmission = roundTrip(
      protocolRoot,
      temporary,
      "grade-a.json",
      "grade.schema.json",
      assembledGrade,
    );
    const gradeB = grade(
      planEmission.sha256,
      ["response-grade-b"],
      "grade-quality-b",
      "blind-grader-b",
    );
    const gradeBEmission = roundTrip(
      protocolRoot,
      temporary,
      "grade-b.json",
      "grade.schema.json",
      gradeB,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.emit(
          protocolRoot,
          "grade.schema.json",
          {
            ...assembledGrade,
            armGuess: { arm: "unknown", confidence: 0.5, clues: [] },
          },
        ),
      "additionalProperties",
    );

    const sealedRatings: Buffer = Buffer.from(blockEmission.text, "utf8");
    const armGuess = {
      schemaVersion: 1,
      role: "blind_arm_guess",
      gradeId: "grade-quality-a",
      bundleId,
      subject: "todo",
      phase: "t_done",
      graderPseudonym: "blind-grader-a",
      sealedRatingsSha256: EvidenceBenchmarkHash.bytes(sealedRatings),
      guess: "unknown",
      confidence: 0.5,
      rationale: "The neutral artifact contains no arm identifier.",
    };
    EvidenceBenchmarkQualityArtifacts.validateArmGuess(armGuess, sealedRatings);
    const armGuessAEmission = roundTrip(
      protocolRoot,
      temporary,
      "arm-guess.json",
      "arm-guess-local.schema.json",
      armGuess,
    );
    const armGuessB = {
      ...armGuess,
      gradeId: "grade-quality-b",
      graderPseudonym: "blind-grader-b",
      rationale: "The second blind grader also found no arm identifier.",
    };
    const armGuessBEmission = roundTrip(
      protocolRoot,
      temporary,
      "arm-guess-b.json",
      "arm-guess-local.schema.json",
      armGuessB,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateArmGuess(
          armGuess,
          Buffer.from("different", "utf8"),
        ),
      "sealed rating",
    );

    const queueText: string = `${JSON.stringify([criterionId], null, 2)}\n`;
    const sealedInputs: string = labeledHash([
      ["grade-a", Buffer.from(gradeAEmission.text, "utf8")],
      ["grade-b", Buffer.from(gradeBEmission.text, "utf8")],
      ["comparison-queue", Buffer.from(queueText, "utf8")],
    ]);
    const adjudication = {
      schemaVersion: 1,
      role: "llm_adjudicator",
      adjudicationId: "adjudication-quality",
      bundleId,
      subject: "todo",
      phase: "t_done",
      population: "acceptance",
      sealedInputsSha256: sealedInputs,
      queueSha256: EvidenceBenchmarkHash.bytes(queueText),
      decisions: [
        {
          itemId: criterionId,
          decision: "semantic_consensus",
          semanticRating: semanticRating(false),
          confidence: 0.9,
          rationale: "A fresh review confirmed the observable implementation.",
        },
      ],
      status: "completed",
    };
    EvidenceBenchmarkQualityArtifacts.validateSemanticAdjudication(
      adjudication,
      [criterionId],
    );
    const adjudicationEmission = roundTrip(
      protocolRoot,
      temporary,
      "adjudication.json",
      "adjudication-local.schema.json",
      adjudication,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.emit(
          protocolRoot,
          "adjudication-local.schema.json",
          {
            ...adjudication,
            decisions: adjudication.decisions.map(
              ({ semanticRating: _semanticRating, ...decision }) => decision,
            ),
          },
        ),
      "required",
    );

    const processSchema: Buffer = fs.readFileSync(
      path.join(
        protocolRoot,
        "schema",
        "adjudicator-process-provenance.schema.json",
      ),
    );
    const assignmentEmission = roundTrip(
      protocolRoot,
      temporary,
      "adjudicator-assignment.json",
      "adjudicator-assignment.schema.json",
      assignment(),
    );
    const transport = adjudicatorTransport(
      protocolRoot,
      adjudicationEmission.text,
    );
    const usageEmission = roundTrip(
      protocolRoot,
      temporary,
      "adjudicator-usage.json",
      "adjudicator-usage.schema.json",
      transport.usage,
    );
    EvidenceBenchmarkQualityArtifacts.validateExactUsageCounters(
      transport.usage,
    );
    for (const invalid of [
      { ...transport.usage, cachedInputTokens: 101 },
      { ...transport.usage, reasoningOutputTokens: 51 },
      { ...transport.usage, totalTokens: 151 },
    ])
      expectInvalid(
        () =>
          EvidenceBenchmarkQualityArtifacts.validateExactUsageCounters(invalid),
        "token-counter",
      );
    const eventStreamValue = eventStream(
      protocolRoot,
      usageEmission.sha256,
      transport,
    );
    const eventStreamEmission = roundTrip(
      protocolRoot,
      temporary,
      "adjudicator-events.json",
      "adjudicator-event-stream.schema.json",
      eventStreamValue,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.emit(
          protocolRoot,
          "adjudicator-event-stream.schema.json",
          {
            ...eventStreamValue,
            providerOutputEvent: {
              ...(eventStreamValue.providerOutputEvent as Record<
                string,
                unknown
              >),
              method: "rawResponse/itemCompleted",
            },
          },
        ),
      "const",
    );
    const processValue = processProvenance(
      adjudicationEmission.sha256,
      assignmentEmission.sha256,
      eventStreamEmission.sha256,
      usageEmission.sha256,
      transport,
    );
    const processEmission = roundTrip(
      protocolRoot,
      temporary,
      "adjudicator-process.json",
      "adjudicator-process-provenance.schema.json",
      processValue,
    );
    const adjudicationRecord = freshRecord(
      gradeAEmission,
      gradeBEmission,
      queueText,
      adjudicationEmission,
      processEmission,
      assignmentEmission,
      eventStreamEmission,
      usageEmission,
      processSchema,
      sealedInputs,
      transport,
    );
    roundTrip(
      protocolRoot,
      temporary,
      "adjudication-record.json",
      "adjudication-record.schema.json",
      adjudicationRecord,
    );
    EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
      protocolRoot,
      adjudicationRecord,
      {
        graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
        graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
        comparisonQueue: Buffer.from(queueText, "utf8"),
        providerOutput: Buffer.from(adjudicationEmission.text, "utf8"),
        processProvenance: Buffer.from(processEmission.text, "utf8"),
        assignment: Buffer.from(assignmentEmission.text, "utf8"),
        rawEventStream: Buffer.from(eventStreamEmission.text, "utf8"),
        usage: Buffer.from(usageEmission.text, "utf8"),
        coreUsageReport: transport.coreUsageReport,
        runnerEventLog: transport.runnerEventLog,
        serverRawLog: transport.serverRawLog,
      },
    );
    const wrongResponseSetValue = {
      ...eventStreamValue,
      providerOutputEvent: {
        ...(eventStreamValue.providerOutputEvent as Record<string, unknown>),
        responseIds: ["foreign-response"],
      },
    };
    const wrongResponseSetEmission = EvidenceBenchmarkQualityArtifacts.emit(
      protocolRoot,
      "adjudicator-event-stream.schema.json",
      wrongResponseSetValue,
    );
    const wrongResponseSetProcess = EvidenceBenchmarkQualityArtifacts.emit(
      protocolRoot,
      "adjudicator-process-provenance.schema.json",
      {
        ...(processValue as Record<string, unknown>),
        rawEventStreamSha256: wrongResponseSetEmission.sha256,
      },
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
          protocolRoot,
          {
            ...adjudicationRecord,
            processProvenanceSha256: wrongResponseSetProcess.sha256,
            rawEventStreamSha256: wrongResponseSetEmission.sha256,
          },
          {
            graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
            graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
            comparisonQueue: Buffer.from(queueText, "utf8"),
            providerOutput: Buffer.from(adjudicationEmission.text, "utf8"),
            processProvenance: Buffer.from(
              wrongResponseSetProcess.text,
              "utf8",
            ),
            assignment: Buffer.from(assignmentEmission.text, "utf8"),
            rawEventStream: Buffer.from(
              wrongResponseSetEmission.text,
              "utf8",
            ),
            usage: Buffer.from(usageEmission.text, "utf8"),
            coreUsageReport: transport.coreUsageReport,
            runnerEventLog: transport.runnerEventLog,
            serverRawLog: transport.serverRawLog,
          },
        ),
      "final item",
    );
    for (const invalidProvider of [
      {
        options: { providerPhase: "commentary" },
        message: "final agentMessage",
      },
      {
        options: { providerType: "commandExecution" },
        message: "pinned vendor schema",
      },
    ]) {
      const invalidTransport = adjudicatorTransport(
        protocolRoot,
        adjudicationEmission.text,
        invalidProvider.options,
      );
      const invalidUsage = EvidenceBenchmarkQualityArtifacts.emit(
        protocolRoot,
        "adjudicator-usage.schema.json",
        invalidTransport.usage,
      );
      const invalidEvents = EvidenceBenchmarkQualityArtifacts.emit(
        protocolRoot,
        "adjudicator-event-stream.schema.json",
        eventStream(protocolRoot, invalidUsage.sha256, invalidTransport),
      );
      const invalidProcess = EvidenceBenchmarkQualityArtifacts.emit(
        protocolRoot,
        "adjudicator-process-provenance.schema.json",
        processProvenance(
          adjudicationEmission.sha256,
          assignmentEmission.sha256,
          invalidEvents.sha256,
          invalidUsage.sha256,
          invalidTransport,
        ),
      );
      const invalidRecord = freshRecord(
        gradeAEmission,
        gradeBEmission,
        queueText,
        adjudicationEmission,
        invalidProcess,
        assignmentEmission,
        invalidEvents,
        invalidUsage,
        processSchema,
        sealedInputs,
        invalidTransport,
      );
      expectInvalid(
        () =>
          EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
            protocolRoot,
            invalidRecord,
            {
              graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
              graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
              comparisonQueue: Buffer.from(queueText, "utf8"),
              providerOutput: Buffer.from(adjudicationEmission.text, "utf8"),
              processProvenance: Buffer.from(invalidProcess.text, "utf8"),
              assignment: Buffer.from(assignmentEmission.text, "utf8"),
              rawEventStream: Buffer.from(invalidEvents.text, "utf8"),
              usage: Buffer.from(invalidUsage.text, "utf8"),
              coreUsageReport: invalidTransport.coreUsageReport,
              runnerEventLog: invalidTransport.runnerEventLog,
              serverRawLog: invalidTransport.serverRawLog,
            },
          ),
        invalidProvider.message,
      );
    }
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
          protocolRoot,
          {
            ...adjudicationRecord,
            threadId: "thread-grade-a",
          },
          {
            graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
            graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
            comparisonQueue: Buffer.from(queueText, "utf8"),
            providerOutput: Buffer.from(adjudicationEmission.text, "utf8"),
            processProvenance: Buffer.from(processEmission.text, "utf8"),
            assignment: Buffer.from(assignmentEmission.text, "utf8"),
            rawEventStream: Buffer.from(eventStreamEmission.text, "utf8"),
            usage: Buffer.from(usageEmission.text, "utf8"),
            coreUsageReport: transport.coreUsageReport,
            runnerEventLog: transport.runnerEventLog,
            serverRawLog: transport.serverRawLog,
          },
        ),
      "process field",
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
          protocolRoot,
          {
            ...adjudicationRecord,
            processProvenanceSchemaSha256: digest("substituted-schema"),
          },
          {
            graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
            graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
            comparisonQueue: Buffer.from(queueText, "utf8"),
            providerOutput: Buffer.from(adjudicationEmission.text, "utf8"),
            processProvenance: Buffer.from(processEmission.text, "utf8"),
            assignment: Buffer.from(assignmentEmission.text, "utf8"),
            rawEventStream: Buffer.from(eventStreamEmission.text, "utf8"),
            usage: Buffer.from(usageEmission.text, "utf8"),
            coreUsageReport: transport.coreUsageReport,
            runnerEventLog: transport.runnerEventLog,
            serverRawLog: transport.serverRawLog,
          },
        ),
      "byte provenance",
    );
    const substitutedEvents: string = `${JSON.stringify(
      { ...eventStreamValue, sessionId: "session-substituted" },
      null,
      2,
    )}\n`;
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
          protocolRoot,
          {
            ...adjudicationRecord,
            rawEventStreamSha256:
              EvidenceBenchmarkHash.bytes(substitutedEvents),
          },
          {
            graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
            graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
            comparisonQueue: Buffer.from(queueText, "utf8"),
            providerOutput: Buffer.from(adjudicationEmission.text, "utf8"),
            processProvenance: Buffer.from(processEmission.text, "utf8"),
            assignment: Buffer.from(assignmentEmission.text, "utf8"),
            rawEventStream: Buffer.from(substitutedEvents, "utf8"),
            usage: Buffer.from(usageEmission.text, "utf8"),
            coreUsageReport: transport.coreUsageReport,
            runnerEventLog: transport.runnerEventLog,
            serverRawLog: transport.serverRawLog,
          },
        ),
      "process field",
    );
    const foreignRawLog = Buffer.from(transport.serverRawLog);
    foreignRawLog[0] = foreignRawLog[0] === 0x7b ? 0x5b : 0x7b;
    const splicedAdjudication = {
      ...adjudication,
      decisions: adjudication.decisions.map((decision) => ({
        ...decision,
        rationale: "A different valid provider output was spliced.",
      })),
    };
    const splicedProvider = EvidenceBenchmarkQualityArtifacts.emit(
      protocolRoot,
      "adjudication-provider.schema.json",
      splicedAdjudication,
    );
    const splicedProcess = EvidenceBenchmarkQualityArtifacts.emit(
      protocolRoot,
      "adjudicator-process-provenance.schema.json",
      {
        ...(processValue as Record<string, unknown>),
        providerOutputSha256: splicedProvider.sha256,
      },
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
          protocolRoot,
          adjudicationRecord,
          {
            graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
            graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
            comparisonQueue: Buffer.from(queueText, "utf8"),
            providerOutput: Buffer.from(adjudicationEmission.text, "utf8"),
            processProvenance: Buffer.from(processEmission.text, "utf8"),
            assignment: Buffer.from(assignmentEmission.text, "utf8"),
            rawEventStream: Buffer.from(eventStreamEmission.text, "utf8"),
            usage: Buffer.from(usageEmission.text, "utf8"),
            coreUsageReport: transport.coreUsageReport,
            runnerEventLog: transport.runnerEventLog,
            serverRawLog: foreignRawLog,
          },
        ),
      "byte provenance",
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
          protocolRoot,
          {
            ...adjudicationRecord,
            providerOutputSha256: splicedProvider.sha256,
            processProvenanceSha256: splicedProcess.sha256,
          },
          {
            graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
            graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
            comparisonQueue: Buffer.from(queueText, "utf8"),
            providerOutput: Buffer.from(splicedProvider.text, "utf8"),
            processProvenance: Buffer.from(splicedProcess.text, "utf8"),
            assignment: Buffer.from(assignmentEmission.text, "utf8"),
            rawEventStream: Buffer.from(eventStreamEmission.text, "utf8"),
            usage: Buffer.from(usageEmission.text, "utf8"),
            coreUsageReport: transport.coreUsageReport,
            runnerEventLog: transport.runnerEventLog,
            serverRawLog: transport.serverRawLog,
          },
        ),
      "final item",
    );
    const substitutedProcess = `${JSON.stringify(
      {
        ...(processValue as Record<string, unknown>),
        processStartEvent: {
          ...(processValue as any).processStartEvent,
          sequence: 2,
        },
      },
      null,
      2,
    )}\n`;
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateAdjudicationRecord(
          protocolRoot,
          {
            ...adjudicationRecord,
            processProvenanceSha256:
              EvidenceBenchmarkHash.bytes(substitutedProcess),
          },
          {
            graderAGrade: Buffer.from(gradeAEmission.text, "utf8"),
            graderBGrade: Buffer.from(gradeBEmission.text, "utf8"),
            comparisonQueue: Buffer.from(queueText, "utf8"),
            providerOutput: Buffer.from(adjudicationEmission.text, "utf8"),
            processProvenance: Buffer.from(substitutedProcess, "utf8"),
            assignment: Buffer.from(assignmentEmission.text, "utf8"),
            rawEventStream: Buffer.from(eventStreamEmission.text, "utf8"),
            usage: Buffer.from(usageEmission.text, "utf8"),
            coreUsageReport: transport.coreUsageReport,
            runnerEventLog: transport.runnerEventLog,
            serverRawLog: transport.serverRawLog,
          },
        ),
      "process start",
    );

    const secondaryReview = secondary();
    EvidenceBenchmarkQualityArtifacts.validateSecondaryReview(secondaryReview);
    const secondaryAEmission = roundTrip(
      protocolRoot,
      temporary,
      "secondary-review.json",
      "secondary-review-local.schema.json",
      secondaryReview,
    );
    const secondaryB = {
      ...secondaryReview,
      reviewId: "secondary-quality-b",
      graderPseudonym: "blind-grader-b",
      rationale: "The second reviewer independently scored six dimensions.",
    };
    const secondaryBEmission = roundTrip(
      protocolRoot,
      temporary,
      "secondary-review-b.json",
      "secondary-review-local.schema.json",
      secondaryB,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.emit(
          protocolRoot,
          "secondary-review-local.schema.json",
          {
            ...secondaryReview,
            ratings: secondaryReview.ratings.map((rating, index) => ({
              ...rating,
              score: index === 0 ? 0 : rating.score,
            })),
          },
        ),
      "enum",
    );
    const phase = {
      schemaVersion: 1,
      runId,
      coreSealSha256: parentCore,
      milestone: "t_done",
      gradingPlanSha256: planEmission.sha256,
      graderAGradeSha256: gradeAEmission.sha256,
      graderBGradeSha256: gradeBEmission.sha256,
      graderAArmGuessSha256: armGuessAEmission.sha256,
      graderBArmGuessSha256: armGuessBEmission.sha256,
      semanticAdjudicationSha256: adjudicationEmission.sha256,
      secondaryReviewASha256: secondaryAEmission.sha256,
      secondaryReviewBSha256: secondaryBEmission.sha256,
      secondaryAdjudicationSha256: digest("secondary-adjudication"),
      qualityInputsSha256: qualityDoneEmission.sha256,
      humanAuditQueueSha256: EvidenceBenchmarkHash.bytes(queueText),
      humanValidationStatus: "pending",
      humanValidatedCompositeClaim: false,
      denominatorsSummed: false,
    };
    EvidenceBenchmarkQualityArtifacts.validateQualityPhase(phase, parentCore);
    const donePhaseEmission = roundTrip(
      protocolRoot,
      temporary,
      "quality-phase-done.json",
      "quality-phase.schema.json",
      phase,
    );
    const dryPhaseEmission = roundTrip(
      protocolRoot,
      temporary,
      "quality-phase-dry.json",
      "quality-phase.schema.json",
      {
        ...phase,
        milestone: "t_dry",
        qualityInputsSha256: qualityDryEmission.sha256,
        semanticAdjudicationSha256: digest("dry-adjudication"),
      },
    );
    const repoRoot = path.resolve(protocolRoot, "..", "..");
    const scannerSource = fs.readFileSync(
      path.join(
        repoRoot,
        "benchmark",
        "src",
        "safety",
        "EvidenceBenchmarkPublicSafetyScanner.ts",
      ),
    );
    const safetyRules = fs.readFileSync(
      path.join(repoRoot, "benchmark", "protocol", "public-safety-rules.json"),
    );
    const cleanFiles = new Map<string, Uint8Array>([
      ["logs/client.raw.jsonl", Buffer.from("{}\n", "utf8")],
      ["logs/server.raw.jsonl", transport.serverRawLog],
      ["logs/stderr.raw.log", Buffer.alloc(0)],
      [
        "postprocess/report.json",
        Buffer.from('{"status":"machine-complete"}\n', "utf8"),
      ],
    ]);
    const safetyScan = EvidenceBenchmarkPublicSafetyScanner.scan({
      repoRoot,
      runId,
      parentCoreSealSha256: parentCore,
      files: cleanFiles,
      scannedAtUtc: "2026-07-29T00:00:02.500Z",
    });
    EvidenceBenchmarkQualityArtifacts.validatePublicSafetyScan(
      safetyScan,
      { runId, parentCoreSealSha256: parentCore },
      { repoRoot, scannerSource, rules: safetyRules, files: cleanFiles },
    );
    const safetyEmission = roundTrip(
      protocolRoot,
      temporary,
      "public-safety-scan.json",
      "public-safety-scan.schema.json",
      safetyScan,
    );
    const secretFiles = new Map(cleanFiles);
    secretFiles.set(
      "logs/server.raw.jsonl",
      Buffer.from(
        "OPENAI_API_KEY=sk-1234567890abcdefghijklmnop\naccountId=acct_1234567890\n",
        "utf8",
      ),
    );
    const blockedSafetyScan = EvidenceBenchmarkPublicSafetyScanner.scan({
      repoRoot,
      runId,
      parentCoreSealSha256: parentCore,
      files: secretFiles,
      scannedAtUtc: "2026-07-29T00:00:02.600Z",
    });
    assert.equal(blockedSafetyScan.publicPromotionAllowed, false);
    assert.deepEqual(
      new Set(
        blockedSafetyScan.highConfidenceFindings.map(
          (finding) => finding.category,
        ),
      ),
      new Set(["credential", "account_identifier"]),
    );
    EvidenceBenchmarkQualityArtifacts.validatePublicSafetyScan(
      blockedSafetyScan,
      { runId, parentCoreSealSha256: parentCore },
      { repoRoot, scannerSource, rules: safetyRules, files: secretFiles },
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validatePublicSafetyScan(
          {
            ...safetyScan,
            scanner: {
              ...safetyScan.scanner,
              rulesSha256: digest("substituted-safety-rules"),
            },
          },
          { runId, parentCoreSealSha256: parentCore },
          { repoRoot, scannerSource, rules: safetyRules, files: cleanFiles },
        ),
      "scanner",
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validatePublicSafetyScan(
          {
            ...blockedSafetyScan,
            highConfidenceFindings:
              blockedSafetyScan.highConfidenceFindings.slice(1),
          },
          { runId, parentCoreSealSha256: parentCore },
          { repoRoot, scannerSource, rules: safetyRules, files: secretFiles },
        ),
      "fresh scan",
    );
    const applicationResetFiles = new Map(cleanFiles);
    applicationResetFiles.set(
      "workspace/src/account.ts",
      Buffer.from('const resetAt = "2026-07-29T00:00:00Z";\n', "utf8"),
    );
    const applicationResetScan = EvidenceBenchmarkPublicSafetyScanner.scan({
      repoRoot,
      runId,
      parentCoreSealSha256: parentCore,
      files: applicationResetFiles,
      scannedAtUtc: "2026-07-29T00:00:02.650Z",
    });
    assert.equal(applicationResetScan.highConfidenceFindings.length, 0);
    const manualFiles = new Map(cleanFiles);
    manualFiles.set(
      "postprocess/report.json",
      Buffer.from("Contact candidate@example.test for review.\n", "utf8"),
    );
    const manualSafetyScan = EvidenceBenchmarkPublicSafetyScanner.scan({
      repoRoot,
      runId,
      parentCoreSealSha256: parentCore,
      files: manualFiles,
      scannedAtUtc: "2026-07-29T00:00:02.700Z",
    });
    assert.equal(manualSafetyScan.highConfidenceFindings.length, 0);
    assert.equal(manualSafetyScan.manualReviewStatus, "pending");
    assert.equal(manualSafetyScan.publicPromotionAllowed, false);
    const unsignedSeal = {
      schemaVersion: 1,
      runId,
      parentCoreSealSha256: parentCore,
      gradingInputManifestSha256: gradingInputEmission.sha256,
      tDoneQualityPhaseSha256: donePhaseEmission.sha256,
      tDryQualityPhaseSha256: dryPhaseEmission.sha256,
      aiAdjudicationSha256: digest("all-ai-adjudication"),
      humanAuditQueueSha256: EvidenceBenchmarkHash.bytes(queueText),
      humanValidationStatus: "pending",
      humanValidatedCompositeClaim: false,
      publicSafetyScanSha256: safetyEmission.sha256,
      publicPromotionAllowed: safetyScan.publicPromotionAllowed,
      reportSha256: digest("quality-report"),
      postprocessTreeSha256: digest("postprocess-tree"),
      sealedAtUtc: "2026-07-29T00:00:03.000Z",
    };
    const postprocessSeal = {
      ...unsignedSeal,
      sealSha256: EvidenceBenchmarkHash.object(unsignedSeal),
    };
    EvidenceBenchmarkQualityArtifacts.validatePostprocessSeal(
      postprocessSeal,
      parentCore,
    );
    const postprocessEmission = roundTrip(
      protocolRoot,
      temporary,
      "postprocess-seal.json",
      "postprocess-seal.schema.json",
      postprocessSeal,
    );
    const safetySchemaSha256 = EvidenceBenchmarkHash.file(
      path.join(protocolRoot, "schema", "public-safety-scan.schema.json"),
    );
    const unsignedPromotion = {
      schemaVersion: 1,
      subject: "todo",
      arm: "evidence",
      runId,
      sourceRunRoot: `benchmark/.runs/${runId}`,
      sourceManifestSha256: digest("source-run-manifest"),
      coreSeal: {
        terminalStatus: "completed",
        coreTreeSha256: digest("core-tree"),
        coreSealSha256: parentCore,
        tDoneSnapshotManifestSha256: digest("done-snapshot"),
        tDrySnapshotManifestSha256: digest("dry-snapshot"),
        eventChainHeadSha256: transport.providerEvent.eventSha256 as string,
        rawReferencesVerified: true,
        orphanTailsAbsent: true,
        immutableVerified: true,
      },
      postprocess: {
        parentCoreSealSha256: parentCore,
        gradeSets: ["t_done", "t_dry"].map((milestone) => ({
          milestone,
          bundleSha256: bundleEmission.sha256,
          gradingPlanSha256: planEmission.sha256,
          graderAGradeSha256: gradeAEmission.sha256,
          graderBGradeSha256: gradeBEmission.sha256,
          graderAArmGuessSha256: armGuessAEmission.sha256,
          graderBArmGuessSha256: armGuessBEmission.sha256,
          adjudicationSha256: adjudicationEmission.sha256,
          adjudicationRecordSha256: digest(`${milestone}-record`),
          parentCoreSealSha256: parentCore,
          humanAuditQueueSha256: EvidenceBenchmarkHash.bytes(queueText),
        })),
        deterministicGateResultsSha256: digest("deterministic-gates"),
        secondaryReviewSha256: secondaryAEmission.sha256,
        aiAdjudicationSha256: digest("ai-adjudication"),
        humanAuditQueueSha256: EvidenceBenchmarkHash.bytes(queueText),
        humanValidationStatus: "pending",
        humanValidatedCompositeClaim: false,
        publicSafetyScanSha256: safetyEmission.sha256,
        publicSafetyScanSchemaSha256: safetySchemaSha256,
        publicSafetyScannerSha256: safetyScan.scanner.implementationSha256,
        publicSafetyRulesSha256: safetyScan.scanner.rulesSha256,
        publicSafetyFileSetSha256: safetyScan.scannedFileSetSha256,
        publicSafetyHighConfidenceFindings: 0,
        publicSafetyManualReviewStatus: "not_required",
        publicPromotionAllowed: true,
        finalReportSha256: digest("final-report"),
        reportSchemaSha256: digest("report-schema"),
        postprocessTreeSha256: digest("postprocess-tree"),
        postprocessSealSha256: postprocessEmission.sha256,
        appendOnlyVerified: true,
        freshProcessVerified: true,
      },
      retainedRun: {
        path: `benchmark/result/todo/evidence/runs/${runId}`,
        coreTreeSha256: digest("core-tree"),
        postprocessTreeSha256: digest("postprocess-tree"),
        finalRecordTreeSha256: digest("final-record-tree"),
        workspacePath: `benchmark/result/todo/evidence/runs/${runId}/workspace`,
        retainedTreeSha256: digest("retained-tree"),
      },
      latestPointer: {
        path: "benchmark/result/todo/evidence/latest.json",
        previousRunId: null,
        currentRunId: runId,
        sha256: digest("latest-pointer"),
      },
      demoWorkspace: {
        sourceMilestone: "t_dry",
        sourceSnapshotManifestSha256: digest("dry-snapshot"),
        path: "benchmark/result/todo/evidence/workspace",
        retainedTreeSha256: digest("retained-tree"),
      },
      gitRoundTrip: {
        objectFormat: "sha1",
        temporaryCommitOid: "a".repeat(40),
        sourceTreeSha256: digest("git-tree"),
        cloneTreeSha256: digest("git-tree"),
        sourceSnapshotManifestSha256: digest("dry-snapshot"),
        cloneSnapshotManifestSha256: digest("dry-snapshot"),
        sourceCoreSealSha256: parentCore,
        cloneCoreSealSha256: parentCore,
        allDigestsMatch: true,
      },
      priorRunSet: {
        beforeCoreSealSetSha256: digest("before-core-set"),
        afterCoreSealSetSha256: digest("after-core-set"),
        priorCoreSealsPreserved: true,
        existingPostprocessPrefixesPreserved: true,
      },
      concurrencyControl: {
        lockId: "promotion-lock-quality",
        expectedPreviousLatestSha256: null,
        compareAndSwapSucceeded: true,
      },
      promotedAtUtc: "2026-07-29T00:00:04.000Z",
    };
    const promotion = {
      ...unsignedPromotion,
      manifestSha256: EvidenceBenchmarkHash.object(unsignedPromotion),
    };
    const promotionExpected = {
      runId,
      parentCoreSealSha256: parentCore,
      postprocessSealSha256: postprocessEmission.sha256,
      publicSafetyScanSha256: safetyEmission.sha256,
      publicSafetyScanSchemaSha256: safetySchemaSha256,
      publicSafetyScannerSha256: safetyScan.scanner.implementationSha256,
      publicSafetyRulesSha256: safetyScan.scanner.rulesSha256,
      publicSafetyFileSetSha256: safetyScan.scannedFileSetSha256,
    };
    EvidenceBenchmarkQualityArtifacts.validateResultPromotion(
      promotion,
      promotionExpected,
    );
    roundTrip(
      protocolRoot,
      temporary,
      "result-promotion.json",
      "result-promotion.schema.json",
      promotion,
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.emit(
          protocolRoot,
          "result-promotion.schema.json",
          {
            ...promotion,
            postprocess: {
              ...promotion.postprocess,
              publicPromotionAllowed: false,
            },
          },
        ),
      "const",
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateResultPromotion(
          {
            ...promotion,
            latestPointer: {
              ...promotion.latestPointer,
              currentRunId: "foreign-run",
            },
          },
          promotionExpected,
        ),
      "publication",
    );
    expectInvalid(
      () =>
        EvidenceBenchmarkQualityArtifacts.validateQualityPhase(
          {
            ...phase,
            graderBArmGuessSha256: phase.graderAArmGuessSha256,
          },
          parentCore,
        ),
      "reused",
    );
  }

  function roundTrip(
    protocolRoot: string,
    temporary: string,
    filename: string,
    schema: string,
    value: unknown,
  ): EvidenceBenchmarkQualityArtifacts.IEmission {
    const target: string = path.join(temporary, filename);
    const emission = EvidenceBenchmarkQualityArtifacts.write(
      protocolRoot,
      schema,
      value,
      target,
      filename,
    );
    assert.equal(
      EvidenceBenchmarkHash.bytes(fs.readFileSync(target)),
      emission.sha256,
    );
    EvidenceBenchmarkProtocolValidator.validateText(
      protocolRoot,
      schema,
      fs.readFileSync(target, "utf8"),
      `${filename} reopened bytes`,
    );
    return emission;
  }

  function qualityInputs(milestone: "t_done" | "t_dry"): unknown {
    const producer = (name: string): unknown => ({
      producer: name,
      version: "1.0.0",
      configSha256: digest(`${name}-config`),
      resultSha256: digest(`${name}-${milestone}-result`),
    });
    return {
      schemaVersion: 2,
      runId,
      runManifestSha256: digest("run-manifest"),
      milestone,
      snapshotRawTree: rawTree(`source-${milestone}`),
      hiddenAcceptance: producer("hidden-acceptance"),
      coverage: producer("coverage"),
      sampledMutation: producer("sampled-mutation"),
      visualCapture: {
        producer: "playwright",
        version: "1.0.0",
        configSha256: digest("visual-config"),
        routeInventorySha256: digest("route-inventory"),
        stateSeedSha256: digest("state-seed"),
        sampleSeed: "quality-artifact-seed",
        viewports: [390, 834, 1440],
        browser: "chromium-pinned",
        artifactsSha256: digest(`visual-${milestone}`),
      },
    };
  }

  function bundle(input: unknown, output: unknown): Record<string, unknown> {
    const parser = (name: string): unknown => ({
      implementation: name,
      version: "1.0.0",
      sourceSha256: digest(`${name}-source`),
      grammarSha256: digest(`${name}-grammar`),
    });
    const gate = (name: string): unknown => ({
      fixtureSha256: digest(`${name}-fixture`),
      acceptedCases: 1,
      rejectedCases: 1,
      passed: true,
    });
    return {
      schemaVersion: 1,
      bundleId,
      transformVersion: "1.0.0",
      transformSourceSha256: digest("transform-source"),
      inputSnapshotRawTree: input,
      requirementsRawTree: rawTree("requirements"),
      parsers: {
        typescriptJsdoc: parser("typescript-jsdoc"),
        markdownHtmlComment: parser("markdown-comment"),
        prismaTripleSlash: parser("prisma-triple-slash"),
        structuredConfiguration: parser("structured-config"),
      },
      grammarFixtureGate: {
        fixtureSetSha256: digest("grammar-fixtures"),
        typescriptJsdoc: gate("typescript-jsdoc"),
        markdownHtmlComment: gate("markdown-comment"),
        prismaTripleSlash: gate("prisma-triple-slash"),
        structuredConfiguration: gate("structured-config"),
        productionEntryPointUsed: true,
        passed: true,
      },
      files: [
        {
          inputPath: "src/app.ts",
          outputPath: "src/app.ts",
          action: "included",
          reason: "Neutral source retained.",
          inputSha256: digest("input-file"),
          outputSha256: digest("output-file"),
          removedAnnotations: 0,
        },
      ],
      leakScan: {
        rulesSha256: digest("leak-rules"),
        scannedFiles: 1,
        matches: [],
        passed: true,
      },
      outputRawTree: output,
      determinismCheck: {
        secondOutputRawTree: output,
        passed: true,
      },
    };
  }

  function gradingPlan(bundleSha256: string): any {
    const criterionIds: string[] = [criterionId];
    const assignment = (pseudonym: string): unknown => ({
      pseudonym,
      model: "gpt-5.6-terra",
      reasoningEffort: "high",
      assignmentSha256: digest(`${pseudonym}-assignment`),
    });
    return {
      schemaVersion: 1,
      planId: "grading-plan-quality",
      runId,
      bundleId,
      bundleSha256,
      parentCoreSealSha256: parentCore,
      subject: "todo",
      phase: "t_done",
      subjectFreezeManifestSha256: digest("subject-freeze"),
      requirementsRawTreeSha256: digest("requirements"),
      rubricSha256: digest("rubric"),
      graderPromptSha256: digest("grader-prompt"),
      gradeBlockProviderSchemaSha256: digest("grade-provider-schema"),
      gradeBlockLocalSchemaSha256: digest("grade-local-schema"),
      armGuessProviderSchemaSha256: digest("arm-provider-schema"),
      armGuessLocalSchemaSha256: digest("arm-local-schema"),
      providerOutputRegistrySha256: digest("provider-registry"),
      protocolRevisionSha256: protocolRevision,
      blockSize: 50,
      blockContextPolicy: "fresh_per_block",
      graderAssignments: [
        assignment("blind-grader-a"),
        assignment("blind-grader-b"),
      ],
      populations: [
        {
          population: "acceptance",
          catalogSha256: digest("acceptance-catalog"),
          catalogCount: 1,
          orderedCriterionIdsSha256: EvidenceBenchmarkHash.object(criterionIds),
          blocks: [
            {
              blockId: "block-acceptance-000",
              blockIndex: 0,
              criterionIds,
              criterionIdsSha256: EvidenceBenchmarkHash.object(criterionIds),
            },
          ],
        },
      ],
      partitionValidation: {
        catalogOrderPreserved: true,
        exactUnion: true,
        nonOverlapping: true,
        uniqueIds: true,
        countsReconciled: true,
      },
    };
  }

  function gradeBlock(): unknown {
    return {
      schemaVersion: 1,
      role: "blind_grader",
      gradeId: "grade-quality-a",
      bundleId,
      subject: "todo",
      phase: "t_done",
      graderPseudonym: "blind-grader-a",
      rubricSha256: digest("rubric"),
      catalogSha256: digest("acceptance-catalog"),
      population: "acceptance",
      blockId: "block-acceptance-000",
      blockIndex: 0,
      criterionIds: [criterionId],
      ratings: [semanticRating(false)],
      status: "completed",
      interruption: null,
    };
  }

  function grade(
    gradingPlanSha256: string,
    sourceResponseIds: string[],
    gradeId: string,
    pseudonym: string,
  ): Record<string, unknown> {
    const rating = semanticRating(true) as Record<string, unknown>;
    return {
      schemaVersion: 1,
      gradeId,
      bundleId,
      subject: "todo",
      phase: "t_done",
      grader: {
        pseudonym,
        kind: "llm",
        model: "gpt-5.6-terra",
        version: "2026-07-29",
      },
      blind: true,
      gradingPlanSha256,
      parentCoreSealSha256: parentCore,
      rubricSha256: digest("rubric"),
      gradeBlockProviderSchemaSha256: digest("grade-provider-schema"),
      gradeBlockLocalSchemaSha256: digest("grade-local-schema"),
      providerOutputRegistrySha256: digest("provider-registry"),
      sourceResponseIds,
      sourceResponseIdsSha256: EvidenceBenchmarkHash.object(sourceResponseIds),
      acceptanceCatalogSha256: digest("acceptance-catalog"),
      acceptancePopulationCount: 1,
      contextCatalogSha256: null,
      contextPopulationCount: 0,
      acceptanceRatings: [rating],
      contextRatings: null,
      acceptanceSummary: {
        populationCount: 1,
        applicable: 1,
        implementedCorrectly: 1,
        partial: 0,
        omitted: 0,
        contradicted: 0,
        unverifiable: 0,
        notApplicable: 0,
        testable: 1,
        nonVacuousTested: 1,
        criticalDefects: 0,
      },
      contextSummary: null,
      denominatorsSummed: false,
      populationValidation: {
        exactCatalogIdSets: true,
        uniqueCriterionIds: true,
        populationCountsExact: true,
        summariesReconciled: true,
        crossPopulationReferences: 0,
      },
      submittedAtUtc: "2026-07-29T00:00:00.000Z",
    };
  }

  function semanticRating(taxonomy: boolean): unknown {
    return {
      criterionId,
      status: "implemented_correctly",
      confidence: 0.9,
      surfaces: [
        "database",
        "api",
        "backend",
        "frontend",
        "integration",
        "test",
        "operations",
        "documentation",
      ].map((surface) => ({ surface, status: "correct" })),
      test: {
        testable: true,
        exists: true,
        executed: true,
        passes: true,
        nonVacuous: true,
        positive: true,
        negative: false,
        boundary: false,
        counterfactual: "Reversing the result fails the assertion.",
      },
      evidence: [
        {
          path: "src/app.ts",
          line: 1,
          observation: "The production path implements the criterion.",
        },
      ],
      ...(taxonomy ? { defectClass: "non_defect" } : {}),
      severity: "none",
      rationale: "File-backed behavior satisfies the criterion.",
    };
  }

  function assignment(): unknown {
    return {
      schemaVersion: 1,
      parentCoreSealSha256: parentCore,
      assignmentId: "adjudicator-assignment",
      provider: "openai",
      modelId: "gpt-5.6-terra",
      reasoningEffort: "high",
      codexVersion: "0.145.0",
      authClass: "chatgpt",
      serviceTierClass: "standard",
      serviceTierSymbolic: "default",
      requestedServiceTier: null,
      serviceTierRequestMode: "omitted",
    };
  }

  interface ITransport {
    serverRawLog: Buffer;
    runnerEventLog: Buffer;
    coreUsageReport: Buffer;
    usage: Record<string, unknown>;
    completionRawRef: Record<string, unknown>;
    providerRawRef: Record<string, unknown>;
    processStartEvent: Record<string, unknown>;
    completionEvent: Record<string, unknown>;
    providerEvent: Record<string, unknown>;
  }

  function adjudicatorTransport(
    _protocolRoot: string,
    providerOutput: string,
    options: {
      providerPhase?: string;
      providerType?: string;
    } = {},
  ): ITransport {
    const exactUsage = {
      totalTokens: 150,
      inputTokens: 100,
      cachedInputTokens: 20,
      cacheWriteInputTokens: 5,
      outputTokens: 50,
      reasoningOutputTokens: 10,
    };
    const completionFrame = JSON.stringify({
      method: "rawResponse/completed",
      params: {
        responseId: "response-adjudicator",
        threadId: "thread-adjudicator",
        turnId: "turn-adjudicator",
        usage: exactUsage,
      },
    });
    const providerFrame = JSON.stringify({
      method: "item/completed",
      params: {
        completedAtMs: 1785283202000,
        threadId: "thread-adjudicator",
        turnId: "turn-adjudicator",
        item: {
          id: "item-adjudicator",
          type: options.providerType ?? "agentMessage",
          text: providerOutput,
          phase: options.providerPhase ?? "final_answer",
        },
      },
    });
    const completionBytes = Buffer.from(completionFrame, "utf8");
    const providerBytes = Buffer.from(providerFrame, "utf8");
    const serverRawLog = Buffer.from(
      `${completionFrame}\n${providerFrame}\n`,
      "utf8",
    );
    const completionRawRef = {
      direction: "server",
      path: "server.raw.jsonl",
      byteOffset: 0,
      byteLength: completionBytes.byteLength,
      sha256: EvidenceBenchmarkHash.bytes(completionBytes),
    };
    const providerRawRef = {
      direction: "server",
      path: "server.raw.jsonl",
      byteOffset: completionBytes.byteLength + 1,
      byteLength: providerBytes.byteLength,
      sha256: EvidenceBenchmarkHash.bytes(providerBytes),
    };
    const processStartEvent = event(1, "0".repeat(64), {
      utc: "2026-07-29T00:00:01.000Z",
      monotonicNs: "1000",
      phase: "setup",
      actor: "runner",
      type: "app_server_started",
      payload: {
        processNonce: "1".repeat(32),
        pid: 4242,
        transportSessionId: "2".repeat(32),
        executableSha256: digest("codex-executable"),
        command: "codex.exe",
        arguments: ["app-server", "--experimental"],
        cwd: "D:/benchmark/adjudicator",
        environmentSha256: digest("adjudicator-environment"),
      },
      rawRef: null,
    });
    const completionEvent = event(2, processStartEvent.eventSha256 as string, {
      utc: "2026-07-29T00:00:01.500Z",
      monotonicNs: "2000",
      phase: "agent",
      actor: "app-server",
      type: "app_server_frame",
      payload: { parseError: null },
      rawRef: completionRawRef,
    });
    const providerEvent = event(3, completionEvent.eventSha256 as string, {
      utc: "2026-07-29T00:00:02.000Z",
      monotonicNs: "3000",
      phase: "agent",
      actor: "app-server",
      type: "app_server_frame",
      payload: { parseError: null },
      rawRef: providerRawRef,
    });
    const runnerEventLog = Buffer.from(
      [processStartEvent, completionEvent, providerEvent]
        .map((entry) => JSON.stringify(entry))
        .join("\n") + "\n",
      "utf8",
    );
    const usageReport = {
      schemaVersion: 1,
      exactUsageComplete: true,
      accumulatedUsageReconciled: true,
      responses: [
        {
          responseId: "response-adjudicator",
          threadId: "thread-adjudicator",
          turnId: "turn-adjudicator",
          phase: "grading",
          receivedMonotonicNs: "2000",
          rawEventId: completionEvent.eventSha256,
          usage: exactUsage,
          receivedAtUtc: "2026-07-29T00:00:01.500Z",
        },
      ],
      duplicateResponseIds: [],
      exactTotal: exactUsage,
      exactByThread: {
        "thread-adjudicator": exactUsage,
      },
      latestThreadUsage: {},
      reconciliation: [],
      anomalies: [],
    };
    const coreUsageReport = Buffer.from(
      `${JSON.stringify(usageReport, null, 2)}\n`,
      "utf8",
    );
    return {
      serverRawLog,
      runnerEventLog,
      coreUsageReport,
      completionRawRef,
      providerRawRef,
      processStartEvent,
      completionEvent,
      providerEvent,
      usage: {
        schemaVersion: 2,
        threadId: "thread-adjudicator",
        sourceUsageReportPath: "usage.json",
        sourceUsageReportSha256: EvidenceBenchmarkHash.bytes(coreUsageReport),
        responseIds: ["response-adjudicator"],
        duplicateResponseIds: [],
        ...exactUsage,
        exactUsageComplete: true,
        exact: true,
      },
    };
  }

  function eventStream(
    protocolRoot: string,
    usageSha256: string,
    transport: ITransport,
  ): Record<string, unknown> {
    const vendor = (filename: string): string =>
      EvidenceBenchmarkHash.file(
        path.join(
          protocolRoot,
          "vendor",
          "codex",
          "0.145.0",
          "app-server-schema-experimental",
          "v2",
          filename,
        ),
      );
    return {
      schemaVersion: 2,
      runId,
      threadId: "thread-adjudicator",
      sessionId: "session-adjudicator",
      agentId: "agent-adjudicator",
      transportSessionId: "2".repeat(32),
      runnerEventLogPath: "logs/runner.events.jsonl",
      runnerEventLogSha256: EvidenceBenchmarkHash.bytes(
        transport.runnerEventLog,
      ),
      serverRawLogPath: "logs/server.raw.jsonl",
      serverRawLogSha256: EvidenceBenchmarkHash.bytes(transport.serverRawLog),
      responseIds: ["response-adjudicator"],
      usageSha256,
      completionEvents: [
        {
          sequence: 0,
          runnerEventSequence: 2,
          runnerEventSha256: transport.completionEvent.eventSha256,
          monotonicNs: "2000",
          method: "rawResponse/completed",
          vendorSchemaPath: "v2/RawResponseCompletedNotification.json",
          vendorSchemaSha256: vendor("RawResponseCompletedNotification.json"),
          responseId: "response-adjudicator",
          responseIds: null,
          turnId: "turn-adjudicator",
          structuredOutputJsonPointer: null,
          rawRef: transport.completionRawRef,
        },
      ],
      providerOutputEvent: {
        sequence: 1,
        runnerEventSequence: 3,
        runnerEventSha256: transport.providerEvent.eventSha256,
        monotonicNs: "3000",
        method: "item/completed",
        vendorSchemaPath: "v2/ItemCompletedNotification.json",
        vendorSchemaSha256: vendor("ItemCompletedNotification.json"),
        responseId: null,
        responseIds: ["response-adjudicator"],
        turnId: "turn-adjudicator",
        structuredOutputJsonPointer: "/params/item/text",
        rawRef: transport.providerRawRef,
      },
    };
  }

  function processProvenance(
    providerOutputSha256: string,
    assignmentSha256: string,
    rawEventStreamSha256: string,
    usageSha256: string,
    transport: ITransport,
  ): unknown {
    return {
      schemaVersion: 2,
      parentCoreSealSha256: parentCore,
      provider: "openai",
      modelId: "gpt-5.6-terra",
      reasoningEffort: "high",
      codexVersion: "0.145.0",
      authClass: "chatgpt",
      serviceTierClass: "standard",
      serviceTierSymbolic: "default",
      requestedServiceTier: null,
      serviceTierRequestMode: "omitted",
      effectiveServiceTier: null,
      assignmentId: "adjudicator-assignment",
      assignmentPath:
        "postprocess/adjudication/assignment/adjudicator-quality.json",
      assignmentSha256,
      threadId: "thread-adjudicator",
      sessionId: "session-adjudicator",
      agentId: "agent-adjudicator",
      responseIds: ["response-adjudicator"],
      processNonce: "1".repeat(32),
      pid: 4242,
      transportSessionId: "2".repeat(32),
      startedAtMonotonicNs: "1000",
      executableSha256: digest("codex-executable"),
      invocation: {
        command: "codex.exe",
        arguments: ["app-server", "--experimental"],
        cwd: "D:/benchmark/adjudicator",
        environmentSha256: digest("adjudicator-environment"),
      },
      runnerEventLogPath: "logs/runner.events.jsonl",
      runnerEventLogSha256: EvidenceBenchmarkHash.bytes(
        transport.runnerEventLog,
      ),
      processStartEvent: {
        sequence: 1,
        eventSha256: transport.processStartEvent.eventSha256,
        monotonicNs: "1000",
      },
      rawEventStreamPath:
        "postprocess/adjudication/events/adjudicator-quality.json",
      rawEventStreamSha256,
      usagePath: "postprocess/adjudication/usage/adjudicator-quality.json",
      usageSha256,
      providerOutputSha256,
      startedAtUtc: "2026-07-29T00:00:01.000Z",
      completedAtUtc: "2026-07-29T00:00:02.000Z",
    };
  }

  function freshRecord(
    gradeA: EvidenceBenchmarkQualityArtifacts.IEmission,
    gradeB: EvidenceBenchmarkQualityArtifacts.IEmission,
    queueText: string,
    providerOutput: EvidenceBenchmarkQualityArtifacts.IEmission,
    processOutput: EvidenceBenchmarkQualityArtifacts.IEmission,
    assignmentOutput: EvidenceBenchmarkQualityArtifacts.IEmission,
    eventStreamOutput: EvidenceBenchmarkQualityArtifacts.IEmission,
    usageOutput: EvidenceBenchmarkQualityArtifacts.IEmission,
    processSchema: Uint8Array,
    sealedInputs: string,
    transport: ITransport,
  ): Record<string, unknown> {
    return {
      schemaVersion: 1,
      runId,
      milestone: "t_done",
      parentCoreSealSha256: parentCore,
      provider: "openai",
      modelId: "gpt-5.6-terra",
      reasoningEffort: "high",
      codexVersion: "0.145.0",
      authClass: "chatgpt",
      serviceTierClass: "standard",
      serviceTierSymbolic: "default",
      requestedServiceTier: null,
      serviceTierRequestMode: "omitted",
      effectiveServiceTier: null,
      assignmentId: "adjudicator-assignment",
      assignmentSha256: assignmentOutput.sha256,
      assignmentPath:
        "postprocess/adjudication/assignment/adjudicator-quality.json",
      threadId: "thread-adjudicator",
      sessionId: "session-adjudicator",
      agentId: "agent-adjudicator",
      responseIds: ["response-adjudicator"],
      processNonce: "1".repeat(32),
      pid: 4242,
      transportSessionId: "2".repeat(32),
      startedAtMonotonicNs: "1000",
      executableSha256: digest("codex-executable"),
      runnerEventLogSha256: EvidenceBenchmarkHash.bytes(
        transport.runnerEventLog,
      ),
      processProvenancePath:
        "postprocess/adjudication/process/adjudicator-quality.json",
      processProvenanceSchemaSha256: EvidenceBenchmarkHash.bytes(processSchema),
      processProvenanceSha256: processOutput.sha256,
      rawEventStreamPath:
        "postprocess/adjudication/events/adjudicator-quality.json",
      rawEventStreamSha256: eventStreamOutput.sha256,
      usagePath: "postprocess/adjudication/usage/adjudicator-quality.json",
      usageSha256: usageOutput.sha256,
      sealedInputAlgorithmId: "sha256-label-nul-bytes-v1",
      graderAGradeSha256: gradeA.sha256,
      graderBGradeSha256: gradeB.sha256,
      comparisonQueueSha256: EvidenceBenchmarkHash.bytes(queueText),
      sealedInputsSha256: sealedInputs,
      recomputedSealedInputsSha256: sealedInputs,
      providerOutputSha256: providerOutput.sha256,
      graderAIdentity: {
        assignmentId: "grader-a-assignment",
        threadId: "thread-grade-a",
        sessionId: "session-grade-a",
        agentId: "agent-grade-a",
        responseIds: ["response-grade-a"],
      },
      graderBIdentity: {
        assignmentId: "grader-b-assignment",
        threadId: "thread-grade-b",
        sessionId: "session-grade-b",
        agentId: "agent-grade-b",
        responseIds: ["response-grade-b"],
      },
      freshIdentityVerified: true,
    };
  }

  function secondary(): {
    ratings: Array<Record<string, unknown>>;
    [key: string]: unknown;
  } {
    return {
      schemaVersion: 1,
      role: "blind_secondary_review",
      reviewId: "secondary-quality-a",
      bundleId,
      subject: "todo",
      phase: "t_done",
      graderPseudonym: "blind-grader-a",
      visualEvidenceSha256: digest("visual-evidence"),
      ratings: [
        "usability",
        "legibility",
        "responsiveness",
        "state_feedback",
        "accessibility",
        "maintainability",
      ].map((dimension) => ({
        dimension,
        score: 4,
        confidence: 0.8,
        rationale: `${dimension} is supported by the frozen visual evidence.`,
      })),
      rationale: "The six dimensions were reviewed independently.",
    };
  }

  function rawTree(label: string): {
    algorithmId: "sha256-posix-path-nul-bytes-v1";
    sha256: string;
  } {
    return {
      algorithmId: EvidenceBenchmarkHash.TREE_ALGORITHM,
      sha256: digest(label),
    };
  }

  function event(
    sequence: number,
    previousEventSha256: string,
    input: {
      utc: string;
      monotonicNs: string;
      phase: "setup" | "agent";
      actor: "runner" | "app-server";
      type: string;
      payload: Record<string, unknown>;
      rawRef: Record<string, unknown> | null;
    },
  ): Record<string, unknown> {
    const unsigned = {
      runId,
      seq: sequence,
      utc: input.utc,
      monotonicNs: input.monotonicNs,
      phase: input.phase,
      actor: input.actor,
      type: input.type,
      payload: input.payload,
      rawRef: input.rawRef,
      previousEventSha256,
    };
    return {
      ...unsigned,
      eventSha256: EvidenceBenchmarkHash.bytes(canonicalJson(unsigned)),
    };
  }

  function canonicalJson(input: unknown): string {
    if (input === null || typeof input !== "object")
      return JSON.stringify(input);
    if (Array.isArray(input))
      return `[${input.map((entry) => canonicalJson(entry)).join(",")}]`;
    return `{${Object.entries(input as Record<string, unknown>)
      .sort(([left], [right]) =>
        Buffer.from(left, "utf8").compare(Buffer.from(right, "utf8")),
      )
      .map(([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`)
      .join(",")}}`;
  }

  function labeledHash(
    entries: ReadonlyArray<readonly [string, Uint8Array]>,
  ): string {
    const hash = crypto.createHash("sha256");
    for (const [label, bytes] of entries)
      hash.update(label, "ascii").update("\0").update(bytes).update("\0");
    return hash.digest("hex");
  }

  function digest(value: string): string {
    return EvidenceBenchmarkHash.bytes(value);
  }

  function expectInvalid(action: () => void, message: string): void {
    assert.throws(action, new RegExp(message, "i"));
  }
}
